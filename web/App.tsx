import { useEffect, useState, type ReactNode, type FormEvent } from "react";
import {
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  CHANNELS,
  type AppStatus,
  type PublicationStatus,
  type ArchiveEntry,
  type Channel,
  type MarketReport,
  type PublishedDay,
  type PublishedItem,
  type PublishedReport,
  type SearchResult,
} from "../src/contracts";
import { directImages } from "../src/image-service";

const channels = Object.keys(CHANNELS) as Channel[];
const weekdays = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const weekday = (date: string) =>
  weekdays[new Date(`${date}T12:00:00+08:00`).getUTCDay()];
const dateLabel = (date: string) =>
  `${date.replaceAll("-", ".")} · ${weekday(date)}`;
const timeLabel = (date: string | null) =>
  date
    ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(date))
    : "尚未同步";
const text = (value: unknown) => (typeof value === "string" ? value : "");

import { api } from "./publication-client";

function useApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    api<T>(path, { signal: controller.signal })
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [path, revision]);
  return { data, error, reload: () => setRevision((r) => r + 1) };
}
function State({ error, children }: { error?: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="kicker">SOTA / PERSONAL HOT</span>
      <h1>{error || "正在翻开日报…"}</h1>
      {error && (
        <p>内容来自已发布的静态日报。请查看出版状态，或浏览已有合订本。</p>
      )}
      {children}
    </div>
  );
}
function ScrollToPage() {
  const location = useLocation();
  useEffect(() => {
    if (!location.hash) window.scrollTo({ top: 0 });
  }, [location.pathname, location.search]);
  return null;
}
export function App() {
  return (
    <>
      <ScrollToPage />
      <a className="skip-link" href="#main">
        跳到正文
      </a>
      <div className="paper-shell">
        <div className="utility">
          <span>
            <i /> CLOUD EDITION · 上海时间
          </span>
          <span>THE SIGNAL, NOT THE NOISE.</span>
        </div>
        <header className="site-header">
          <Link to="/" className="brand" aria-label="SOTA 日报首页">
            SOTA<span>PERSONAL HOT</span>
          </Link>
          <p>
            每天的发现
            <br />
            <strong>值得被好好编排。</strong>
          </p>
          <Link className="header-archive" to="/archive">
            打开合订本 <span>↗</span>
          </Link>
        </header>
        <nav className="main-nav" aria-label="主导航">
          <div>
            <NavLink to="/" end>
              日报
            </NavLink>
            {channels.map((c) => (
              <NavLink key={c} to={`/${c}`}>
                {CHANNELS[c].name}
              </NavLink>
            ))}
            <NavLink to="/archive">合订本</NavLink>
          </div>
          <div>
            <NavLink to="/search">
              搜索 <span aria-hidden>⌕</span>
            </NavLink>
            <NavLink to="/settings">出版状态</NavLink>
          </div>
        </nav>
        <main id="main">
          <Routes>
            <Route path="/" element={<DayPage />} />
            <Route path="/day/:date" element={<DayPage />} />
            <Route path="/archive" element={<ArchivePage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            {channels.map((c) => (
              <Route
                key={c}
                path={`/${c}`}
                element={<ChannelPage channel={c} />}
              />
            ))}
            <Route
              path="*"
              element={
                <State error="这页还没有被编入报纸">
                  <Link to="/">回到日报</Link>
                </State>
              }
            />
          </Routes>
        </main>
        <footer className="colophon">
          <div>
            <b>SOTA</b>
            <span>云端成稿 · 云端阅读 · 长久留存</span>
          </div>
          <p>
            PERSONAL INTELLIGENCE, CAREFULLY EDITED.
            <br />
            SCHEMA V1 / CLOUD EDITION / ASIA · SHANGHAI
          </p>
        </footer>
      </div>
    </>
  );
}
function DayPage() {
  const { date } = useParams(),
    location = useLocation();
  const {
    data: day,
    error,
    reload,
  } = useApi<PublishedDay>(date ? `/api/day/${date}` : "/api/day/latest");
  const { data: status } = useApi<AppStatus>("/api/status");
  useEffect(() => {
    if (!day || !location.hash) return;
    const frame = requestAnimationFrame(() =>
      document
        .getElementById(decodeURIComponent(location.hash.slice(1)))
        ?.scrollIntoView(),
    );
    return () => cancelAnimationFrame(frame);
  }, [day, location.hash]);
  if (!day)
    return (
      <State error={error}>
        <div className="actions">
          <button onClick={reload}>重新读取</button>
          <Link to="/settings">查看出版状态 ↗</Link>
        </div>
      </State>
    );
  const frontier = day.reports.frontier,
    lead = frontier?.items[0];
  const highlights = [
    frontier?.items[1],
    day.reports.trending?.items[0],
  ].filter(Boolean) as PublishedItem[];
  return (
    <>
      <div className="edition-line">
        <span>{dateLabel(day.date)}</span>
        <span>
          第 {String(day.issue).padStart(3, "0")} 期 ·{" "}
          {Object.keys(day.reports).length}/3 频道
        </span>
        <span>稿件 {timeLabel(status?.last_sync || null)}</span>
      </div>
      {day.demo && (
        <div className="demo-note">
          <span>DEMO EDITION</span> 当前为 fixture 演示刊 ·
          新闻叙述与市场数值仅用于功能验证。
        </div>
      )}
      <div className="day-title">
        <div>
          <span className="kicker">THE DAILY BRIEFING</span>
          <h1>
            个人情报日报<span>每日一刊，持续观察。</span>
          </h1>
        </div>
        <div className="date-block">
          <span>{day.date.slice(0, 7).replace("-", " / ")}</span>
          <strong>{day.date.slice(8)}</strong>
          <small>
            {weekday(day.date)} · {day.item_count} 条内容
          </small>
        </div>
      </div>
      <div className="channel-index">
        {channels.map((c) => (
          <a key={c} href={`#${c}`}>
            <span className="index-number">{CHANNELS[c].number}</span>
            <div>
              <b>{CHANNELS[c].name}</b>
              <small>{CHANNELS[c].english}</small>
            </div>
            <strong>
              {day.reports[c] ? (
                c === "market" ? (
                  "✓"
                ) : (
                  String(day.reports[c]!.items.length).padStart(2, "0")
                )
              ) : (
                <span className="missing-count">未生成</span>
              )}
            </strong>
          </a>
        ))}
      </div>
      {(lead || highlights.length > 0) && (
        <section className="front-page" aria-label="今日重点">
          <div className="lead-column">
            <span className="kicker accent">TODAY’S FOCUS / 今日重点</span>
            {lead ? (
              <Item item={lead} lead />
            ) : (
              <div className="edition-summary">
                <h2>{day.reports.trending?.title || "今日项目观察"}</h2>
                <p>{day.reports.trending?.summary}</p>
              </div>
            )}
          </div>
          <aside className="issue-notes">
            <span className="kicker">INSIDE THIS ISSUE</span>
            {highlights.map((item, i) => (
              <Link key={item.id} to={`/day/${day.date}#item-${item.id}`}>
                <span>0{i + 1}</span>
                <h3>{item.title}</h3>
                <small>{item.category} ↗</small>
              </Link>
            ))}
            {day.reports.market && (
              <a href="#market">
                <span>03</span>
                <h3>
                  {day.reports.market.body.channel === "market" &&
                  !day.reports.market.body.market_open
                    ? "休市，也留下今天的观察"
                    : "市场的结构，比单个数字更重要"}
                </h3>
                <small>MARKET CLOSE ↗</small>
              </a>
            )}
            <p className="editor-note">
              一份日报的价值，也在于明天还能找到今天。
              <br />
              <span>SOTA · 编辑手记</span>
            </p>
          </aside>
        </section>
      )}
      {channels.map((c) => (
        <ReportSection
          key={c}
          channel={c}
          report={day.reports[c]}
          skipId={lead?.id}
        />
      ))}
      <div className="neighbours" aria-label="前后日报导航">
        {day.prev ? (
          <Link to={`/day/${day.prev}`}>
            <small>← 上一期</small>
            <strong>{day.prev}</strong>
          </Link>
        ) : (
          <span>
            <small>已到最早一期</small>
          </span>
        )}
        <Link to="/archive" className="binding">
          日报合订本 <span>▤</span>
        </Link>
        {day.next ? (
          <Link to={`/day/${day.next}`} className="next">
            <small>下一期 →</small>
            <strong>{day.next}</strong>
          </Link>
        ) : (
          <span className="next">
            <small>已到最新一期</small>
          </span>
        )}
      </div>
    </>
  );
}
function Item({
  item,
  lead = false,
  pick = false,
  prefix = "",
}: {
  item: PublishedItem;
  lead?: boolean;
  pick?: boolean;
  prefix?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const image = directImages.url(item.image_url);
  const evidenceLabels = {
    strong: "强证据",
    moderate: "中等证据",
    weak: "弱证据",
    disputed: "存在争议",
  };
  return (
    <article
      className={`story ${lead ? "lead-story" : ""} ${pick ? "top-pick" : ""}`}
      id={`${prefix}item-${item.id}`}
    >
      <div className="story-meta">
        <span>{item.category}</span>
        {pick && <b>TOP PICK</b>}
        {item.evidence && <small>{evidenceLabels[item.evidence]}</small>}
      </div>
      <h3>{item.title}</h3>
      {image && !imageFailed && (
        <img
          src={image}
          onError={() => setImageFailed(true)}
          alt=""
          loading={lead ? "eager" : "lazy"}
          className="story-image"
        />
      )}
      <p className="story-summary">{item.summary}</p>
      {item.why_it_matters && (
        <div className="why">
          <span>为什么值得关注</span>
          <p>{item.why_it_matters}</p>
        </div>
      )}
      {text(item.extra.repo) && (
        <div className="project-metrics">
          {typeof item.extra.github_stars === "number" && (
            <span>☆ {item.extra.github_stars.toLocaleString()}</span>
          )}
          {text(item.extra.stars_growth) && (
            <span>{text(item.extra.stars_growth)}</span>
          )}
          {text(item.extra.language) && (
            <span>{text(item.extra.language)}</span>
          )}
        </div>
      )}
      {text(item.extra.trend_signal) && (
        <p className="trend-signal">{text(item.extra.trend_signal)}</p>
      )}
      <div className="story-foot">
        {item.source_url ? (
          <a href={item.source_url} target="_blank" rel="noopener noreferrer">
            {item.source_name || "原始来源"} ↗
          </a>
        ) : (
          <span>{item.source_name || "来源未提供"}</span>
        )}
        {item.published_at && (
          <time dateTime={item.published_at}>
            {timeLabel(item.published_at)}
          </time>
        )}
      </div>
      <div className="tags">
        {item.tags.map((tag) => (
          <Link key={tag} to={`/search?q=${encodeURIComponent(tag)}`}>
            #{tag}
          </Link>
        ))}
        {item.appearances > 1 && (
          <small>
            首次 {item.first_seen.slice(5)} · 出现 {item.appearances} 天
          </small>
        )}
      </div>
    </article>
  );
}
function ReportSection({
  channel,
  report,
  skipId,
  prefix = "",
}: {
  channel: Channel;
  report?: PublishedReport;
  skipId?: number;
  prefix?: string;
}) {
  const info = CHANNELS[channel];
  return (
    <section className="report-section" id={`${prefix}${channel}`}>
      <header className="section-head">
        <span>{info.number}</span>
        <h2>
          {info.name}
          <small>{info.english}</small>
        </h2>
        <span className="section-count">
          {report
            ? channel === "market"
              ? "收盘观察"
              : `${report.items.length} 条选刊`
            : "等待成稿"}
        </span>
      </header>
      {!report ? (
        <div className="missing-report">
          <span>本期尚未生成</span>
          <p>这个频道还没有当日稿件。新稿件出版后，这里即可阅读。</p>
        </div>
      ) : (
        <>
          {report.source_missing && (
            <p className="source-note">源文件当前不可见，本地归档仍可阅读。</p>
          )}
          {report.summary && <p className="section-intro">{report.summary}</p>}
          {report.body.channel === "market" ? (
            <Market report={report.body} />
          ) : (
            <div className="stories">
              {report.items
                .filter((i) => !(channel === "frontier" && i.id === skipId))
                .map((item) => (
                  <Item
                    key={item.id}
                    item={item}
                    prefix={prefix}
                    pick={
                      report.body.channel === "trending" &&
                      report.body.top_picks.some(
                        (p) => p === item.extra.repo || p === item.title,
                      )
                    }
                  />
                ))}
            </div>
          )}
          {!report.items.length && report.body.channel !== "market" && (
            <p className="missing-report">本期已生成，暂无条目。</p>
          )}
        </>
      )}
    </section>
  );
}
function Market({ report }: { report: MarketReport }) {
  const metricNames = {
    turnover: "成交额",
    up_count: "上涨家数",
    down_count: "下跌家数",
    limit_up: "涨停",
    limit_down: "跌停",
  };
  return (
    <div className="market-paper">
      <div className="market-status">
        <span className={report.market_open ? "open" : ""}>
          {report.market_open ? "交易日" : "休市 / NON-TRADING DAY"}
        </span>
        <small>{report.sentiment.stage}</small>
      </div>
      {report.indices.some((i) => i.close !== null) && (
        <div className="indices">
          {report.indices
            .filter((i) => i.close !== null)
            .map((i) => (
              <div key={i.code || i.name}>
                <small>{i.name}</small>
                <strong>
                  {i.close?.toLocaleString("zh-CN", {
                    minimumFractionDigits: 2,
                  })}
                </strong>
                {i.change_pct !== null && (
                  <span className={i.change_pct >= 0 ? "gain" : "loss"}>
                    {i.change_pct > 0 ? "+" : ""}
                    {i.change_pct.toFixed(2)}%
                  </span>
                )}
              </div>
            ))}
        </div>
      )}
      <div className="market-metrics">
        {Object.entries(metricNames).map(([k, name]) => {
          const value = report.metrics[k as keyof typeof report.metrics];
          return value !== null ? (
            <span key={k}>
              <small>{name}</small>
              <b>
                {typeof value === "number" ? value.toLocaleString() : value}
              </b>
            </span>
          ) : null;
        })}
      </div>
      <div className="market-analysis">
        <div>
          <span className="kicker">THE BIG PICTURE / 综合分析</span>
          <h3>
            {report.market_open
              ? "读懂市场，也读懂不确定性。"
              : "没有行情的日子，观察仍在继续。"}
          </h3>
          <p>{report.analysis}</p>
          <h4>市场情绪</h4>
          <p>{report.sentiment.summary}</p>
          {report.sentiment.evidence.length > 0 && (
            <ul>
              {report.sentiment.evidence.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
          {[
            ["领涨板块", report.leading_sectors],
            ["领跌板块", report.lagging_sectors],
          ].map(
            ([name, sectors]) =>
              (sectors as MarketReport["leading_sectors"]).length > 0 && (
                <div key={name as string}>
                  <h4>{name as string}</h4>
                  {(sectors as MarketReport["leading_sectors"]).map((s, i) => (
                    <p key={i}>
                      <b>{s.name}</b> · {s.reason}
                    </p>
                  ))}
                </div>
              ),
          )}
        </div>
        <aside>
          <span className="kicker">WHAT TO WATCH</span>
          <h3>
            未来情景 <small>{report.outlook.horizon}</small>
          </h3>
          {report.outlook.scenarios.map((s, i) => (
            <div className="scenario" key={i}>
              <b>
                0{i + 1} / {s.name}
              </b>
              <p>{s.conditions}</p>
              <small>{s.implication}</small>
            </div>
          ))}
          {[
            ["风险", report.outlook.risks],
            ["机会观察", report.outlook.opportunities],
          ].map(
            ([name, values]) =>
              (values as string[]).length > 0 && (
                <div className="scenario" key={name as string}>
                  <h4>{name as string}</h4>
                  <ul>
                    {(values as string[]).map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              ),
          )}
        </aside>
      </div>
      {report.sources.length > 0 && (
        <div className="market-sources">
          <span>资料来源</span>
          {report.sources.map((s, i) =>
            s.url ? (
              <a key={i} href={s.url} target="_blank" rel="noopener noreferrer">
                {s.name} ↗
              </a>
            ) : (
              <span key={i}>{s.name}</span>
            ),
          )}
        </div>
      )}
    </div>
  );
}
function PageTitle({
  english,
  title,
  children,
}: {
  english: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-title">
      <span className="kicker">{english}</span>
      <h1>{title}</h1>
      {children}
    </header>
  );
}
function ArchivePage() {
  const { data, error } = useApi<{ days: ArchiveEntry[] }>("/api/archive");
  const [params, setParams] = useSearchParams();
  if (!data) return <State error={error} />;
  const months = [...new Set(data.days.map((d) => d.date.slice(0, 7)))],
    month = months.includes(params.get("month") || "")
      ? params.get("month")!
      : months[0];
  const entries = data.days.filter((d) => d.date.startsWith(month || ""));
  const days = month
    ? new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate()
    : 0;
  const firstDay = month
    ? (new Date(`${month}-01T12:00:00+08:00`).getUTCDay() + 6) % 7
    : 0;
  return (
    <>
      <PageTitle english="THE BOUND VOLUME" title="日报合订本">
        <p>
          每一天都有位置。共 {data.days.length} 期，{months.length} 个月。
        </p>
      </PageTitle>
      {!months.length ? (
        <State error="合订本还是空的">
          <Link to="/settings">查看出版状态 ↗</Link>
        </State>
      ) : (
        <>
          <div className="archive-toolbar">
            <h2>{month?.replace("-", " / ")}</h2>
            <div className="legend">
              <span>
                <i className="complete-dot" />
                完整
              </span>
              <span>
                <i className="partial-dot" />
                缺频道
              </span>
              <span>
                <i />
                无数据
              </span>
            </div>
            <label>
              月份{" "}
              <select
                value={month}
                onChange={(e) => setParams({ month: e.target.value })}
              >
                {months.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="calendar">
            {["一", "二", "三", "四", "五", "六", "日"].map((w) => (
              <div className="week-label" key={w}>
                周{w}
              </div>
            ))}
            {Array.from({ length: firstDay }, (_, i) => (
              <div className="blank-day" key={`blank-${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const date = `${month}-${String(i + 1).padStart(2, "0")}`,
                entry = entries.find((e) => e.date === date);
              return entry ? (
                <Link
                  key={date}
                  to={`/day/${date}`}
                  className={`calendar-day ${entry.complete ? "complete" : "partial"}`}
                  aria-label={`${date} ${entry.complete ? "三频道完整" : "缺少频道"}`}
                >
                  <strong>{String(i + 1).padStart(2, "0")}</strong>
                  <span>
                    {channels.map((c) => (
                      <i
                        key={c}
                        className={entry.counts[c] === null ? "" : "filled"}
                      />
                    ))}
                  </span>
                </Link>
              ) : (
                <div className="calendar-day no-data" key={date}>
                  <strong>{String(i + 1).padStart(2, "0")}</strong>
                  <small>—</small>
                </div>
              );
            })}
          </div>
          <div className="archive-list">
            {entries.map((entry) => (
              <Link key={entry.date} to={`/day/${entry.date}`}>
                <div>
                  <strong>{entry.date.slice(8)}</strong>
                  <span>{weekday(entry.date)}</span>
                </div>
                <h3>
                  {entry.date.replaceAll("-", ".")}
                  <small>{entry.complete ? "完整刊" : "待补齐"}</small>
                </h3>
                <p>
                  {channels.map((c) => (
                    <span key={c}>
                      {CHANNELS[c].name}{" "}
                      <b>
                        {entry.counts[c] === null
                          ? "未生成"
                          : c === "market"
                            ? "✓"
                            : entry.counts[c]}
                      </b>
                    </span>
                  ))}
                </p>
                <span>↗</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
function ChannelPage({ channel }: { channel: Channel }) {
  const { data, error } = useApi<{ reports: PublishedReport[] }>(
    `/api/channel/${channel}`,
  );
  if (!data) return <State error={error} />;
  return (
    <>
      <PageTitle
        english={`${CHANNELS[channel].english} / THE CONTINUING FILE`}
        title={CHANNELS[channel].name}
      >
        <p>
          最近 {data.reports.length} 期 ·{" "}
          {channel === "market"
            ? "按日期阅读市场观察"
            : `${data.reports.reduce((s, r) => s + r.items.length, 0)} 条内容`}
        </p>
      </PageTitle>
      {!data.reports.length && (
        <p className="empty-state">该频道还没有日报。</p>
      )}
      {data.reports.map((report) => (
        <div className="channel-issue" key={report.id}>
          <div className="channel-date">
            <Link to={`/day/${report.date}`}>
              {dateLabel(report.date)} <span>阅读当期完整日报 ↗</span>
            </Link>
            {report.source_type === "fixture" && <small>演示刊</small>}
          </div>
          <ReportSection
            channel={channel}
            report={report}
            prefix={`${report.date}-`}
          />
        </div>
      ))}
    </>
  );
}
function SearchPage() {
  const [params, setParams] = useSearchParams(),
    query = params.get("q") || "",
    [input, setInput] = useState(query);
  const { data, error } = useApi<{ results: SearchResult[] }>(
    `/api/search?q=${encodeURIComponent(query)}`,
  );
  useEffect(() => setInput(query), [query]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setParams(input.trim() ? { q: input.trim() } : {});
  };
  return (
    <>
      <PageTitle english="FIND IT AGAIN" title="在历史里找到线索">
        <p>搜索标题、摘要、标签与来源。内容来自已经归档的日报。</p>
      </PageTitle>
      <form className="search-form" onSubmit={submit}>
        <label className="sr-only" htmlFor="query">
          搜索日报
        </label>
        <input
          id="query"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={200}
          placeholder="试试「本地」「SQLite」或项目名称"
        />
        <button type="submit">搜索 ↗</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {query && data && (
        <p className="search-count">
          “{query}” · {data.results.length} 条结果
          {data.results.length === 50 ? "（最多显示 50 条）" : ""}
        </p>
      )}
      {query && data?.results.length === 0 && (
        <div className="empty-state">
          <h2>还没有找到这条线索</h2>
          <p>试试更短的关键词，或确认相关日报已经出版。</p>
        </div>
      )}
      <div className="search-results">
        {data?.results.map((result, i) => (
          <article key={`${result.href}-${i}`}>
            <div className="kicker">
              {CHANNELS[result.channel].name} · {result.date}
            </div>
            <Link to={result.href}>
              <h2>
                {result.title} <span>↗</span>
              </h2>
            </Link>
            <p>{result.snippet}</p>
            <small>{result.source_name}</small>
          </article>
        ))}
      </div>
      {!query && (
        <p className="search-hint">把一次发现，变成随时可以回到的地方。</p>
      )}
    </>
  );
}
function SettingsPage() {
  const { data: status, error } = useApi<PublicationStatus>("/api/status");
  if (!status) return <State error={error} />;
  return (
    <>
      <PageTitle english="PUBLICATION STATUS" title="云端出版状态">
        <p>已出版的日报随时可读。新稿件由云端发布流程更新。</p>
      </PageTitle>
      <dl className="settings-details">
        <div>
          <dt>出版方式</dt>
          <dd>静态日报 · SOTA V2</dd>
        </div>
        <div>
          <dt>最后构建</dt>
          <dd>{timeLabel(status.built_at)}</dd>
        </div>
        <div>
          <dt>部署完成时间</dt>
          <dd>
            以{" "}
            <a
              href={status.actions_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Actions 部署记录 ↗
            </a>
            为准；构建时间不代表部署完成。
          </dd>
        </div>
        <div>
          <dt>源码版本</dt>
          <dd>{status.commit?.slice(0, 12) || "本地预览"}</dd>
        </div>
        <div>
          <dt>最新稿件时间</dt>
          <dd>{timeLabel(status.last_sync)}</dd>
        </div>
        <div>
          <dt>已归档日报</dt>
          <dd>{status.imported_reports} 期频道稿件</dd>
        </div>
        <div>
          <dt>最新日报</dt>
          <dd>{status.latest_report || "暂无"}</dd>
        </div>
      </dl>
      <dl className="settings-details">
        {channels.map((channel) => (
          <div key={channel}>
            <dt>{CHANNELS[channel].name}最新一期</dt>
            <dd>{status.channel_latest[channel] || "尚无有效日报"}</dd>
          </div>
        ))}
      </dl>
      <p className="settings-note">
        本站显示上次成功发布的静态快照。新的部署是否失败、任务是否上传成功，需要查看
        Actions 或任务会话；不会因网站可读就判定三任务成功。
      </p>
      <p>
        <a
          href={status.repository_url}
          target="_blank"
          rel="noopener noreferrer"
        >
          原始稿库 ↗
        </a>{" "}
        ·{" "}
        <a href={status.actions_url} target="_blank" rel="noopener noreferrer">
          构建与部署记录 ↗
        </a>
      </p>
      <section className="status-section">
        <h2>
          解析失败 <span>{status.errors.length}</span>
        </h2>
        {status.errors.length ? (
          status.errors.map((e) => (
            <div className="error-row" key={e.source_id}>
              <b>{e.source_id}</b>
              <p>{e.error}</p>
            </div>
          ))
        ) : (
          <p>本次快照没有解析失败。缺报与解析失败分开记录。</p>
        )}
      </section>
      <section className="status-section">
        <h2>
          缺频道日期 <span>{status.missing_days.length}</span>
        </h2>
        {status.missing_days.length ? (
          status.missing_days.map((day) => (
            <p key={day.date}>
              <Link to={`/day/${day.date}`}>{day.date}</Link> ·{" "}
              {channels
                .filter((c) => day.counts[c] === null)
                .map((c) => CHANNELS[c].name)
                .join("、")}{" "}
              缺报
            </p>
          ))
        ) : (
          <p>
            {status.imported_reports
              ? "已归档日期均完整。"
              : "尚未有正式日报；历史不会用演示内容替代。"}
          </p>
        )}
      </section>
      <div className="settings-actions">
        <button className="secondary" onClick={() => window.location.reload()}>
          刷新状态
        </button>
      </div>
      <p className="settings-note">
        阅读和搜索均使用本站已发布的数据。若最新稿件尚未出现，请等待下一次出版。
      </p>
      <section className="status-section">
        <h2>
          稿件提示{" "}
          <span>
            {status.warnings.reduce((s, r) => s + r.warnings.length, 0)}
          </span>
        </h2>
        <p>缺失的可选字段不会阻止阅读；页面只展示已确认的数据。</p>
        {status.warnings.map((report) => (
          <details key={`${report.channel}-${report.date}`}>
            <summary>
              {report.date} · {CHANNELS[report.channel].name} ·{" "}
              {report.warnings.length} 条提示
            </summary>
            <ul>
              {report.warnings.map((w, i) => (
                <li key={i}>
                  <code>{w.path}</code> {w.message}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </section>
    </>
  );
}
