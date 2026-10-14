export const CHANNELS = {
  frontier: {
    name: "每日前沿",
    english: "FRONTIER",
    number: "01",
    kind: "items",
  },
  trending: {
    name: "热门项目",
    english: "TRENDING PROJECTS",
    number: "02",
    kind: "items",
  },
  market: {
    name: "A 股收盘",
    english: "MARKET CLOSE",
    number: "03",
    kind: "market",
  },
} as const;
export type Channel = keyof typeof CHANNELS;
export type Evidence = "strong" | "moderate" | "weak" | "disputed";
export interface ReportItem {
  title: string;
  summary: string;
  why_it_matters: string;
  category: string;
  tags: string[];
  source_name: string | null;
  source_url: string | null;
  image_url: string | null;
  published_at: string | null;
  evidence: Evidence | null;
  extra: Record<string, unknown>;
}
export interface BaseReport {
  schema_version: 1;
  channel: Channel;
  date: string;
  generated_at: string;
  title: string;
  summary: string;
}
export interface FrontierReport extends BaseReport {
  channel: "frontier";
  items: ReportItem[];
}
export interface TrendingReport extends BaseReport {
  channel: "trending";
  top_picks: string[];
  items: ReportItem[];
}
export interface MarketReport extends BaseReport {
  channel: "market";
  market_open: boolean;
  indices: {
    name: string;
    code: string | null;
    close: number | null;
    change_pct: number | null;
  }[];
  metrics: {
    turnover: string | number | null;
    up_count: number | null;
    down_count: number | null;
    limit_up: number | null;
    limit_down: number | null;
  };
  leading_sectors: { name: string; reason: string }[];
  lagging_sectors: { name: string; reason: string }[];
  sentiment: { stage: string; summary: string; evidence: string[] };
  analysis: string;
  outlook: {
    horizon: string;
    scenarios: { name: string; conditions: string; implication: string }[];
    risks: string[];
    opportunities: string[];
  };
  sources: { name: string; url: string | null }[];
}
export type ReportV1 = FrontierReport | TrendingReport | MarketReport;
export type ImportWarning = { path: string; message: string };
export type SourceArtifact = {
  id: string;
  name: string;
  revision: string;
  modifiedTime: string;
  mimeType: string;
  channel?: Channel;
  date?: string;
};
export type RawReport = { text: string; revision?: string };
export interface SourceAdapter {
  readonly type: string;
  readonly scope: string;
  scan(): Promise<SourceArtifact[]>;
  fetch(id: string): Promise<RawReport>;
}
export interface PublishedItem extends ReportItem {
  id: number;
  stable_key: string;
  first_seen: string;
  appearances: number;
}
export type PublishedReport = {
  id: number;
  channel: Channel;
  date: string;
  title: string;
  summary: string;
  generated_at: string;
  imported_at: string;
  updated_at: string;
  source_type: string;
  source_missing: boolean;
  warnings: ImportWarning[];
  items: PublishedItem[];
  body: ReportV1;
};
export type ArchiveEntry = {
  date: string;
  counts: Record<Channel, number | null>;
  complete: boolean;
};
export type PublishedDay = {
  date: string;
  issue: number;
  prev: string | null;
  next: string | null;
  reports: Partial<Record<Channel, PublishedReport>>;
  item_count: number;
  complete: boolean;
  demo: boolean;
};
export type SearchResult = {
  title: string;
  channel: Channel;
  date: string;
  snippet: string;
  source_name: string | null;
  source_url: string | null;
  href: string;
};
export type SyncEvent = {
  event: "FOUND" | "UNCHANGED" | "UPDATED" | "IMPORTED" | "WARNING" | "FAILED";
  source_id: string;
  message: string;
};
export type SyncResult = {
  started_at: string;
  finished_at: string;
  found: number;
  imported: number;
  updated: number;
  unchanged: number;
  failed: number;
  warnings: number;
  events: SyncEvent[];
};
export type AppStatus = {
  source_adapter: string;
  source_scope: string;
  sync_running: boolean;
  last_sync: string | null;
  last_successful_sync: string | null;
  imported_reports: number;
  latest_report: string | null;
  errors: { source_id: string; error: string }[];
  warnings: { channel: Channel; date: string; warnings: ImportWarning[] }[];
  last_result: SyncResult | null;
};

export interface PublicationStatus extends AppStatus {
  built_at: string | null;
  commit: string | null;
  deployed_at: null;
  channel_latest: Record<Channel, string | null>;
  missing_days: ArchiveEntry[];
  actions_url: string;
  repository_url: string;
}
