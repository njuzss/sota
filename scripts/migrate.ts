import { resolve, relative, sep, isAbsolute } from "node:path";
import { knownFixtureHashes } from "../src/report-source.js";
import { hash } from "../src/parser.js";
import { homedir } from "node:os";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import {
  filesystemCandidates,
  sqliteCandidates,
  migrateCandidates,
} from "../src/migration.js";

const args = process.argv.slice(2);
const value = (flag: string, fallback?: string) => {
  const i = args.indexOf(flag);
  if (i < 0) return fallback;
  if (!args[i + 1] || args[i + 1].startsWith("--"))
    throw new Error(`${flag} 需要一个路径`);
  return args[i + 1];
};
const source = resolve(
  value("--source", resolve(homedir(), "ai/docs/personal-hot"))!,
);
const dbPath = value("--db");
const output = resolve(value("--out", "data/migration/reports")!);
const inputReal = await realpath(dbPath ? resolve(dbPath) : source);
// Resolve an existing parent too, so symlinked destinations cannot write into the old sources.
let parent = output,
  suffix: string[] = [];
const { dirname, basename, join } = await import("node:path");
while (true) {
  try {
    parent = await realpath(parent);
    break;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    suffix.unshift(basename(parent));
    parent = dirname(parent);
  }
}
const outputReal = join(parent, ...suffix);
const inside = (root: string, target: string) => {
  const path = relative(root, target);
  return (
    path === "" ||
    (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path))
  );
};
if (!dbPath && inside(inputReal, outputReal))
  throw new Error("迁移输出不能位于源目录内部");
if (dbPath && inside(dirname(inputReal), outputReal))
  throw new Error("迁移输出不能覆盖旧数据库目录");
const collected = dbPath
  ? { candidates: sqliteCandidates(inputReal), errors: [] }
  : await filesystemCandidates(inputReal);
const fixtureHashes = await knownFixtureHashes();
collected.candidates = collected.candidates.filter((candidate) => {
  if (!fixtureHashes.has(hash(candidate.text))) return true;
  collected.errors.push({
    name: candidate.name,
    error: "已知 fixture，禁止迁入正式稿库",
  });
  return false;
});
const result = await migrateCandidates(
  collected.candidates,
  outputReal,
  args.includes("--apply"),
);
result.errors.push(...collected.errors);
result.failed += collected.errors.length;
result.scanned += collected.errors.length;
await mkdir(resolve("data/migration"), { recursive: true });
await writeFile(
  resolve("data/migration/manifest.json"),
  JSON.stringify(
    {
      version: 1,
      run_at: new Date().toISOString(),
      apply: args.includes("--apply"),
      ...result,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(result, null, 2));
if (result.failed) process.exitCode = 1;
