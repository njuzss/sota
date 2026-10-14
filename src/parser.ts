import { createHash } from "node:crypto";
import {
  CHANNELS,
  type Channel,
  type Evidence,
  type ImportWarning,
  type MarketReport,
  type ReportItem,
  type ReportV1,
} from "./contracts.js";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
const str = (v: unknown, fallback = "") =>
  typeof v === "string" ? v.trim() : fallback;
const strings = (v: unknown) =>
  Array.isArray(v)
    ? [
        ...new Set(
          v
            .filter((s): s is string => typeof s === "string")
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      ]
    : [];
const number = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
export const hash = (v: string) => createHash("sha256").update(v).digest("hex");
export function validDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const date = new Date(v + "T00:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === v;
}
export function validTimestamp(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(
      v,
    ) &&
    validDate(v.slice(0, 10)) &&
    !Number.isNaN(Date.parse(v))
  );
}
export function safeUrl(value: unknown): string | null {
  try {
    const u = new URL(str(value));
    return ["http:", "https:"].includes(u.protocol) &&
      !u.username &&
      !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export function canonicalUrl(value: string): string {
  const u = new URL(value);
  u.hash = "";
  for (const k of [...u.searchParams.keys()])
    if (/^(utm_|fbclid$|gclid$)/i.test(k)) u.searchParams.delete(k);
  u.searchParams.sort();
  u.pathname = u.pathname.replace(/\/$/, "") || "/";
  // Repository identity ignores GitHub issue/release subpaths only when extra.repo supplies that identity.
  return u.href.replace(/\/$/, "");
}
export function stableKey(item: ReportItem, channel: Channel): string {
  const repo = str(item.extra.repo).toLowerCase();
  const sourceUrl = item.source_url ? canonicalUrl(item.source_url) : null;
  const parsedUrl = sourceUrl ? new URL(sourceUrl) : null;
  const portalHomepage =
    parsedUrl &&
    [
      "producthunt.com",
      "github.com",
      "x.com",
      "twitter.com",
      "news.ycombinator.com",
    ].includes(parsedUrl.hostname.replace(/^www\./, "")) &&
    parsedUrl.pathname === "/" &&
    !parsedUrl.search;
  // A shared portal homepage identifies the source, not an individual story/project.
  const identity =
    sourceUrl && !portalHomepage
      ? `url:${sourceUrl}`
      : /^[\w.-]+\/[\w.-]+$/.test(repo)
        ? `repo:${repo}`
        : `${channel}:${item.title.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim()}`;
  return hash(identity);
}
export function parseReport(text: string): {
  report: ReportV1;
  warnings: ImportWarning[];
  raw: unknown;
} {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/, "").trim());
  } catch {
    throw new Error(
      "JSON 无法解析；正文必须是严格 JSON，不能包含 code fence 或说明文字",
    );
  }
  const root = obj(raw);
  if (root.schema_version !== 1)
    throw new Error(`不支持 schema_version: ${String(root.schema_version)}`);
  if (
    typeof root.channel !== "string" ||
    !Object.hasOwn(CHANNELS, root.channel)
  )
    throw new Error("channel 缺失或未知");
  if (!validDate(root.date))
    throw new Error("date 必须是有效的 YYYY-MM-DD 日期");
  if (!validTimestamp(root.generated_at))
    throw new Error("generated_at 必须是带时区的 ISO 时间");
  if (!str(root.title)) throw new Error("顶层 title 缺失");
  return { ...parserV1(root), raw };
}
function parserV1(root: Obj): { report: ReportV1; warnings: ImportWarning[] } {
  const warnings: ImportWarning[] = [];
  const warn = (path: string, message: string) =>
    warnings.push({ path, message });
  const base = {
    schema_version: 1 as const,
    channel: root.channel as Channel,
    date: root.date as string,
    generated_at: root.generated_at as string,
    title: str(root.title),
    summary: str(root.summary),
  };
  if (root.channel !== "market") {
    if (!Array.isArray(root.items)) throw new Error("items 必须是数组");
    const items: ReportItem[] = [];
    const seen = new Set<string>();
    root.items.forEach((value, i) => {
      const p = `items[${i}]`,
        item = obj(value);
      if (!str(item.title)) {
        warn(p, "缺少标题，跳过该条目");
        return;
      }
      for (const field of ["summary", "why_it_matters", "source_name"])
        if (!str(item[field])) warn(`${p}.${field}`, "字段缺失");
      for (const field of ["source_url", "image_url"])
        if (!safeUrl(item[field]))
          warn(`${p}.${field}`, "缺失或非 HTTP(S) URL，已归一为 null");
      if (!validTimestamp(item.published_at))
        warn(`${p}.published_at`, "缺失或无效时间，已归一为 null");
      const evidence = ["strong", "moderate", "weak", "disputed"].includes(
        str(item.evidence),
      )
        ? (item.evidence as Evidence)
        : null;
      if (!evidence) warn(`${p}.evidence`, "未标注证据等级");
      if (!strings(item.tags).length) warn(`${p}.tags`, "未标注标签");
      const extra = { ...obj(item.extra) };
      if (root.channel === "trending") {
        extra.github_stars = number(extra.github_stars);
        if (extra.github_stars !== null && (extra.github_stars as number) < 0)
          extra.github_stars = null;
        if (extra.github_stars === null)
          warn(`${p}.extra.github_stars`, "未提供可靠 stars 指标");
      }
      const normalized: ReportItem = {
        title: str(item.title),
        summary: str(item.summary),
        why_it_matters: str(item.why_it_matters),
        category: str(item.category, "OTHER"),
        tags: strings(item.tags),
        source_name: str(item.source_name) || null,
        source_url: safeUrl(item.source_url),
        image_url: safeUrl(item.image_url),
        published_at: validTimestamp(item.published_at)
          ? item.published_at
          : null,
        evidence,
        extra,
      };
      const key = stableKey(normalized, base.channel);
      if (seen.has(key)) {
        warn(p, "本期重复条目，保留首次出现");
        return;
      }
      seen.add(key);
      items.push(normalized);
    });
    if (root.channel === "frontier")
      return { report: { ...base, channel: "frontier", items }, warnings };
    const picks = strings(root.top_picks);
    const top_picks = picks
      .filter((repo) =>
        items.some((item) => item.extra.repo === repo || item.title === repo),
      )
      .slice(0, 3);
    if (JSON.stringify(picks) !== JSON.stringify(top_picks))
      warn("top_picks", "只能保留 items 中存在的最多 3 个项目");
    return {
      report: { ...base, channel: "trending", items, top_picks },
      warnings,
    };
  }
  if (
    typeof root.market_open !== "boolean" ||
    typeof root.analysis !== "string"
  )
    throw new Error("market_open 必须为 boolean，analysis 必须为 string");
  const list = (v: unknown) => (Array.isArray(v) ? v.map(obj) : []);
  const metrics = obj(root.metrics),
    sentiment = obj(root.sentiment),
    outlook = obj(root.outlook);
  const report: MarketReport = {
    ...base,
    channel: "market",
    market_open: root.market_open,
    indices: list(root.indices)
      .filter((i) => str(i.name))
      .map((i) => ({
        name: str(i.name),
        code: str(i.code) || null,
        close: number(i.close),
        change_pct: number(i.change_pct),
      })),
    metrics: {
      turnover:
        typeof metrics.turnover === "string"
          ? metrics.turnover
          : number(metrics.turnover),
      up_count: number(metrics.up_count),
      down_count: number(metrics.down_count),
      limit_up: number(metrics.limit_up),
      limit_down: number(metrics.limit_down),
    },
    leading_sectors: list(root.leading_sectors).map((i) => ({
      name: str(i.name),
      reason: str(i.reason),
    })),
    lagging_sectors: list(root.lagging_sectors).map((i) => ({
      name: str(i.name),
      reason: str(i.reason),
    })),
    sentiment: {
      stage: str(sentiment.stage),
      summary: str(sentiment.summary),
      evidence: strings(sentiment.evidence),
    },
    analysis: str(root.analysis),
    outlook: {
      horizon: str(outlook.horizon, "1-5 trading days"),
      scenarios: list(outlook.scenarios).map((i) => ({
        name: str(i.name),
        conditions: str(i.conditions),
        implication: str(i.implication),
      })),
      risks: strings(outlook.risks),
      opportunities: strings(outlook.opportunities),
    },
    sources: list(root.sources).map((i) => ({
      name: str(i.name),
      url: safeUrl(i.url),
    })),
  };
  if (report.market_open && !report.indices.length)
    warn("indices", "交易日报告缺少指数数据");
  return { report, warnings };
}
