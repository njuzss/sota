import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type { RawReport, SourceAdapter, SourceArtifact } from "./contracts.js";
import { reportName } from "./adapters.js";
import { hash, parseReport } from "./parser.js";

export type ReportError = { source_id: string; error: string };
export class ReportDirectoryAdapter implements SourceAdapter {
  readonly type = "repository";
  readonly scope: string;
  errors: ReportError[] = [];
  private payloads = new Map<string, string>();
  constructor(
    readonly root: string,
    private fixtureHashes = new Set<string>(),
  ) {
    this.root = resolve(root);
    this.scope = `repository:${this.root}`;
  }
  async scan(): Promise<SourceArtifact[]> {
    this.errors = [];
    this.payloads.clear();
    const artifacts: SourceArtifact[] = [];
    const walk = async (dir: string) => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue;
        const path = join(dir, entry.name),
          id = relative(this.root, path).replaceAll("\\", "/");
        if (entry.isDirectory()) {
          await walk(path);
          continue;
        }
        if (!/^PH_.*\.json$/i.test(entry.name)) continue;
        try {
          if (!entry.isFile())
            throw new Error("日报必须是普通文件，不接受符号链接");
          const meta = reportName(entry.name);
          if (
            !meta ||
            entry.name !== `PH_${meta.channel.toUpperCase()}_${meta.date}.json`
          )
            throw new Error("日报文件名或日期不合法");
          if (id !== `${meta.channel}/${entry.name}`)
            throw new Error("目录频道、文件名必须一致，且不能嵌套其他子目录");
          const text = await readFile(path, "utf8");
          if (this.fixtureHashes.has(hash(text)))
            throw new Error("测试 fixture 不得作为正式日报发布");
          const { report } = parseReport(text);
          if (report.channel !== meta.channel || report.date !== meta.date)
            throw new Error("目录/文件名与 JSON channel/date 不一致");
          this.payloads.set(id, text);
          artifacts.push({
            id,
            name: entry.name,
            revision: hash(text),
            modifiedTime: report.generated_at,
            mimeType: "application/json",
            ...meta,
          });
        } catch (e) {
          this.errors.push({ source_id: id, error: (e as Error).message });
        }
      }
    };
    await walk(this.root);
    return artifacts;
  }
  async fetch(id: string): Promise<RawReport> {
    const text = this.payloads.get(id);
    if (text === undefined) throw new Error("日报不在本次构建快照中");
    return { text };
  }
}
export async function knownFixtureHashes(): Promise<Set<string>> {
  const root = resolve("fixtures/reports");
  const files = await readdir(root);
  return new Set(
    await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map(async (f) => hash(await readFile(join(root, f), "utf8"))),
    ),
  );
}
