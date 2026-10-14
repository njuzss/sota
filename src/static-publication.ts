import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CHANNELS,
  type AppStatus,
  type Channel,
  type ArchiveEntry,
} from "./contracts.js";
import { PublicationService } from "./publication.js";
import { Store } from "./db.js";
import { hash } from "./parser.js";
import { ftsWords, type SearchDocument, type SearchShard } from "./search.js";

export interface PublicationManifest {
  version: 1;
  revision: string;
  root: string;
  latest: string | null;
  dates: string[];
  search: SearchShard[];
  schema_version: 1;
  build_version: 2;
  built_at: string;
  commit: string | null;
  archive: ArchiveEntry[];
  validation: {
    valid_reports: number;
    invalid_reports: number;
    warnings: number;
    errors: { source_id: string; error: string }[];
  };
}
export function publicationId(identity: string): number {
  // 52 bits fit exactly in JS numbers. Export rejects collisions rather than silently sharing an anchor.
  return Number.parseInt(hash(identity).slice(0, 13), 16);
}
export async function exportPublication(
  store: Store,
  destination: string,
  demo = false,
  errors: { source_id: string; error: string }[] = [],
): Promise<PublicationManifest> {
  const publication = new PublicationService(store);
  const archive = publication.archive();
  const identities = new Map<number, string>();
  const id = (identity: string) => {
    const value = publicationId(identity);
    const previous = identities.get(value);
    if (previous && previous !== identity)
      throw new Error("Publication ID collision");
    identities.set(value, identity);
    return value;
  };
  // No filesystem paths, source IDs, sync log payloads or raw envelopes in public output.
  const days = archive.map((entry) => {
    const day = publication.day(entry.date)!;
    day.demo = demo;
    for (const report of Object.values(day.reports)) {
      if (!report) continue;
      report.id = id(`report:${report.channel}:${report.date}`);
      for (const item of report.items)
        item.id = id(`item:${report.channel}:${item.stable_key}`);
      report.source_type = demo ? "fixture" : "static";
      report.imported_at = report.generated_at;
      report.updated_at = report.generated_at;
    }
    return day;
  });
  const channels = Object.keys(CHANNELS) as Channel[];
  const documents = Object.fromEntries(
    channels.map((c) => [c, [] as SearchDocument[]]),
  ) as Record<Channel, SearchDocument[]>;
  for (const row of store.all(`SELECT s.*,r.channel,r.report_date,ri.snapshot_json,i.stable_key
    FROM search_index s JOIN reports r ON r.id=s.report_id
    LEFT JOIN report_items ri ON ri.report_id=s.report_id AND ri.item_id=s.item_id
    LEFT JOIN items i ON i.id=s.item_id
    ORDER BY r.report_date DESC,r.channel,s.item_id`)) {
    const text = [row.summary, row.why_it_matters, row.tags]
      .filter(Boolean)
      .join(" · ");
    const item = row.snapshot_json ? JSON.parse(row.snapshot_json) : null;
    documents[row.channel as Channel].push({
      title: row.title,
      channel: row.channel,
      date: row.report_date,
      source_name: row.source_name || null,
      source_url: item?.source_url || null,
      href: `/day/${row.report_date}#${row.item_id ? `item-${id(`item:${row.channel}:${row.stable_key}`)}` : row.channel}`,
      snippet: "",
      text,
      tokens: ftsWords(row.tokens),
    });
  }
  const revision = hash(JSON.stringify({ days, documents, errors })).slice(
    0,
    24,
  );
  const root = `revisions/${revision}`;
  const output = join(destination, root);
  const json = async (path: string, value: unknown) => {
    const target = join(output, path);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, JSON.stringify(value));
  };
  for (const day of days) await json(`day/${day.date}.json`, day);
  await json("archive.json", { days: archive });
  const shards: SearchShard[] = [];
  for (const channel of channels) {
    await json(`channel/${channel}.json`, {
      reports: days.flatMap((day) =>
        day.reports[channel] ? [day.reports[channel]!] : [],
      ),
    });
    const file = `search/${channel}.json`;
    await json(file, documents[channel]);
    shards.push({ channel, file, count: documents[channel].length });
  }
  const status: AppStatus = {
    source_adapter: "static",
    source_scope: "SOTA 云端出版物",
    sync_running: false,
    last_sync:
      days
        .flatMap((day) =>
          Object.values(day.reports).map((r) => r!.generated_at),
        )
        .sort()
        .at(-1) || null,
    last_successful_sync: null,
    imported_reports: days.reduce(
      (sum, day) => sum + Object.keys(day.reports).length,
      0,
    ),
    latest_report: days[0]?.date || null,
    errors,
    warnings: days.flatMap((day) =>
      Object.values(day.reports)
        .filter((r) => r!.warnings.length)
        .map((r) => ({
          channel: r!.channel,
          date: r!.date,
          warnings: r!.warnings,
        })),
    ),
    last_result: null,
  };
  status.last_successful_sync = status.last_sync;
  await json("status.json", status);
  const manifest: PublicationManifest = {
    version: 1,
    revision,
    root,
    latest: days[0]?.date || null,
    dates: days.map((d) => d.date),
    search: shards,
    schema_version: 1,
    build_version: 2,
    built_at: new Date().toISOString(),
    commit: process.env.BUILD_COMMIT || null,
    archive,
    validation: {
      valid_reports: status.imported_reports,
      invalid_reports: errors.length,
      warnings: status.warnings.reduce((sum, r) => sum + r.warnings.length, 0),
      errors,
    },
  };
  await mkdir(destination, { recursive: true });
  // The manifest is written last; content-addressed paths keep a reader on one publication revision.
  await writeFile(join(destination, "manifest.json"), JSON.stringify(manifest));
  return manifest;
}
