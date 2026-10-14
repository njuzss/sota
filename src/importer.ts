import { mkdir, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import type { SourceAdapter, SyncResult } from "./contracts.js";
import { hash, parseReport } from "./parser.js";
import { Store } from "./db.js";

export class SyncService {
  private active: Promise<SyncResult> | null = null;
  get running() {
    return this.active !== null;
  }
  constructor(
    readonly store: Store,
    readonly adapter: SourceAdapter,
    private rawDir?: string,
  ) {}
  sync(force = false): Promise<SyncResult> {
    if (this.active) return this.active;
    this.active = this.perform(force).finally(() => {
      this.active = null;
    });
    return this.active;
  }
  private async perform(force: boolean): Promise<SyncResult> {
    const result: SyncResult = {
      started_at: new Date().toISOString(),
      finished_at: "",
      found: 0,
      imported: 0,
      updated: 0,
      unchanged: 0,
      failed: 0,
      warnings: 0,
      events: [],
    };
    const scope = this.adapter.scope;
    const event = (e: SyncResult["events"][number]) => result.events.push(e);
    try {
      // No missing-source updates until a COMPLETE scan has succeeded.
      const artifacts = (await this.adapter.scan()).sort(
        (a, b) =>
          Date.parse(a.modifiedTime) - Date.parse(b.modifiedTime) ||
          a.id.localeCompare(b.id),
      );
      result.found = artifacts.length;
      const seen = new Set(artifacts.map((a) => a.id));
      for (const artifact of artifacts) {
        event({
          event: "FOUND",
          source_id: artifact.id,
          message: artifact.name,
        });
        const now = new Date().toISOString();
        const previous = this.store.get(
          "SELECT * FROM sync_state WHERE source_scope=? AND source_id=?",
          scope,
          artifact.id,
        );
        this.store.run(
          "INSERT INTO sync_state(source_scope,source_id,last_seen_at) VALUES(?,?,?) ON CONFLICT(source_scope,source_id) DO UPDATE SET last_seen_at=excluded.last_seen_at",
          scope,
          artifact.id,
          now,
        );
        if (
          !force &&
          previous?.source_revision === artifact.revision &&
          !previous.last_error &&
          previous.last_success_at
        ) {
          this.store.run(
            "UPDATE reports SET source_missing=0 WHERE source_scope=? AND source_file_id=?",
            scope,
            artifact.id,
          );
          result.unchanged++;
          event({
            event: "UNCHANGED",
            source_id: artifact.id,
            message: "revision 未变",
          });
          continue;
        }
        try {
          const raw = await this.adapter.fetch(artifact.id),
            contentHash = hash(raw.text);
          if (this.rawDir) {
            await mkdir(this.rawDir, { recursive: true });
            const path = join(
                this.rawDir,
                `${hash(scope + ":" + artifact.id)}.json`,
              ),
              temporary = `${path}.tmp`;
            // Preserve even invalid payloads for diagnosis, without modifying sources.
            await writeFile(
              temporary,
              JSON.stringify(
                {
                  source_type: this.adapter.type,
                  source_scope: scope,
                  artifact,
                  document_revision: raw.revision || null,
                  raw_text: raw.text,
                },
                null,
                2,
              ),
            );
            await rename(temporary, path);
          }
          const { report, warnings } = parseReport(raw.text);
          if (
            (artifact.channel && artifact.channel !== report.channel) ||
            (artifact.date && artifact.date !== report.date)
          )
            throw new Error("文件名中的 channel/date 与 JSON 正文不一致");
          const imported = this.store.import(
            report,
            raw.text,
            { ...artifact, revision: raw.revision || artifact.revision },
            this.adapter,
            contentHash,
            warnings,
          );
          this.store.run(
            "UPDATE sync_state SET source_revision=?,content_hash=?,last_success_at=?,last_error=NULL WHERE source_scope=? AND source_id=?",
            artifact.revision,
            contentHash,
            now,
            scope,
            artifact.id,
          );
          if (imported === "SUPERSEDED") {
            result.unchanged++;
            result.warnings++;
            event({
              event: "WARNING",
              source_id: artifact.id,
              message: "较旧稿件，不覆盖已保存的较新日报",
            });
          } else {
            if (imported === "IMPORTED") result.imported++;
            else if (imported === "UPDATED") result.updated++;
            else result.unchanged++;
            event({
              event: imported,
              source_id: artifact.id,
              message: `${report.channel} / ${report.date}`,
            });
          }
          result.warnings += warnings.length;
          for (const warning of warnings)
            event({
              event: "WARNING",
              source_id: artifact.id,
              message: `${warning.path}: ${warning.message}`,
            });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          result.failed++;
          event({ event: "FAILED", source_id: artifact.id, message });
          this.store.run(
            "UPDATE sync_state SET last_error=? WHERE source_scope=? AND source_id=?",
            message,
            scope,
            artifact.id,
          );
        }
      }
      this.store.run(
        "DELETE FROM sync_state WHERE source_scope=? AND source_id=?",
        scope,
        "__scan__",
      );
      for (const row of this.store.all(
        "SELECT id,source_file_id FROM reports WHERE source_scope=?",
        scope,
      ))
        this.store.run(
          "UPDATE reports SET source_missing=? WHERE id=?",
          seen.has(row.source_file_id) ? 0 : 1,
          row.id,
        );
      for (const row of this.store.all(
        "SELECT source_id FROM sync_state WHERE source_scope=?",
        scope,
      ))
        if (!seen.has(row.source_id))
          this.store.run(
            "UPDATE sync_state SET last_error=NULL WHERE source_scope=? AND source_id=?",
            scope,
            row.source_id,
          );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.failed++;
      event({ event: "FAILED", source_id: "__scan__", message });
      this.store.run(
        "INSERT INTO sync_state(source_scope,source_id,last_seen_at,last_error) VALUES(?,?,?,?) ON CONFLICT(source_scope,source_id) DO UPDATE SET last_seen_at=excluded.last_seen_at,last_error=excluded.last_error",
        scope,
        "__scan__",
        result.started_at,
        message,
      );
    }
    result.finished_at = new Date().toISOString();
    this.store.recordSync(scope, result);
    return result;
  }
}
