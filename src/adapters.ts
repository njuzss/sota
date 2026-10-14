import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, relative, join } from "node:path";
import { GoogleAuth, OAuth2Client } from "google-auth-library";
import { hash, validDate } from "./parser.js";
import type {
  Channel,
  RawReport,
  SourceAdapter,
  SourceArtifact,
} from "./contracts.js";
import type { Config } from "./config.js";

export function reportName(
  name: string,
): { channel: Channel; date: string } | null {
  const match =
    /^PH_(FRONTIER|TRENDING|MARKET)_(\d{4}-\d{2}-\d{2})(?:\.(?:json|md|txt))?$/i.exec(
      name,
    );
  return match && validDate(match[2])
    ? { channel: match[1].toLowerCase() as Channel, date: match[2] }
    : null;
}
export class FileSystemAdapter implements SourceAdapter {
  readonly scope: string;
  private files = new Map<string, string>();
  constructor(
    readonly root: string,
    readonly type = "filesystem",
  ) {
    this.root = resolve(root);
    this.scope = `${type}:${this.root}`;
  }
  async scan(): Promise<SourceArtifact[]> {
    const artifacts: SourceArtifact[] = [],
      files = new Map<string, string>();
    const walk = async (dir: string) => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue;
        const path = join(dir, entry.name);
        if (entry.isDirectory()) await walk(path);
        else if (entry.isFile() && /\.(json|md|txt)$/i.test(entry.name)) {
          const meta = reportName(entry.name);
          if (!meta) continue;
          const id = relative(this.root, path),
            info = await stat(path);
          // Full scan + hash catches offline changes, including equal-size/equal-mtime edits.
          let revision: string;
          try {
            revision = hash(await readFile(path, "utf8"));
          } catch {
            revision = `unreadable:${info.mtimeMs}`;
          }
          files.set(id, path);
          artifacts.push({
            id,
            name: entry.name,
            revision,
            modifiedTime: info.mtime.toISOString(),
            mimeType: "application/json",
            ...meta,
          });
        }
      }
    };
    await walk(this.root);
    this.files = files;
    return artifacts;
  }
  async fetch(id: string): Promise<RawReport> {
    const path = this.files.get(id);
    if (!path) throw new Error("文件不在本次扫描范围中");
    return { text: await readFile(path, "utf8") };
  }
}

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  version?: string;
};
export interface GoogleTransport {
  list(
    query: string,
    pageToken?: string,
  ): Promise<{
    files: DriveFile[];
    nextPageToken?: string;
    incompleteSearch?: boolean;
  }>;
  document(id: string): Promise<unknown>;
  file(id: string): Promise<string>;
}
export function googleTransport(
  env: NodeJS.ProcessEnv = process.env,
): GoogleTransport {
  const scopes = ["https://www.googleapis.com/auth/drive.readonly"];
  let getToken: () => Promise<string>;
  if (env.GOOGLE_ACCESS_TOKEN) getToken = async () => env.GOOGLE_ACCESS_TOKEN!;
  else if (
    env.GOOGLE_REFRESH_TOKEN &&
    env.GOOGLE_CLIENT_ID &&
    env.GOOGLE_CLIENT_SECRET
  ) {
    const client = new OAuth2Client(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
    );
    client.setCredentials({ refresh_token: env.GOOGLE_REFRESH_TOKEN });
    getToken = async () => {
      const { token } = await client.getAccessToken();
      if (!token) throw new Error("Google OAuth 未返回 token");
      return token;
    };
  } else if (env.GOOGLE_APPLICATION_CREDENTIALS) {
    const auth = new GoogleAuth({
      keyFilename: env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes,
    });
    getToken = async () => {
      const token = await auth.getAccessToken();
      if (!token) throw new Error("服务账号未返回 token");
      return token;
    };
  } else
    getToken = async () => {
      throw new Error(
        "缺少 Google 只读凭据。配置 OAuth 后运行 npm run auth:google，或设置 GOOGLE_APPLICATION_CREDENTIALS。Codex 连接器的登录不会自动传给本地服务。",
      );
    };
  const request = async (url: string): Promise<Response> => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${await getToken()}` },
        signal: AbortSignal.timeout(20_000),
      });
      if (response.ok) return response;
      if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 2) {
        await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
        continue;
      }
      // Do not print request headers, tokens, or arbitrary upstream error bodies.
      throw new Error(
        `Google API HTTP ${response.status}${response.status === 401 ? "：凭据过期或无效" : response.status === 403 ? "：检查只读权限、API 启用状态和文件共享" : ""}`,
      );
    }
    throw new Error("Google 请求失败");
  };
  return {
    async list(q, pageToken) {
      const params = new URLSearchParams({
        q,
        pageSize: "1000",
        fields:
          "nextPageToken,incompleteSearch,files(id,name,mimeType,modifiedTime,version)",
        spaces: "drive",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
      });
      if (pageToken) params.set("pageToken", pageToken);
      return (
        await request(`https://www.googleapis.com/drive/v3/files?${params}`)
      ).json();
    },
    async document(id) {
      return (
        await request(
          `https://docs.googleapis.com/v1/documents/${encodeURIComponent(id)}?includeTabsContent=true`,
        )
      ).json();
    },
    async file(id) {
      return (
        await request(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`,
        )
      ).text();
    },
  };
}
type DocumentNode = {
  paragraph?: { elements?: { textRun?: { content?: string } }[] };
  table?: { tableRows?: { tableCells?: { content?: DocumentNode[] }[] }[] };
  sectionBreak?: unknown;
};
function bodyText(content: DocumentNode[] = []): string {
  return content
    .map((node) =>
      node.paragraph
        ? (node.paragraph.elements || [])
            .map((e) => e.textRun?.content || "")
            .join("")
        : node.table
          ? (node.table.tableRows || [])
              .flatMap((r) =>
                (r.tableCells || []).map((c) => bodyText(c.content)),
              )
              .join("")
          : "",
    )
    .join("");
}
export function extractGoogleDoc(document: unknown): RawReport {
  const doc = document as {
    revisionId?: string;
    body?: { content?: DocumentNode[] };
    tabs?: DocTab[];
  };
  type DocTab = {
    documentTab?: { body?: { content?: DocumentNode[] } };
    childTabs?: DocTab[];
  };
  const texts: string[] = [];
  const visit = (tabs: DocTab[]) =>
    tabs.forEach((tab) => {
      const text = bodyText(tab.documentTab?.body?.content).trim();
      if (text) texts.push(text);
      if (tab.childTabs) visit(tab.childTabs);
    });
  if (doc.tabs?.length) visit(doc.tabs);
  else {
    const text = bodyText(doc.body?.content).trim();
    if (text) texts.push(text);
  }
  if (texts.length !== 1)
    throw new Error(
      `Google Doc 必须只有一个非空正文 tab，当前为 ${texts.length}；避免把多个 JSON 拼接`,
    );
  return { text: texts[0], revision: doc.revisionId };
}
export class GoogleDocsAdapter implements SourceAdapter {
  readonly type = "google_docs";
  readonly scope: string;
  private files = new Map<string, DriveFile>();
  constructor(
    readonly folderId: string,
    private transport: GoogleTransport = googleTransport(),
  ) {
    this.scope = `google_docs:${folderId || "prefix:PH_*"}`;
  }
  async scan(): Promise<SourceArtifact[]> {
    const files: DriveFile[] = [];
    const quote = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const listAll = async (q: string) => {
      let token: string | undefined;
      const result: DriveFile[] = [];
      do {
        const page = await this.transport.list(q, token);
        if (page.incompleteSearch)
          throw new Error(
            "Drive 返回 incompleteSearch，本轮不会标记任何源文件缺失",
          );
        result.push(...page.files);
        token = page.nextPageToken;
      } while (token);
      return result;
    };
    if (this.folderId) {
      const pending = [this.folderId],
        seen = new Set<string>();
      while (pending.length) {
        const folder = pending.shift()!;
        if (seen.has(folder)) continue;
        seen.add(folder);
        for (const file of await listAll(
          `trashed = false and '${quote(folder)}' in parents`,
        )) {
          if (file.mimeType === "application/vnd.google-apps.folder")
            pending.push(file.id);
          else files.push(file);
        }
      }
    } else
      files.push(
        ...(await listAll(
          "trashed = false and (name contains 'PH_FRONTIER_' or name contains 'PH_TRENDING_' or name contains 'PH_MARKET_')",
        )),
      );
    const artifacts: SourceArtifact[] = [],
      supported = new Set([
        "application/vnd.google-apps.document",
        "application/json",
        "text/plain",
        "text/markdown",
      ]);
    const mapping = new Map<string, DriveFile>();
    for (const file of files) {
      const meta = reportName(file.name);
      if (!meta || !supported.has(file.mimeType)) continue;
      mapping.set(file.id, file);
      artifacts.push({
        id: file.id,
        name: file.name,
        revision: `${file.version || ""}:${file.modifiedTime}`,
        modifiedTime: file.modifiedTime,
        mimeType: file.mimeType,
        ...meta,
      });
    }
    this.files = mapping;
    return artifacts;
  }
  async fetch(id: string): Promise<RawReport> {
    const file = this.files.get(id);
    if (!file) throw new Error("Drive 文件不在本次扫描范围");
    return file.mimeType === "application/vnd.google-apps.document"
      ? extractGoogleDoc(await this.transport.document(id))
      : { text: await this.transport.file(id) };
  }
}
export function createAdapter(config: Config): SourceAdapter {
  return config.sourceAdapter === "google_docs"
    ? new GoogleDocsAdapter(config.driveFolderId)
    : new FileSystemAdapter(config.sourceDir, config.sourceAdapter);
}
