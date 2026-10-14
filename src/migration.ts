import { DatabaseSync } from "node:sqlite";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { FileSystemAdapter } from "./adapters.js";
import type { SourceAdapter } from "./contracts.js";
import { hash, parseReport } from "./parser.js";

export interface MigrationCandidate {
  name: string;
  text: string;
  modified: string;
  origin?: string;
}
export interface MigrationResult {
  scanned: number;
  imported: number;
  updated: number;
  unchanged: number;
  superseded: number;
  failed: number;
  files: { name: string; hash: string; action: string }[];
  errors: { name: string; error: string }[];
  conflicts: { name: string; hashes: string[]; decision: string }[];
}
export async function adapterCandidates(adapter: SourceAdapter): Promise<{
  candidates: MigrationCandidate[];
  errors: MigrationResult["errors"];
}> {
  const candidates: MigrationCandidate[] = [],
    errors: MigrationResult["errors"] = [];
  for (const artifact of await adapter.scan()) {
    try {
      candidates.push({
        name: artifact.name,
        origin: artifact.id,
        text: (await adapter.fetch(artifact.id)).text,
        modified: artifact.modifiedTime,
      });
    } catch (e) {
      errors.push({ name: artifact.name, error: (e as Error).message });
    }
  }
  return { candidates, errors };
}
export async function filesystemCandidates(source: string) {
  const result = await adapterCandidates(new FileSystemAdapter(source));
  result.candidates = result.candidates.filter((c) =>
    /^PH_(FRONTIER|TRENDING|MARKET)_\d{4}-\d{2}-\d{2}\.json$/.test(c.name),
  );
  return result;
}

export function sqliteCandidates(path: string): MigrationCandidate[] {
  // Never call Store: its constructor runs DDL/PRAGMAs. Read-only connections also reject missing DBs.
  const db = new DatabaseSync(resolve(path), { readOnly: true });
  try {
    return (
      db
        .prepare(
          "SELECT channel,report_date,raw_json,source_modified_time FROM reports ORDER BY report_date,channel",
        )
        .all() as Record<string, string>[]
    ).map((row) => ({
      name: `PH_${row.channel.toUpperCase()}_${row.report_date}.json`,
      text: row.raw_json,
      modified: row.source_modified_time,
    }));
  } finally {
    db.close();
  }
}

export async function migrateCandidates(
  candidates: MigrationCandidate[],
  destination: string,
  apply = false,
): Promise<MigrationResult> {
  const result: MigrationResult = {
    scanned: candidates.length,
    imported: 0,
    updated: 0,
    unchanged: 0,
    superseded: 0,
    failed: 0,
    files: [],
    errors: [],
    conflicts: [],
  };
  const selected = new Map<
    string,
    MigrationCandidate & { generated: number }
  >();
  const ambiguous = new Set<string>();
  const { reportName } = await import("./adapters.js");
  for (const candidate of [...candidates].sort(
    (a, b) =>
      (Date.parse(a.modified) || 0) - (Date.parse(b.modified) || 0) ||
      a.name.localeCompare(b.name),
  )) {
    try {
      const report = parseReport(candidate.text).report;
      const meta = reportName(candidate.name);
      if (
        !/^PH_(FRONTIER|TRENDING|MARKET)_\d{4}-\d{2}-\d{2}\.json$/.test(
          candidate.name,
        ) ||
        !meta ||
        meta.channel !== report.channel ||
        meta.date !== report.date
      )
        throw new Error("文件名与正文 channel/date 不一致");
      const name = `PH_${report.channel.toUpperCase()}_${report.date}.json`;
      const generated = Date.parse(report.generated_at);
      const previous = selected.get(name);
      if (previous && hash(previous.text) !== hash(candidate.text)) {
        const unknownRevision =
          !Number.isFinite(Date.parse(candidate.modified)) ||
          !Number.isFinite(Date.parse(previous.modified)) ||
          Date.parse(candidate.modified) === Date.parse(previous.modified);
        const conflict = previous.generated === generated && unknownRevision;
        result.conflicts.push({
          name,
          hashes: [hash(previous.text), hash(candidate.text)],
          decision: conflict
            ? "需要人工核验，未复制"
            : "依据 generated_at/源修订时间选取较新稿",
        });
        if (conflict) {
          ambiguous.add(name);
          result.failed++;
          result.errors.push({
            name,
            error: "相同生成时间且无可信修订顺序的不同正文，拒绝静默覆盖",
          });
        }
      }
      if (previous && previous.generated > generated) {
        result.superseded++;
        continue;
      }
      if (previous) result.superseded++;
      selected.set(name, { ...candidate, generated });
    } catch (e) {
      result.failed++;
      result.errors.push({ name: candidate.name, error: (e as Error).message });
    }
  }
  if (apply) await mkdir(destination, { recursive: true });
  for (const [name, candidate] of [...selected.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (ambiguous.has(name)) continue;
    try {
      const meta = reportName(name)!;
      const target = join(destination, meta.channel, name);
      let previous: string | undefined;
      try {
        previous = await readFile(target, "utf8");
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
      let action = "imported";
      if (previous !== undefined) {
        const old = parseReport(previous).report;
        const meta = reportName(name)!;
        if (old.channel !== meta.channel || old.date !== meta.date)
          throw new Error("目标已有文件的身份不匹配，拒绝覆盖");
        if (hash(previous) === hash(candidate.text)) action = "unchanged";
        else if (Date.parse(old.generated_at) > candidate.generated)
          action = "superseded";
        else if (Date.parse(old.generated_at) === candidate.generated)
          throw new Error("已有稿与候选同一生成时间但正文不同，需人工核验");
        else action = "updated";
      }
      if (apply && ["imported", "updated"].includes(action)) {
        await mkdir(join(destination, meta.channel), { recursive: true });
        const temporary = `${target}.${process.pid}.tmp`;
        await writeFile(temporary, candidate.text, { flag: "wx" });
        await rename(temporary, target);
      }
      result[action as "imported" | "updated" | "unchanged" | "superseded"]++;
      result.files.push({ name, hash: hash(candidate.text), action });
    } catch (e) {
      result.failed++;
      result.errors.push({ name, error: (e as Error).message });
    }
  }
  return result;
}
