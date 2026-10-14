import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import {
  parseReport,
  validDate,
  stableKey,
  canonicalUrl,
} from "../src/parser.js";
import { Store } from "../src/db.js";
import { PublicationService } from "../src/publication.js";
import { SyncService } from "../src/importer.js";
import {
  FileSystemAdapter,
  GoogleDocsAdapter,
  extractGoogleDoc,
  googleTransport,
  type GoogleTransport,
} from "../src/adapters.js";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { directImages } from "../src/image-service.js";
import type {
  RawReport,
  SourceAdapter,
  SourceArtifact,
} from "../src/contracts.js";

const fixtureDir = resolve("fixtures/reports");
const rawFixture = await readFile(
  join(fixtureDir, "PH_FRONTIER_2026-10-03.json"),
  "utf8",
);
const fixture = JSON.parse(rawFixture);
class MemoryAdapter implements SourceAdapter {
  readonly type = "test";
  readonly scope = "test:memory";
  entries = new Map<string, { artifact: SourceArtifact; text: string }>();
  scans = 0;
  fetches = 0;
  scanError = false;
  put(id: string, text: string, revision = "1") {
    const artifact = {
      id,
      name: id,
      revision,
      modifiedTime: `2026-10-03T${revision === "1" ? "08" : "12"}:00:00Z`,
      mimeType: "application/json",
    };
    this.entries.set(id, { artifact, text });
  }
  async scan() {
    this.scans++;
    if (this.scanError) throw new Error("offline");
    return [...this.entries.values()].map((e) => e.artifact);
  }
  async fetch(id: string): Promise<RawReport> {
    this.fetches++;
    return { text: this.entries.get(id)!.text };
  }
}
function memory(t: any) {
  const store = new Store(":memory:");
  t.after(() => store.close());
  return store;
}
test("default production source is the local synced directory and demo stays isolated", () => {
  const config = loadConfig({}, { demo: false });
  assert.equal(config.sourceAdapter, "filesystem");
  assert.equal(config.sourceDir, resolve(homedir(), "ai/docs/personal-hot"));
  assert.equal(config.dataDir, resolve("data/local"));
  assert.equal(config.syncInterval, 300);
  const demo = loadConfig(
    {
      SOURCE_ADAPTER: "google_docs",
      SOURCE_DIR: "/unused",
      DATA_DIR: "/unused",
      SYNC_INTERVAL_SECONDS: "600",
    },
    { demo: true },
  );
  assert.equal(demo.sourceAdapter, "fixture");
  assert.equal(demo.sourceDir, fixtureDir);
  assert.equal(demo.dataDir, resolve("data/demo"));
  assert.equal(demo.syncInterval, 0);
});
test("local source imports ordinary JSON and ignores reading Markdown and unrelated documents", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "sota-local-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, "frontier"));
  await writeFile(
    join(dir, "frontier/PH_FRONTIER_2026-10-03.json"),
    rawFixture,
  );
  await writeFile(
    join(dir, "PH_FRONTIER_2026-10-03.reading.md"),
    "# 阅读版正文",
  );
  await writeFile(join(dir, "other.json"), "not a report");
  await writeFile(join(dir, "PH_FRONTIER_2026-10-03.gdoc"), "pointer");
  const store = memory(t),
    adapter = new FileSystemAdapter(dir);
  const sync = new SyncService(store, adapter);
  assert.equal((await sync.sync()).imported, 1);
  assert.equal((await sync.sync()).unchanged, 1);
  assert.equal(new PublicationService(store).latest()!.demo, false);
});
async function seed(t: any) {
  const store = memory(t),
    adapter = new FileSystemAdapter(fixtureDir, "fixture");
  const sync = new SyncService(store, adapter);
  await sync.sync();
  return { store, adapter, sync, publication: new PublicationService(store) };
}

test("publication images never load directly from Google Drive", () => {
  assert.equal(
    directImages.url("https://drive.google.com/thumbnail?id=x"),
    null,
  );
  assert.equal(directImages.url("https://docs.google.com/document/d/x"), null);
  assert.equal(directImages.url("https://lh3.googleusercontent.com/x"), null);
  assert.equal(
    directImages.url("https://example.com/image.png"),
    "https://example.com/image.png",
  );
});

