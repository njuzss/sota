import {
  CHANNELS,
  type AppStatus,
  type ArchiveEntry,
  type Channel,
  type PublishedDay,
  type PublishedReport,
  type SearchResult,
} from "./contracts.js";
import { Store, searchTokens, type Row } from "./db.js";

export class PublicationService {
  constructor(private store: Store) {}
  archive(): ArchiveEntry[] {
    const days = new Map<string, ArchiveEntry>();
    for (const r of this.store.all(
      `SELECT r.report_date,r.channel,COUNT(ri.item_id) count FROM reports r LEFT JOIN report_items ri ON ri.report_id=r.id GROUP BY r.id ORDER BY r.report_date DESC`,
    )) {
      let day = days.get(r.report_date);
      if (!day) {
        day = {
          date: r.report_date,
          counts: Object.fromEntries(
            Object.keys(CHANNELS).map((c) => [c, null]),
          ) as ArchiveEntry["counts"],
          complete: false,
        };
        days.set(day.date, day);
      }
      day.counts[r.channel as Channel] = r.count;
      day.complete = Object.values(day.counts).every((c) => c !== null);
    }
    return [...days.values()];
  }
  latest() {
    const date = this.store.get(
      "SELECT MAX(report_date) date FROM reports",
    )?.date;
    return date ? this.day(date) : null;
  }
  day(date: string): PublishedDay | null {
    const rows = this.store.all(
      "SELECT * FROM reports WHERE report_date=?",
      date,
    );
    if (!rows.length) return null;
    const reports: PublishedDay["reports"] = Object.fromEntries(
      rows.map((r) => [r.channel, this.report(r)]),
    );
    return {
      date,
      issue: this.store.get(
        "SELECT COUNT(DISTINCT report_date) count FROM reports WHERE report_date<=?",
        date,
      )!.count,
      prev:
        this.store.get(
          "SELECT MAX(report_date) date FROM reports WHERE report_date<?",
          date,
        )?.date || null,
      next:
        this.store.get(
          "SELECT MIN(report_date) date FROM reports WHERE report_date>?",
          date,
        )?.date || null,
      reports,
      item_count: Object.values(reports).reduce(
        (sum, r) => sum + (r?.items.length || 0),
        0,
      ),
      complete: Object.keys(CHANNELS).every((c) => c in reports),
      demo: rows.some((r) => r.source_type === "fixture"),
    };
  }
  channel(channel: Channel, limit = 30): PublishedReport[] {
    return this.store
      .all(
        "SELECT * FROM reports WHERE channel=? ORDER BY report_date DESC LIMIT ?",
        channel,
        limit,
      )
      .map((row) => this.report(row));
  }
  private report(row: Row): PublishedReport {
    const items = this.store
      .all(
        `SELECT ri.*,i.stable_key,
      (SELECT MIN(r.report_date) FROM report_items oi JOIN reports r ON r.id=oi.report_id WHERE oi.item_id=ri.item_id) first_seen,
      (SELECT COUNT(DISTINCT r.report_date) FROM report_items oi JOIN reports r ON r.id=oi.report_id WHERE oi.item_id=ri.item_id) appearances
      FROM report_items ri JOIN items i ON i.id=ri.item_id WHERE ri.report_id=? ORDER BY ri.position`,
        row.id,
      )
      .map((i) => ({
        ...JSON.parse(i.snapshot_json),
        id: i.item_id,
        stable_key: i.stable_key,
        first_seen: i.first_seen,
        appearances: i.appearances,
      }));
    return {
      id: row.id,
      channel: row.channel,
      date: row.report_date,
      title: row.title,
      summary: row.summary,
      generated_at: row.generated_at,
      imported_at: row.imported_at,
      updated_at: row.updated_at,
      source_type: row.source_type,
      source_missing: Boolean(row.source_missing),
      warnings: JSON.parse(row.warnings_json),
      items,
      body: JSON.parse(row.normalized_json),
    };
  }
  search(query: string, limit = 50): SearchResult[] {
    const tokens = searchTokens(query.slice(0, 200)).slice(0, 32);
    if (!tokens.length) return [];
    // Literal tokens only. User punctuation never becomes FTS operators or SQL.
    const match = tokens
      .map((t) => `"${t.replace(/"/g, '""')}"${/[a-z]/i.test(t) ? "*" : ""}`)
      .join(" AND ");
    return this.store
      .all(
        `SELECT s.*,r.channel,r.report_date,bm25(search_index) rank,
      ri.snapshot_json FROM search_index s JOIN reports r ON r.id=s.report_id
      LEFT JOIN report_items ri ON ri.report_id=s.report_id AND ri.item_id=s.item_id
      WHERE search_index MATCH ? ORDER BY rank,r.report_date DESC LIMIT ?`,
        match,
        limit,
      )
      .map((row) => {
        const text = [row.summary, row.why_it_matters, row.tags]
          .filter(Boolean)
          .join(" · ");
        const pos = Math.max(
          0,
          text.toLowerCase().indexOf(query.toLowerCase()),
        );
        const start = Math.max(0, pos - 40);
        const snippet = `${start ? "…" : ""}${text.slice(start, start + 180)}${text.length > start + 180 ? "…" : ""}`;
        const item = row.snapshot_json ? JSON.parse(row.snapshot_json) : null;
        return {
          title: row.title,
          channel: row.channel,
          date: row.report_date,
          snippet,
          source_name: row.source_name || null,
          source_url: item?.source_url || null,
          href: `/day/${row.report_date}#${row.item_id ? `item-${row.item_id}` : row.channel}`,
        };
      });
  }
  status(source: { type: string; scope: string }, running: boolean): AppStatus {
    const last = this.store.get(
      "SELECT * FROM sync_runs WHERE source_scope=? ORDER BY id DESC LIMIT 1",
      source.scope,
    );
    return {
      source_adapter: source.type,
      source_scope: source.scope,
      sync_running: running,
      last_sync: last?.finished_at || null,
      last_successful_sync:
        this.store.get(
          "SELECT finished_at FROM sync_runs WHERE source_scope=? AND successful=1 ORDER BY id DESC LIMIT 1",
          source.scope,
        )?.finished_at || null,
      imported_reports: this.store.get("SELECT COUNT(*) count FROM reports")!
        .count,
      latest_report:
        this.store.get("SELECT MAX(report_date) date FROM reports")?.date ||
        null,
      errors: this.store
        .all(
          "SELECT source_id,last_error error FROM sync_state WHERE source_scope=? AND last_error IS NOT NULL",
          source.scope,
        )
        .map((r) => ({ source_id: r.source_id, error: r.error })),
      warnings: this.store
        .all(
          "SELECT channel,report_date date,warnings_json FROM reports WHERE warnings_json!='[]'",
        )
        .map((row) => ({
          channel: row.channel,
          date: row.date,
          warnings: JSON.parse(row.warnings_json),
        })),
      last_result: last ? JSON.parse(last.result_json) : null,
    };
  }
}
