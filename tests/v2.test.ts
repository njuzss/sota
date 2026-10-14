import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildPublication } from "../src/build-publication.js";
import { migrateCandidates } from "../src/migration.js";
import { createPublicationClient } from "../web/publication-client.js";
const raw = await readFile(
  "fixtures/reports/PH_FRONTIER_2026-10-03.json",
  "utf8",
);
const live = JSON.stringify({
  ...JSON.parse(raw),
  title: "Production-compatible test report",
});
async function paths(t: any) {
  const dir = await mkdtemp(join(tmpdir(), "sota-spec-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const source = join(dir, "reports"),
    output = join(dir, "publication");
  await mkdir(join(source, "frontier"), { recursive: true });
  return { dir, source, output };
}
test("formal repository paths are enforced, bad files isolated, and valid history still published", async (t) => {
  const { source, output } = await paths(t);
  await writeFile(join(source, "frontier/PH_FRONTIER_2026-10-03.json"), live);
  await writeFile(
    join(source, "frontier/PH_FRONTIER_2026-10-04.json"),
    "broken",
  );
  await mkdir(join(source, "trending"));
  await writeFile(
    join(source, "trending/PH_FRONTIER_2026-10-05.json"),
    JSON.stringify({ ...JSON.parse(live), date: "2026-10-05" }),
  );
  const { manifest } = await buildPublication(source, output);
  assert.deepEqual(manifest.dates, ["2026-10-03"]);
  assert.equal(manifest.validation.invalid_reports, 2);
  assert.equal(manifest.archive[0].counts.trending, null);
  const status = JSON.parse(
    await readFile(join(output, manifest.root, "status.json"), "utf8"),
  );
  assert.equal(status.errors.length, 2);
  assert.ok(
    status.errors.some(
      (e: any) => e.source_id === "trending/PH_FRONTIER_2026-10-05.json",
    ),
  );
});
test("fixture bytes cannot be published through production report directories", async (t) => {
  const { source, output } = await paths(t);
  await writeFile(join(source, "frontier/PH_FRONTIER_2026-10-03.json"), raw);
  await assert.rejects(
    buildPublication(source, output, { demo: false, allowEmpty: true }),
    /有效日报/,
  );
});
test("empty source publishes an honest empty state; malformed-only source preserves it", async (t) => {
  const { source, output } = await paths(t);
  const { manifest } = await buildPublication(source, output, {
    demo: false,
    allowEmpty: true,
  });
  assert.equal(manifest.latest, null);
  assert.equal(manifest.validation.valid_reports, 0);
  assert.ok(Date.parse(manifest.built_at));
  assert.equal(manifest.build_version, 2);
  const before = await readFile(join(output, "manifest.json"), "utf8");
  await writeFile(
    join(source, "frontier/PH_FRONTIER_2026-10-03.json"),
    "broken",
  );
  await assert.rejects(
    buildPublication(source, output, { demo: false, allowEmpty: true }),
  );
  assert.equal(await readFile(join(output, "manifest.json"), "utf8"), before);
});
test("same generation and revision with differing migration bodies produces a conflict, not an overwrite", async (t) => {
  const { output } = await paths(t);
  const a = {
    name: "PH_FRONTIER_2026-10-03.json",
    text: live,
    modified: "2026-10-03T08:00:00Z",
  };
  const b = {
    ...a,
    text: JSON.stringify({
      ...JSON.parse(live),
      summary: "Another competing revision",
    }),
  };
  const result = await migrateCandidates([a, b], output, true);
  assert.equal(result.failed, 1);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.imported, 0);
  await assert.rejects(readFile(join(output, "frontier", a.name)));
});
test("reader diagnostics distinguish build time, unknown deploy completion, per-channel latest and source errors", async (t) => {
  const { source, output } = await paths(t);
  await writeFile(join(source, "frontier/PH_FRONTIER_2026-10-03.json"), live);
  const { manifest } = await buildPublication(source, output);
  const client = createPublicationClient(
    "/sota/",
    (async (url: string) =>
      new Response(
        await readFile(join(output, url.slice("/sota/data/".length)), "utf8"),
      )) as typeof fetch,
  );
  const status = await client<any>("/api/status");
  assert.equal(status.built_at, manifest.built_at);
  assert.equal(status.deployed_at, null);
  assert.equal(status.channel_latest.frontier, "2026-10-03");
  assert.equal(status.channel_latest.market, null);
  assert.equal(status.missing_days.length, 1);
  assert.match(status.actions_url, /njuzss\/sota/);
});
test("two independently submitted channels survive one build and same-day revision retains the earlier snapshot", async (t) => {
  const { source, output } = await paths(t);
  const older = {
    ...JSON.parse(live),
    date: "2026-10-02",
    generated_at: "2026-10-02T08:00:00+08:00",
  };
  await writeFile(
    join(source, "frontier/PH_FRONTIER_2026-10-02.json"),
    JSON.stringify(older),
  );
  await writeFile(join(source, "frontier/PH_FRONTIER_2026-10-03.json"), live);
  await mkdir(join(source, "market"));
  const market = JSON.parse(
    await readFile("fixtures/reports/PH_MARKET_2026-10-03.json", "utf8"),
  );
  market.title = "Production market example";
  await writeFile(
    join(source, "market/PH_MARKET_2026-10-03.json"),
    JSON.stringify(market),
  );
  const first = await buildPublication(source, output);
  assert.equal(first.manifest.validation.valid_reports, 3);
  const snapshot = JSON.parse(
    await readFile(
      join(output, first.manifest.root, "day/2026-10-02.json"),
      "utf8",
    ),
  );
  const revision = {
    ...JSON.parse(live),
    generated_at: "2026-10-03T12:00:00+08:00",
    summary: "Revised once",
  };
  await writeFile(
    join(source, "frontier/PH_FRONTIER_2026-10-03.json"),
    JSON.stringify(revision),
  );
  const second = await buildPublication(source, output);
  assert.equal(second.manifest.validation.valid_reports, 3);
  const day = JSON.parse(
    await readFile(
      join(output, second.manifest.root, "day/2026-10-03.json"),
      "utf8",
    ),
  );
  assert.equal(day.reports.frontier.summary, "Revised once");
  assert.equal(day.reports.market.body.market_open, false);
  const after = JSON.parse(
    await readFile(
      join(output, second.manifest.root, "day/2026-10-02.json"),
      "utf8",
    ),
  );
  assert.deepEqual(
    after.reports.frontier.items,
    snapshot.reports.frontier.items,
  );
});