test("all 14 fixture reports parse; 5 days include missing channel, holiday and null metrics", async (t) => {
  const { store, publication } = await seed(t);
  assert.equal(store.get("SELECT COUNT(*) n FROM reports")!.n, 14);
  assert.equal(publication.archive().length, 5);
  assert.equal(publication.day("2026-10-02")!.reports.trending, undefined);
  assert.equal(
    publication.day("2026-10-03")!.reports.market!.body.channel,
    "market",
  );
  const body = publication.day("2026-10-03")!.reports.market!.body;
  assert.ok(
    body.channel === "market" &&
      !body.market_open &&
      body.metrics.turnover === null,
  );
});
test("strict JSON and version/channel/date/top-level validation reject whole report", () => {
  for (const raw of [
    JSON.stringify({ ...fixture, schema_version: 2 }),
    JSON.stringify({ ...fixture, channel: "unknown" }),
    JSON.stringify({ ...fixture, date: "2026-02-30" }),
    JSON.stringify({ ...fixture, generated_at: "2026-10-03" }),
    JSON.stringify({ ...fixture, items: {} }),
    `\`\`\`json\n${rawFixture}\n\`\`\``,
  ])
    assert.throws(() => parseReport(raw));
  assert.equal(validDate("2024-02-29"), true);
  assert.equal(validDate("2026-02-29"), false);
});
test("incomplete item fields warn; malformed URLs/times safely normalize to null", async () => {
  const { report, warnings } = parseReport(
    await readFile("fixtures/cases/null-fields.json", "utf8"),
  );
  assert.ok(warnings.length > 3);
  assert.ok(report.channel !== "market" && report.items.length === 1);
  const result = parseReport(
    JSON.stringify({
      ...fixture,
      items: [
        {
          title: "Unsafe",
          source_url: "javascript:alert(1)",
          image_url: "data:image/png,x",
          published_at: "bad",
          tags: [null, "AI", "AI"],
          evidence: "invented",
        },
        null,
      ],
    }),
  );
  assert.ok(result.report.channel !== "market");
  assert.equal(result.report.items[0].source_url, null);
  assert.equal(result.report.items[0].image_url, null);
  assert.deepEqual(result.report.items[0].tags, ["AI"]);
  assert.equal(result.report.items[0].published_at, null);
  assert.equal(result.report.items[0].evidence, null);
  assert.equal(result.report.items.length, 1);
});
test("canonical URL and deterministic identity deduplicate without model calls", () => {
  assert.equal(
    canonicalUrl("https://example.com/article/?utm_source=x&b=2&a=1#fragment"),
    "https://example.com/article?a=1&b=2",
  );
  const a = parseReport(rawFixture).report;
  assert.ok(a.channel !== "market");
  const i = a.items[0];
  assert.equal(
    stableKey(
      { ...i, source_url: "https://example.com/a?utm_source=x" },
      "frontier",
    ),
    stableKey({ ...i, source_url: "https://example.com/a#b" }, "frontier"),
  );
  assert.equal(
    stableKey(
      { ...i, source_url: null, extra: { repo: "Vitejs/Vite" } },
      "trending",
    ),
    stableKey(
      { ...i, source_url: null, extra: { repo: "vitejs/vite" } },
      "trending",
    ),
  );
});
test("shared portal homepages do not merge distinct projects; specific URLs still deduplicate", () => {
  const item = {
    ...fixture.items[0],
    source_url: "https://www.producthunt.com/",
    extra: {},
  };
  const parsed = parseReport(
    JSON.stringify({
      ...fixture,
      channel: "trending",
      top_picks: [],
      items: [
        { ...item, title: "Project Alpha" },
        { ...item, title: "Project Beta" },
      ],
    }),
  );
  assert.ok(parsed.report.channel === "trending");
  assert.equal(parsed.report.items.length, 2);
  assert.notEqual(
    stableKey(parsed.report.items[0], "trending"),
    stableKey(parsed.report.items[1], "trending"),
  );
  const repoItem = {
    ...item,
    title: "Project Alpha",
    extra: { repo: "owner/repo" },
  };
  assert.equal(
    stableKey(repoItem, "trending"),
    stableKey({ ...repoItem, title: "Renamed project" }, "trending"),
  );
  const specific = {
    ...item,
    source_url: "https://www.producthunt.com/products/alpha",
  };
  const duplicate = parseReport(
    JSON.stringify({
      ...fixture,
      items: [
        { ...specific, title: "Alpha" },
        { ...specific, title: "Alpha updated" },
      ],
    }),
  );
  assert.ok(duplicate.report.channel !== "market");
  assert.equal(duplicate.report.items.length, 1);
  assert.equal(
    stableKey(
      { ...item, source_url: "https://product.example/", title: "Project" },
      "trending",
    ),
    stableKey(
      { ...item, source_url: "https://product.example/", title: "Renamed" },
      "trending",
    ),
  );
});
test("Top picks are capped at 3 and must reference an item", async () => {
  const raw = JSON.parse(
    await readFile(join(fixtureDir, "PH_TRENDING_2026-10-03.json"), "utf8"),
  );
  raw.top_picks = [
    "missing/repo",
    "vitejs/vite",
    "fastify/fastify",
    "drizzle-team/drizzle-orm",
    "一个没有 GitHub 指标的工具",
  ];
  const result = parseReport(JSON.stringify(raw));
  assert.ok(result.report.channel === "trending");
  assert.equal(result.report.top_picks.length, 3);
  assert.ok(result.warnings.some((w) => w.path === "top_picks"));
});
test("same channel + date UPSERT replaces item membership, raw JSON and FTS in one transaction", async (t) => {
  const store = memory(t),
    adapter = new MemoryAdapter(),
    sync = new SyncService(store, adapter);
  adapter.put("original", rawFixture);
  await sync.sync();
  const before = store.get("SELECT * FROM reports")!;
  const updated = await readFile("fixtures/cases/update-frontier.json", "utf8");
  adapter.put("second-copy", updated, "2");
  const result = await sync.sync();
  assert.equal(result.updated, 1);
  assert.equal(store.get("SELECT COUNT(*) n FROM reports")!.n, 1);
  const after = store.get("SELECT * FROM reports")!;
  assert.equal(after.id, before.id);
  assert.equal(after.raw_json, updated);
  assert.equal(after.created_at, before.created_at);
  assert.equal(
    new PublicationService(store).latest()!.reports.frontier!.items.length,
    2,
  );
  assert.equal(new PublicationService(store).search("宏观").length, 0);
});
test("revision skip avoids refetch; changed revision and identical hash update source metadata only", async (t) => {
  const store = memory(t),
    adapter = new MemoryAdapter(),
    sync = new SyncService(store, adapter);
  adapter.put("one", rawFixture);
  await sync.sync();
  assert.equal((await sync.sync()).unchanged, 1);
  assert.equal(adapter.fetches, 1);
  adapter.put("one", rawFixture, "2");
  assert.equal((await sync.sync()).unchanged, 1);
  assert.equal(adapter.fetches, 2);
  assert.equal(
    store.get("SELECT source_revision FROM reports")!.source_revision,
    "2",
  );
});
test("failed import is retried even when scan revision is unchanged; bad file does not block others", async (t) => {
  const store = memory(t),
    adapter = new MemoryAdapter(),
    sync = new SyncService(store, adapter);
  adapter.put("bad", "{bad");
  adapter.put("good", rawFixture);
  const result = await sync.sync();
  assert.equal(result.failed, 1);
  assert.equal(result.imported, 1);
  assert.equal(
    store.get("SELECT last_success_at FROM sync_state WHERE source_id='bad'")!
      .last_success_at,
    null,
  );
  adapter.put("bad", JSON.stringify({ ...fixture, date: "2026-10-04" }));
  assert.equal((await sync.sync()).imported, 1);
  assert.equal(
    store.get("SELECT last_error FROM sync_state WHERE source_id='bad'")!
      .last_error,
    null,
  );
});
test("old duplicate cannot regress a newer report", async (t) => {
  const store = memory(t),
    adapter = new MemoryAdapter(),
    sync = new SyncService(store, adapter);
  adapter.put(
    "new",
    await readFile("fixtures/cases/update-frontier.json", "utf8"),
    "2",
  );
  await sync.sync();
  adapter.put("old", rawFixture, "3");
  await sync.sync();
  assert.match(store.get("SELECT title FROM reports")!.title, /修订版/);
});
test("missing source keeps history; scan failure never marks sources missing; reappearance clears flag", async (t) => {
  const store = memory(t),
    adapter = new MemoryAdapter(),
    sync = new SyncService(store, adapter);
  adapter.put("one", rawFixture);
  await sync.sync();
  adapter.scanError = true;
  await sync.sync();
  assert.equal(
    store.get("SELECT source_missing FROM reports")!.source_missing,
    0,
  );
  adapter.scanError = false;
  adapter.entries.clear();
  await sync.sync();
  assert.equal(
    store.get("SELECT source_missing FROM reports")!.source_missing,
    1,
  );
  assert.equal(
    new PublicationService(store).latest()!.reports.frontier!.items.length,
    4,
  );
  adapter.put("one", rawFixture);
  await sync.sync();
  assert.equal(
    store.get("SELECT source_missing FROM reports")!.source_missing,
    0,
  );
});
test("shared items retain per-day snapshots and deterministic continuity", async (t) => {
  const { publication } = await seed(t);
  const old = publication.day("2026-09-28")!.reports.trending!.items[0],
    latest = publication.day("2026-10-03")!.reports.trending!.items[0];
  assert.equal(old.id, latest.id);
  assert.equal(old.extra.github_stars, null);
  assert.equal(latest.extra.github_stars, 10400);
  assert.equal(latest.appearances, 4);
  assert.equal(latest.first_seen, "2026-09-28");
});
test("navigation chooses existing dates and never substitutes missing channels", async (t) => {
  const { publication } = await seed(t);
  assert.equal(publication.day("2026-09-29")!.next, "2026-10-01");
  assert.equal(publication.day("2026-10-01")!.prev, "2026-09-29");
  assert.equal(publication.day("2026-09-30"), null);
  assert.equal(publication.latest()!.date, "2026-10-03");
  assert.equal(publication.latest()!.next, null);
  assert.equal(publication.day("2026-10-02")!.complete, false);
});
test("SQLite FTS finds Chinese/English/tags/market; query punctuation cannot inject SQL or MATCH operators", async (t) => {
  const { publication, store } = await seed(t);
  assert.ok(publication.search("本地").length > 0);
  assert.ok(publication.search("循证").length > 0);
  assert.ok(publication.search("SQLite").length > 0);
  assert.ok(publication.search("Vite").length > 0);
  assert.ok(publication.search("量能").some((r) => r.channel === "market"));
  for (const q of [
    '" OR *',
    "'; DROP TABLE reports;--",
    "()^ NEAR",
    "*",
    "   ",
  ])
    assert.doesNotThrow(() => publication.search(q));
  const previous = publication.search("SQLite");
  store.rebuildSearch();
  assert.deepEqual(publication.search("SQLite"), previous);
  assert.equal(store.get("SELECT COUNT(*) n FROM reports")!.n, 14);
});
test("transaction failure rolls back report, links and search index", async (t) => {
  const store = memory(t),
    adapter = new MemoryAdapter(),
    sync = new SyncService(store, adapter);
  adapter.put("one", rawFixture);
  await sync.sync();
  store.db.exec(
    "CREATE TRIGGER reject_import BEFORE INSERT ON report_items BEGIN SELECT RAISE(ABORT,'simulated failure'); END;",
  );
  adapter.put(
    "one",
    await readFile("fixtures/cases/update-frontier.json", "utf8"),
    "2",
  );
  assert.equal((await sync.sync()).failed, 1);
  assert.equal(store.get("SELECT raw_json FROM reports")!.raw_json, rawFixture);
  assert.equal(
    new PublicationService(store).latest()!.reports.frontier!.items.length,
    4,
  );
});
test("raw source envelope survives invalid JSON and importer errors", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "sota-raw-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = memory(t),
    adapter = new MemoryAdapter();
  adapter.put("bad", "broken");
  await new SyncService(store, adapter, dir).sync();
  const { readdir } = await import("node:fs/promises");
  const files = await readdir(dir);
  assert.equal(files.length, 1);
  assert.equal(
    JSON.parse(await readFile(join(dir, files[0]), "utf8")).raw_text,
    "broken",
  );
});
test("publication APIs never scan/fetch sources, and POSTs reject cross-origin/simple requests", async (t) => {
  const store = memory(t),
    adapter = new MemoryAdapter(),
    sync = new SyncService(store, adapter);
  adapter.put("one", rawFixture);
  await sync.sync();
  adapter.scanError = true;
  const app = await createApp(loadConfig(), store, sync, false);
  t.after(() => app.close());
  for (const path of [
    "/api/day/latest",
    "/api/day/2026-10-03",
    "/api/archive",
    "/api/channel/frontier",
    "/api/search?q=本地",
    "/api/status",
  ])
    assert.equal((await app.inject(path)).statusCode, 200);
  assert.equal(adapter.scans, 1);
  assert.equal(adapter.fetches, 1);
  assert.equal((await app.inject("/api/day/2026-02-30")).statusCode, 400);
  assert.equal((await app.inject("/api/channel/unknown")).statusCode, 404);
  assert.equal((await app.inject("/api/day/2026-10-02")).statusCode, 404);
  assert.equal(
    (await app.inject({ method: "POST", url: "/api/sync" })).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/sync",
        headers: {
          origin: "https://evil.example",
          "content-type": "application/json",
        },
        payload: "{}",
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        url: "/api/status",
        headers: { host: "evil.example" },
      })
    ).statusCode,
    403,
  );
  const result = await app.inject({
    method: "POST",
    url: "/api/sync",
    headers: { "content-type": "application/json" },
    payload: "{}",
  });
  assert.equal(result.statusCode, 207);
  assert.equal((await app.inject("/api/day/latest")).statusCode, 200);
});
test("Google Docs extraction handles text runs, legacy body, tables, child tabs and rejects ambiguous multi-tab docs", () => {
  const content = (text: string) => [
    { paragraph: { elements: [{ textRun: { content: text } }] } },
  ];
  assert.equal(
    extractGoogleDoc({ body: { content: content(rawFixture) } }).text,
    rawFixture.trim(),
  );
  assert.equal(
    extractGoogleDoc({
      revisionId: "r2",
      tabs: [
        {
          childTabs: [
            { documentTab: { body: { content: content(rawFixture) } } },
          ],
        },
      ],
    }).revision,
    "r2",
  );
  assert.equal(
    extractGoogleDoc({
      body: {
        content: [
          {
            table: {
              tableRows: [{ tableCells: [{ content: content(rawFixture) }] }],
            },
          },
        ],
      },
    }).text,
    rawFixture.trim(),
  );
  assert.throws(() =>
    extractGoogleDoc({
      tabs: [
        { documentTab: { body: { content: content("{}") } } },
        { documentTab: { body: { content: content("{}") } } },
      ],
    }),
  );
});
test("Google Drive adapter recursively paginates, filters by prefix, reads Docs and ordinary JSON, and skips unchanged docs", async (t) => {
  const calls: string[] = [];
  let revision = "v1";
  const transport: GoogleTransport = {
    async list(q, token) {
      calls.push(q + ":" + (token || ""));
      if (q.includes("'root-id'"))
        return {
          files: [
            {
              id: "child-id",
              name: "frontier",
              mimeType: "application/vnd.google-apps.folder",
              modifiedTime: "2026-10-03T00:00:00Z",
            },
          ],
        };
      if (!token)
        return {
          files: [
            {
              id: "doc-id",
              name: "PH_FRONTIER_2026-10-03",
              mimeType: "application/vnd.google-apps.document",
              modifiedTime: "2026-10-03T08:00:00Z",
              version: revision,
            },
          ],
          nextPageToken: "PAGE_TWO",
        };
      return {
        files: [
          {
            id: "json-id",
            name: "PH_FRONTIER_2026-10-04.json",
            mimeType: "application/json",
            modifiedTime: "2026-10-04T08:00:00Z",
          },
          {
            id: "ignored",
            name: "random-document",
            mimeType: "application/vnd.google-apps.document",
            modifiedTime: "",
          },
        ],
      };
    },
    async document(id) {
      calls.push("DOC:" + id);
      return {
        revisionId: revision,
        tabs: [
          {
            documentTab: {
              body: {
                content: [
                  {
                    paragraph: {
                      elements: [{ textRun: { content: rawFixture } }],
                    },
                  },
                ],
              },
            },
          },
        ],
      };
    },
    async file(id) {
      calls.push("FILE:" + id);
      return JSON.stringify({ ...fixture, date: "2026-10-04" });
    },
  };
  const store = memory(t),
    adapter = new GoogleDocsAdapter("root-id", transport),
    sync = new SyncService(store, adapter);
  assert.equal((await sync.sync()).imported, 2);
  assert.ok(calls.some((c) => c.endsWith("PAGE_TWO")));
  assert.equal((await sync.sync()).unchanged, 2);
  assert.equal(calls.filter((c) => c.startsWith("DOC:")).length, 1);
  revision = "v2";
  await sync.sync();
  assert.equal(calls.filter((c) => c.startsWith("DOC:")).length, 2);
  assert.equal(
    store.get(
      "SELECT source_revision FROM reports WHERE report_date='2026-10-03'",
    )!.source_revision,
    "v2",
  );
});
test("incomplete Google scan cannot mark source missing; filename/body mismatch fails individually", async (t) => {
  const store = memory(t);
  const transport: GoogleTransport = {
    list: async () => ({ files: [], incompleteSearch: true }),
    document: async () => ({}),
    file: async () => "",
  };
  const result = await new SyncService(
    store,
    new GoogleDocsAdapter("", transport),
  ).sync();
  assert.equal(result.failed, 1);
  const adapter = new MemoryAdapter();
  adapter.put("mismatch", rawFixture);
  adapter.entries.get("mismatch")!.artifact.date = "2026-10-04";
  assert.equal((await new SyncService(store, adapter).sync()).failed, 1);
  assert.equal(store.get("SELECT COUNT(*) n FROM reports")!.n, 0);
});
test("Google REST transport uses GET/read-only APIs with pagination and tab content", async (t) => {
  const calls: { url: string; init: RequestInit }[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(
      url.includes("alt=media")
        ? rawFixture
        : JSON.stringify(
            url.includes("drive/v3/files?") ? { files: [] } : { body: {} },
          ),
      { status: 200 },
    );
  });
  const transport = googleTransport({ GOOGLE_ACCESS_TOKEN: "TEST_TOKEN" });
  await transport.list("name contains 'PH_'", "next");
  await transport.document("doc-id");
  await transport.file("file-id");
  assert.ok(calls[0].url.includes("pageToken=next"));
  assert.ok(calls[1].url.includes("includeTabsContent=true"));
  assert.ok(calls[2].url.includes("alt=media"));
  assert.ok(calls.every((c) => !c.init.method || c.init.method === "GET"));
});
test("rebuild CLI can regenerate a lost database and preserves old DB on malformed source", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "sota-rebuild-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const env = {
    ...process.env,
    DATA_DIR: dir,
    SOURCE_ADAPTER: "fixture",
    SOURCE_DIR: fixtureDir,
  };
  execFileSync(process.execPath, ["--import", "tsx", "scripts/rebuild.ts"], {
    env,
    stdio: "pipe",
  });
  const original = new Store(join(dir, "sota.db"));
  assert.equal(original.get("SELECT COUNT(*) n FROM reports")!.n, 14);
  original.close();
  const bad = join(dir, "bad-source");
  await mkdir(bad);
  await writeFile(join(bad, "PH_FRONTIER_2026-10-03.json"), "broken");
  assert.throws(() =>
    execFileSync(process.execPath, ["--import", "tsx", "scripts/rebuild.ts"], {
      env: { ...env, SOURCE_DIR: bad },
      stdio: "pipe",
    }),
  );
  const retained = new Store(join(dir, "sota.db"));
  assert.equal(retained.get("SELECT COUNT(*) n FROM reports")!.n, 14);
  retained.close();
  await rm(join(dir, "sota.db"));
  execFileSync(process.execPath, ["--import", "tsx", "scripts/rebuild.ts"], {
    env,
    stdio: "pipe",
  });
  const recovered = new Store(join(dir, "sota.db"));
  assert.equal(recovered.get("SELECT COUNT(*) n FROM reports")!.n, 14);
  recovered.close();
});
