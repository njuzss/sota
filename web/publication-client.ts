import type { PublicationStatus, AppStatus, Channel } from "../src/contracts";
import type { PublicationManifest } from "../src/static-publication";
import { searchDocuments, type SearchDocument } from "../src/search";

export function createPublicationClient(
  base: string,
  transport: typeof fetch = fetch,
) {
  const root = base.endsWith("/") ? base : `${base}/`;
  let manifestPromise: Promise<PublicationManifest> | undefined;
  const cache = new Map<string, Promise<unknown>>();
  async function load<T>(file: string): Promise<T> {
    let pending = cache.get(file);
    if (!pending) {
      pending = transport(`${root}data/${file}`).then(async (response) => {
        if (!response.ok) throw new Error("出版数据暂时不可用，请稍后刷新。");
        return response.json();
      });
      cache.set(file, pending);
      pending.catch(() => cache.delete(file));
    }
    return pending as Promise<T>;
  }
  async function manifest() {
    if (!manifestPromise)
      manifestPromise = load<PublicationManifest>("manifest.json")
        .then((value) => {
          if (
            value.version !== 1 ||
            !/^revisions\/[a-f0-9]{24}$/.test(value.root)
          )
            throw new Error("不支持的出版数据版本");
          return value;
        })
        .catch((error) => {
          manifestPromise = undefined;
          cache.delete("manifest.json");
          throw error;
        });
    return manifestPromise;
  }
  return async function api<T>(path: string, init?: RequestInit): Promise<T> {
    if (init?.method && init.method !== "GET")
      throw new Error("静态阅读站不提供写入操作。");
    init?.signal?.throwIfAborted();
    const url = new URL(path, "https://publication.invalid");
    const index = await manifest();
    const resource = (file: string) => load<T>(`${index.root}/${file}`);
    let result: unknown;
    if (url.pathname === "/api/archive")
      result = await resource("archive.json");
    else if (url.pathname === "/api/status") {
      const status = await load<AppStatus>(`${index.root}/status.json`);
      result = {
        ...status,
        built_at: index.built_at || null,
        commit: index.commit || null,
        deployed_at: null,
        channel_latest: Object.fromEntries(
          (["frontier", "trending", "market"] as Channel[]).map((c) => [
            c,
            index.archive?.find((day) => day.counts[c] !== null)?.date || null,
          ]),
        ) as PublicationStatus["channel_latest"],
        missing_days: index.archive?.filter((day) => !day.complete) || [],
        actions_url:
          "https://github.com/njuzss/sota/actions/workflows/deploy.yml",
        repository_url: "https://github.com/njuzss/sota",
      } satisfies PublicationStatus;
    } else if (url.pathname.startsWith("/api/day/")) {
      const key = url.pathname.slice("/api/day/".length);
      const date = key === "latest" ? index.latest : key;
      if (!date || !index.dates.includes(date))
        throw new Error("这一天还没有日报。");
      result = await resource(`day/${date}.json`);
    } else if (
      /^\/api\/channel\/(frontier|trending|market)$/.test(url.pathname)
    ) {
      result = await resource(`channel/${url.pathname.split("/").at(-1)}.json`);
    } else if (url.pathname === "/api/search") {
      const query = url.searchParams.get("q") || "";
      const docs = query.trim()
        ? (
            await Promise.all(
              index.search.map((shard) =>
                load<SearchDocument[]>(`${index.root}/${shard.file}`),
              ),
            )
          ).flat()
        : [];
      result = { results: searchDocuments(docs, query) };
    } else throw new Error("未知的出版资源。");
    init?.signal?.throwIfAborted();
    return result as T;
  };
}
export const api = createPublicationClient(import.meta.env?.BASE_URL || "/");
