import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  writeFile,
  mkdir,
  rm,
  cp,
  utimes,
  readdir,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { Store } from "../src/db.js";
import { FileSystemAdapter } from "../src/adapters.js";
import { SyncService } from "../src/importer.js";
import { PublicationService } from "../src/publication.js";
import { exportPublication } from "../src/static-publication.js";
import { buildPublication } from "../src/build-publication.js";
import {
  migrateCandidates,
  sqliteCandidates,
  filesystemCandidates,
} from "../src/migration.js";
import { createPublicationClient } from "../web/publication-client.js";
import { searchDocuments, type SearchDocument } from "../src/search.js";
import { hash } from "../src/parser.js";
import { createHash } from "node:crypto";

const fixtures = resolve("fixtures/reports");
const raw = await readFile(
  join(fixtures, "PH_FRONTIER_2026-10-03.json"),
  "utf8",
);
async function temp(t: any) {
  const dir = await mkdtemp(join(tmpdir(), "sota-v2-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
async function seed(t: any) {
  const store = new Store(":memory:");
  t.after(() => store.close());
  const result = await new SyncService(
    store,
    new FileSystemAdapter(fixtures, "fixture"),
  ).sync();
  assert.equal(result.failed, 0);
  return store;
}
test("static publication preserves missing channels, holiday, navigation and historical snapshots", async (t) => {
  const dir = await temp(t),
    store = await seed(t);
  const manifest = await exportPublication(store, dir, true);
  const json = async (file: string) =>
    JSON.parse(await readFile(join(dir, manifest.root, file), "utf8"));
  assert.equal(manifest.latest, "2026-10-03");
  assert.equal(manifest.dates.length, 5);
  const missing = await json("day/2026-10-02.json");
  assert.equal(missing.reports.trending, undefined);
  assert.equal(missing.complete, false);
  const old = await json("day/2026-09-28.json"),
    latest = await json("day/2026-10-03.json");
  assert.equal(old.next, "2026-09-29");
  assert.equal(latest.prev, "2026-10-02");
  assert.equal(old.reports.trending.items[0].extra.github_stars, null);
  assert.equal(latest.reports.trending.items[0].extra.github_stars, 10400);
  assert.equal(latest.reports.market.body.market_open, false);
  assert.equal(latest.reports.market.body.metrics.turnover, null);
  assert.equal(
    old.reports.trending.items[0].id,
    latest.reports.trending.items[0].id,
  );
  assert.equal((await json("channel/trending.json")).reports.length, 4);
});
test("public status contains no local paths, source IDs, raw envelopes or import logs", async (t) => {
  const dir = await temp(t),
    store = await seed(t),
    m = await exportPublication(store, dir);
  const status = await readFile(join(dir, m.root, "status.json"), "utf8");
  const day = await readFile(join(dir, m.root, "day/2026-10-03.json"), "utf8");
  for (const text of [status, day])
    for (const banned of [
      "/Users/",
      "source_file_id",
      'source_scope":"fixture:',
      "raw_json",
      "raw_text",
      "GOOGLE_REFRESH_TOKEN",
    ])
      assert.ok(!text.includes(banned));
  assert.equal(JSON.parse(status).imported_reports, 14);
});
test("browser search matches FTS membership for Chinese, English prefixes, tags, summaries and market outlook", async (t) => {
  const dir = await temp(t),
    store = await seed(t),
    m = await exportPublication(store, dir);
  const docs: SearchDocument[] = (
    await Promise.all(
      m.search.map((s) =>
        readFile(join(dir, m.root, s.file), "utf8").then(JSON.parse),
      ),
    )
  ).flat();
  const publication = new PublicationService(store);
  const identities = (rows: { href: string; title: string }[]) =>
    rows.map((r) => `${r.href.split("#")[0]}/${r.title}`).sort();
  for (const q of [
    "本地",
    "循证",
    "SQLite",
    "Vit",
    "量能",
    "回撤",
    "宏观",
    "报告",
    '" OR *',
    "*",
    "   ",
  ])
    assert.deepEqual(
      identities(searchDocuments(docs, q)),
      identities(publication.search(q)),
      q,
    );
});
test("static client resolves Pages subpath, shares cache, uses same-site JSON only and rejects writes", async (t) => {
  const dir = await temp(t),
    store = await seed(t);
  await exportPublication(store, dir, true);
  const requests: string[] = [];
  const client = createPublicationClient("/sota-v2/", (async (
    input: string,
  ) => {
    requests.push(input);
    assert.ok(input.startsWith("/sota-v2/data/"));
    try {
      return new Response(
        await readFile(join(dir, input.slice("/sota-v2/data/".length)), "utf8"),
      );
    } catch {
      return new Response("{}", { status: 404 });
    }
  }) as typeof fetch);
  const [latest, archive] = await Promise.all([
    client<any>("/api/day/latest"),
    client<any>("/api/archive"),
  ]);
  assert.equal(latest.date, "2026-10-03");
  assert.equal(archive.days.length, 5);
  await client("/api/day/latest");
  assert.equal(requests.filter((r) => r.endsWith("manifest.json")).length, 1);
  assert.equal(
    requests.filter((r) => r.endsWith("day/2026-10-03.json")).length,
    1,
  );
  await assert.rejects(client("/api/day/2026-09-30"), /没有日报/);
  await assert.rejects(client("/api/sync", { method: "POST" }), /写入/);
  assert.equal(
    requests.some((r) => r.includes("drive") || r.includes("/api/")),
    false,
  );
  assert.ok((await client<any>("/api/search?q=本地")).results.length);
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(client("/api/archive", { signal: aborted.signal }));
});
test("failed fetch can retry without poisoning manifest cache", async () => {
  let calls = 0;
  const manifest = {
    version: 1,
    root: `revisions/${"a".repeat(24)}`,
    dates: [],
    search: [],
    latest: null,
  };
  const client = createPublicationClient("/", (async (input: string) => {
    if (input.endsWith("manifest.json"))
      return ++calls === 1
        ? new Response("{}", { status: 503 })
        : new Response(JSON.stringify(manifest));
    return new Response('{"days":[]}');
  }) as typeof fetch);
  await assert.rejects(client("/api/archive"));
  assert.deepEqual(await client("/api/archive"), { days: [] });
  assert.equal(calls, 2);
});
test("build revision is reproducible despite checkout mtime changes and repeated imports", async (t) => {
  const dir = await temp(t),
    input = join(dir, "source"),
    output = join(dir, "data");
  await cp(fixtures, input, { recursive: true });
  const first = await buildPublication(input, output, {
    demo: true,
    allowEmpty: false,
  });
  for (const name of await readdir(input))
    await utimes(join(input, name), new Date(0), new Date(0));
  const second = await buildPublication(input, output, {
    demo: true,
    allowEmpty: false,
  });
  assert.equal(first.manifest.revision, second.manifest.revision);
  assert.equal(first.result.imported, 14);
});
test("bad or empty inputs preserve last successful static release", async (t) => {
  const dir = await temp(t),
    output = join(dir, "published"),
    input = join(dir, "input");
  await mkdir(input);
  await buildPublication(fixtures, output, { demo: true, allowEmpty: false });
  const previous = await readFile(join(output, "manifest.json"), "utf8");
  await assert.rejects(
    buildPublication(input, output, { demo: true, allowEmpty: false }),
    /空站/,
  );
  await writeFile(join(input, "PH_FRONTIER_2026-10-03.json"), "broken");
  await assert.rejects(
    buildPublication(input, output, { demo: true, allowEmpty: false }),
    /保留上一份/,
  );
  assert.equal(await readFile(join(output, "manifest.json"), "utf8"), previous);
  await rm(join(input, "PH_FRONTIER_2026-10-03.json"));
  assert.equal(
    (await buildPublication(input, output, { demo: false, allowEmpty: true }))
      .manifest.latest,
    null,
  );
});
test("migration dry-run preserves bytes; apply is idempotent and isolates invalid files", async (t) => {
  const dir = await temp(t),
    out = join(dir, "output");
  const candidate = {
    name: "PH_FRONTIER_2026-10-03.json",
    text: raw,
    modified: "2026-10-03T08:00:00Z",
  };
  const candidates = [
    candidate,
    { ...candidate, name: "PH_TRENDING_2026-10-03.json" },
    { ...candidate, name: "PH_FRONTIER_2026-10-04.json", text: "broken" },
  ];
  const plan = await migrateCandidates(candidates, out);
  assert.equal(plan.imported, 1);
  assert.equal(plan.failed, 2);
  await assert.rejects(readFile(join(out, "frontier", candidate.name)));
  assert.equal((await migrateCandidates(candidates, out, true)).imported, 1);
  assert.equal(
    await readFile(join(out, "frontier", candidate.name), "utf8"),
    raw,
  );
  assert.equal((await migrateCandidates([candidate], out, true)).unchanged, 1);
});
test("newest report wins; older duplicates never regress existing reports", async (t) => {
  const dir = await temp(t),
    updated = await readFile("fixtures/cases/update-frontier.json", "utf8");
  const candidate = {
    name: "PH_FRONTIER_2026-10-03.json",
    text: raw,
    modified: "2026-10-03T08:00:00Z",
  };
  const newer = {
    ...candidate,
    text: updated,
    modified: "2026-10-03T12:00:00Z",
  };
  assert.equal(
    (await migrateCandidates([newer, candidate], dir, true)).superseded,
    1,
  );
  assert.equal(
    await readFile(join(dir, "frontier", candidate.name), "utf8"),
    updated,
  );
  assert.equal((await migrateCandidates([candidate], dir, true)).superseded, 1);
  assert.equal(
    await readFile(join(dir, "frontier", candidate.name), "utf8"),
    updated,
  );
});
test("SQLite export opens read-only and preserves original raw JSON and DB bytes", async (t) => {
  const dir = await temp(t),
    path = join(dir, "v1.db");
  const store = new Store(path);
  await new SyncService(store, new FileSystemAdapter(fixtures)).sync();
  store.close();
  const before = createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
  const candidates = sqliteCandidates(path);
  assert.equal(candidates.length, 14);
  assert.equal(
    candidates.find((c) => c.name === "PH_FRONTIER_2026-10-03.json")!.text,
    raw,
  );
  assert.equal(
    createHash("sha256")
      .update(await readFile(path))
      .digest("hex"),
    before,
  );
  const db = new DatabaseSync(path, { readOnly: true });
  assert.throws(() => db.exec("DELETE FROM reports"));
  db.close();
  assert.equal(
    (await migrateCandidates(candidates, join(dir, "output"), true)).imported,
    14,
  );
});
test("filesystem collection ignores reading copies and leaves bad payload for isolated validation", async (t) => {
  const dir = await temp(t);
  await mkdir(join(dir, "nested"));
  await writeFile(join(dir, "nested/PH_FRONTIER_2026-10-03.json"), raw);
  await writeFile(join(dir, "PH_FRONTIER_2026-10-04.json"), "broken");
  await writeFile(join(dir, "PH_FRONTIER_2026-10-03.reading.md"), "reading");
  const collected = await filesystemCandidates(dir);
  assert.equal(collected.candidates.length, 2);
  const result = await migrateCandidates(
    collected.candidates,
    join(await temp(t), "out"),
  );
  assert.equal(result.failed, 1);
  assert.equal(result.imported, 1);
});

test("public item anchors stay stable when an earlier report is backfilled", async (t) => {
  const dir = await temp(t),
    source = join(dir, "source"),
    out = join(dir, "out");
  await mkdir(join(source, "frontier"), { recursive: true });
  const liveRaw = JSON.stringify({
    ...JSON.parse(raw),
    title: "Production example",
  });
  await writeFile(
    join(source, "frontier/PH_FRONTIER_2026-10-03.json"),
    liveRaw,
  );
  const first = await buildPublication(source, out);
  const before = JSON.parse(
    await readFile(
      join(out, first.manifest.root, "day/2026-10-03.json"),
      "utf8",
    ),
  );
  await writeFile(
    join(source, "frontier/PH_FRONTIER_2026-10-01.json"),
    JSON.stringify({
      ...JSON.parse(raw),
      date: "2026-10-01",
      generated_at: "2026-10-01T08:00:00+08:00",
      items: [
        {
          ...JSON.parse(raw).items[0],
          title: "Earlier distinct story",
          source_url: "https://example.com/earlier",
        },
      ],
    }),
  );
  const second = await buildPublication(source, out);
  const after = JSON.parse(
    await readFile(
      join(out, second.manifest.root, "day/2026-10-03.json"),
      "utf8",
    ),
  );
  assert.equal(
    before.reports.frontier.items[0].id,
    after.reports.frontier.items[0].id,
  );
  const shard = JSON.parse(
    await readFile(
      join(out, second.manifest.root, "search/frontier.json"),
      "utf8",
    ),
  );
  assert.ok(
    shard.some(
      (d: any) =>
        d.href === `/day/2026-10-03#item-${after.reports.frontier.items[0].id}`,
    ),
  );
});

test("migration CLI refuses nested and symlinked output inside sources before any write", async (t) => {
  const { execFileSync } = await import("node:child_process");
  const { symlink } = await import("node:fs/promises");
  const dir = await temp(t),
    input = join(dir, "input");
  await mkdir(input);
  await writeFile(join(input, "PH_FRONTIER_2026-10-03.json"), raw);
  const alias = join(dir, "alias");
  await symlink(input, alias);
  for (const output of [input, join(input, "..data"), alias]) {
    assert.throws(
      () =>
        execFileSync(
          process.execPath,
          [
            "--import",
            "tsx",
            "scripts/migrate.ts",
            "--source",
            input,
            "--out",
            output,
            "--apply",
          ],
          { stdio: "pipe" },
        ),
      (e: any) => String(e.stderr).includes("迁移输出不能位于源目录内部"),
    );
  }
  assert.deepEqual(await readdir(input), ["PH_FRONTIER_2026-10-03.json"]);
  assert.equal(
    await readFile(join(input, "PH_FRONTIER_2026-10-03.json"), "utf8"),
    raw,
  );
});
