import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  ImportWarning,
  ReportV1,
  SourceArtifact,
  SyncResult,
} from "./contracts.js";
import { stableKey } from "./parser.js";

export type Row = Record<string, any>;
import { searchTokens } from "./search.js";
export { searchTokens } from "./search.js";
export class Store {
  readonly db: DatabaseSync;
  constructor(readonly path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
    );
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY, channel TEXT NOT NULL, report_date TEXT NOT NULL,
        title TEXT NOT NULL, summary TEXT NOT NULL, schema_version INTEGER NOT NULL,
        generated_at TEXT NOT NULL, source_type TEXT NOT NULL, source_scope TEXT NOT NULL,
        source_file_id TEXT NOT NULL, source_revision TEXT NOT NULL, source_modified_time TEXT NOT NULL,
        content_hash TEXT NOT NULL, raw_json TEXT NOT NULL, normalized_json TEXT NOT NULL,
        warnings_json TEXT NOT NULL, source_missing INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL, imported_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        UNIQUE(channel, report_date)
      );
      CREATE INDEX IF NOT EXISTS reports_date ON reports(report_date DESC);
      CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY, stable_key TEXT UNIQUE NOT NULL,
        latest_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS report_items (
        report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
        item_id INTEGER NOT NULL REFERENCES items(id), position INTEGER NOT NULL,
        section TEXT NOT NULL, snapshot_json TEXT NOT NULL,
        PRIMARY KEY(report_id, item_id)
      );
      CREATE INDEX IF NOT EXISTS item_occurrences ON report_items(item_id);
      CREATE TABLE IF NOT EXISTS sync_state (
        source_scope TEXT NOT NULL, source_id TEXT NOT NULL, source_revision TEXT,
        content_hash TEXT, last_seen_at TEXT NOT NULL, last_success_at TEXT,
        last_error TEXT, PRIMARY KEY(source_scope, source_id)
      );
      CREATE TABLE IF NOT EXISTS sync_runs (
        id INTEGER PRIMARY KEY, source_scope TEXT NOT NULL, started_at TEXT NOT NULL,
        finished_at TEXT NOT NULL, successful INTEGER NOT NULL, result_json TEXT NOT NULL
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
        title UNINDEXED, summary UNINDEXED, why_it_matters UNINDEXED,
        tags UNINDEXED, source_name UNINDEXED, tokens,
        report_id UNINDEXED, item_id UNINDEXED, tokenize='unicode61'
      );
      PRAGMA user_version=1;
    `);
  }
  all(sql: string, ...params: (string | number | null)[]): Row[] {
    return this.db.prepare(sql).all(...params) as Row[];
  }
  get(sql: string, ...params: (string | number | null)[]): Row | undefined {
    return this.db.prepare(sql).get(...params) as Row | undefined;
  }
  run(sql: string, ...params: (string | number | null)[]) {
    return this.db.prepare(sql).run(...params);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  close() {
    this.db.close();
  }
  import(
    report: ReportV1,
    raw: string,
    artifact: SourceArtifact,
    source: { type: string; scope: string },
    contentHash: string,
    warnings: ImportWarning[],
  ): "IMPORTED" | "UPDATED" | "UNCHANGED" | "SUPERSEDED" {
    return this.transaction(() => {
      const now = new Date().toISOString();
      const previous = this.get(
        "SELECT * FROM reports WHERE channel=? AND report_date=?",
        report.channel,
        report.date,
      );
      if (
        previous &&
        (Date.parse(report.generated_at) < Date.parse(previous.generated_at) ||
          (Date.parse(report.generated_at) ===
            Date.parse(previous.generated_at) &&
            Date.parse(artifact.modifiedTime) <
              Date.parse(previous.source_modified_time)))
      )
        return "SUPERSEDED";
      if (previous?.content_hash === contentHash) {
        this.run(
          "UPDATE reports SET source_type=?,source_scope=?,source_file_id=?,source_revision=?,source_modified_time=?,source_missing=0 WHERE id=?",
          source.type,
          source.scope,
          artifact.id,
          artifact.revision,
          artifact.modifiedTime,
          previous.id,
        );
        return "UNCHANGED";
      }
      this.run(
        `INSERT INTO reports (channel,report_date,title,summary,schema_version,generated_at,source_type,source_scope,source_file_id,source_revision,source_modified_time,content_hash,raw_json,normalized_json,warnings_json,created_at,imported_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(channel,report_date) DO UPDATE SET title=excluded.title,summary=excluded.summary,
        schema_version=excluded.schema_version,generated_at=excluded.generated_at,source_type=excluded.source_type,
        source_scope=excluded.source_scope,source_file_id=excluded.source_file_id,source_revision=excluded.source_revision,
        source_modified_time=excluded.source_modified_time,content_hash=excluded.content_hash,raw_json=excluded.raw_json,
        normalized_json=excluded.normalized_json,warnings_json=excluded.warnings_json,source_missing=0,
        imported_at=excluded.imported_at,updated_at=excluded.updated_at`,
        report.channel,
        report.date,
        report.title,
        report.summary,
        report.schema_version,
        report.generated_at,
        source.type,
        source.scope,
        artifact.id,
        artifact.revision,
        artifact.modifiedTime,
        contentHash,
        raw,
        JSON.stringify(report),
        JSON.stringify(warnings),
        now,
        now,
        now,
      );
      const id = this.get(
        "SELECT id FROM reports WHERE channel=? AND report_date=?",
        report.channel,
        report.date,
      )!.id;
      this.run("DELETE FROM report_items WHERE report_id=?", id);
      this.run("DELETE FROM search_index WHERE report_id=?", id);
      if (report.channel !== "market")
        report.items.forEach((item, position) => {
          const key = stableKey(item, report.channel),
            snapshot = JSON.stringify(item);
          this.run(
            "INSERT INTO items(stable_key,latest_json,created_at,updated_at) VALUES(?,?,?,?) ON CONFLICT(stable_key) DO UPDATE SET latest_json=excluded.latest_json,updated_at=excluded.updated_at",
            key,
            snapshot,
            now,
            now,
          );
          const itemId = this.get(
            "SELECT id FROM items WHERE stable_key=?",
            key,
          )!.id;
          this.run(
            "INSERT INTO report_items(report_id,item_id,position,section,snapshot_json) VALUES(?,?,?,?,?)",
            id,
            itemId,
            position,
            item.category,
            snapshot,
          );
          this.index(
            id,
            itemId,
            item.title,
            item.summary,
            item.why_it_matters,
            item.tags.join(" "),
            item.source_name || "",
          );
        });
      if (report.channel === "market") {
        const summary = [
          report.analysis,
          report.sentiment.summary,
          ...report.leading_sectors.map((s) => `${s.name} ${s.reason}`),
          ...report.lagging_sectors.map((s) => `${s.name} ${s.reason}`),
        ].join("\n");
        const outlook = [
          report.outlook.horizon,
          ...report.outlook.scenarios.map(
            (s) => `${s.name} ${s.conditions} ${s.implication}`,
          ),
          ...report.outlook.risks,
          ...report.outlook.opportunities,
        ].join(" ");
        this.index(
          id,
          null,
          report.title,
          summary,
          outlook,
          report.sentiment.stage,
          report.sources.map((s) => s.name).join(" "),
        );
      } else this.index(id, null, report.title, report.summary, "", "", "");
      this.run(
        "DELETE FROM items WHERE id NOT IN (SELECT item_id FROM report_items)",
      );
      return previous ? "UPDATED" : "IMPORTED";
    });
  }
  private index(
    reportId: number,
    itemId: number | null,
    title: string,
    summary: string,
    why: string,
    tags: string,
    source: string,
  ) {
    this.run(
      "INSERT INTO search_index(title,summary,why_it_matters,tags,source_name,tokens,report_id,item_id) VALUES(?,?,?,?,?,?,?,?)",
      title,
      summary,
      why,
      tags,
      source,
      searchTokens([title, summary, why, tags, source].join(" ")).join(" "),
      reportId,
      itemId,
    );
  }
  rebuildSearch() {
    this.transaction(() => {
      this.run("DELETE FROM search_index");
      for (const r of this.all("SELECT * FROM reports")) {
        const report: ReportV1 = JSON.parse(r.normalized_json);
        if (report.channel === "market") {
          this.index(
            r.id,
            null,
            report.title,
            [
              report.analysis,
              report.sentiment.summary,
              ...report.leading_sectors.map((s) => `${s.name} ${s.reason}`),
              ...report.lagging_sectors.map((s) => `${s.name} ${s.reason}`),
            ].join("\n"),
            [
              report.outlook.horizon,
              ...report.outlook.scenarios.map(
                (s) => `${s.name} ${s.conditions} ${s.implication}`,
              ),
              ...report.outlook.risks,
              ...report.outlook.opportunities,
            ].join(" "),
            report.sentiment.stage,
            report.sources.map((s) => s.name).join(" "),
          );
        } else {
          this.index(r.id, null, report.title, report.summary, "", "", "");
          for (const row of this.all(
            "SELECT * FROM report_items WHERE report_id=?",
            r.id,
          )) {
            const i = JSON.parse(row.snapshot_json);
            this.index(
              r.id,
              row.item_id,
              i.title,
              i.summary,
              i.why_it_matters,
              i.tags.join(" "),
              i.source_name || "",
            );
          }
        }
      }
    });
  }
  recordSync(scope: string, result: SyncResult) {
    this.run(
      "INSERT INTO sync_runs(source_scope,started_at,finished_at,successful,result_json) VALUES(?,?,?,?,?)",
      scope,
      result.started_at,
      result.finished_at,
      result.failed === 0 ? 1 : 0,
      JSON.stringify(result),
    );
    this.run(
      "DELETE FROM sync_runs WHERE id NOT IN (SELECT id FROM sync_runs ORDER BY id DESC LIMIT 30)",
    );
  }
}
