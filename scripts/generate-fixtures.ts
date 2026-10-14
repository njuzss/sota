import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ReportItem, ReportV1 } from "../src/contracts.js";
// All prose/metrics are synthetic demonstrations, not historical reporting.
const root = "fixtures/reports";
mkdirSync(root, { recursive: true });
mkdirSync("fixtures/cases", { recursive: true });
const dates = [
  "2026-09-28",
  "2026-09-29",
  "2026-10-01",
  "2026-10-02",
  "2026-10-03",
];
const titles = [
  "从工具到工作流：让研究结果真正留下来",
  "可信的信息，首先要有可追溯的来源",
  "让本地优先成为一种阅读方式",
  "少一点噪音，多一点可复查的证据",
  "把每天的发现，编成一本可以回看的报纸",
];
function item(
  title: string,
  summary: string,
  extra: Partial<ReportItem> = {},
): ReportItem {
  return {
    title,
    summary,
    why_it_matters: "演示内容：关注可以验证的变化，并保留来源与不确定性。",
    category: "TECH",
    tags: ["演示", "研究"],
    source_name: "演示编辑部",
    source_url: null,
    image_url: null,
    published_at: null,
    evidence: null,
    extra: {},
    ...extra,
  };
}
for (const [index, date] of dates.entries()) {
  const base = {
    schema_version: 1 as const,
    date,
    generated_at: `${date}T08:10:00+08:00`,
  };
  const frontier: ReportV1 = {
    ...base,
    channel: "frontier",
    title: "每日前沿简报",
    summary: `演示日报 · ${titles[index]}。本期聚焦可验证的研究、开源工具与本地数据的长期价值。所有叙述仅用于界面和导入测试。`,
    items: [
      item(
        titles[index],
        "当一条信息有了日期、来源和上下文，它才开始成为可以反复使用的知识。结构化日报把一次阅读连接到长期观察，而原始稿件让每次修改都有据可查。",
        {
          category: "AI",
          tags: ["演示", "Agent", "研究工作流"],
          source_name: "演示研究札记",
          evidence: "moderate",
          published_at: `${date}T07:30:00+08:00`,
          image_url:
            index === 4
              ? "http://127.0.0.1:3000/fixture-missing-image.png"
              : null,
        },
      ),
      item(
        "医学研究：区分观察信号与因果结论",
        "演示条目：同样的结果，在不同研究设计下会有不同的解释。阅读论文时，同时记录样本、方法和局限，比只记住一个醒目的数字更有帮助。",
        {
          category: "MEDICINE",
          tags: ["循证", "演示"],
          evidence: "strong",
          source_name: "研究方法演示",
          extra: { notes: "不描述真实临床结果" },
        },
      ),
      item(
        "SQLite 与本地全文搜索：小系统也能有完整记忆",
        `第 ${index + 1} 次演示观察。数据留在本地，页面读取已经生成的内容；中文检索、英文项目名和历史归档可以共用一个轻量存储。`,
        {
          category: "OPEN_SOURCE",
          tags: ["SQLite", "本地优先"],
          source_name: "SQLite Documentation",
          source_url: "https://sqlite.org/fts5.html",
          evidence: "strong",
        },
      ),
      item(
        "宏观观察：把事实、解释和情景放在不同位置",
        "演示条目：明确哪些是已经发生的事实，哪些是对事实的解释，哪些依赖未来条件。未能核实的指标保留为空，也能帮助读者判断信息边界。",
        { category: "MACRO", tags: ["宏观", "不确定性"], evidence: "weak" },
      ),
    ],
  };
  const trending: ReportV1 = {
    ...base,
    generated_at: `${date}T09:00:00+08:00`,
    channel: "trending",
    title: "Daily Trending Projects",
    summary:
      "演示选刊：可组合的开发工具、本地数据和轻量工作流。项目链接为真实官方仓库；选择、热度信号与数值均为演示，不代表当日 Trending。",
    top_picks: ["vitejs/vite", "fastify/fastify", "drizzle-team/drizzle-orm"],
    items: [
      item(
        "vitejs/vite",
        `演示第 ${index + 1} 期：为现代 Web 提供快速反馈的构建工具。`,
        {
          category: "DEVTOOLS",
          tags: ["TypeScript", "开发工具"],
          source_name: "GitHub",
          source_url: "https://github.com/vitejs/vite",
          extra: {
            repo: "vitejs/vite",
            github_stars: index === 0 ? null : 10000 + index * 100,
            stars_growth: null,
            trend_signal: "演示观察信号（非真实热度）",
            language: "TypeScript",
          },
        },
      ),
      item(
        "fastify/fastify",
        "演示条目：轻量 HTTP 服务，把源数据同步与阅读接口清楚分开。",
        {
          category: "BACKEND",
          tags: ["Node.js", "API"],
          source_name: "GitHub",
          source_url: "https://github.com/fastify/fastify",
          extra: {
            repo: "fastify/fastify",
            github_stars: null,
            stars_growth: null,
            trend_signal: "演示选刊",
            language: "JavaScript",
          },
        },
      ),
      item(
        "drizzle-team/drizzle-orm",
        "演示条目：类型化的数据访问工具。本地项目应先判断是否需要额外抽象。",
        {
          category: "DATA",
          tags: ["SQLite", "TypeScript"],
          source_name: "GitHub",
          source_url: "https://github.com/drizzle-team/drizzle-orm",
          extra: {
            repo: "drizzle-team/drizzle-orm",
            github_stars: null,
            stars_growth: null,
            trend_signal: "演示选刊",
            language: "TypeScript",
          },
        },
      ),
      item(
        "一个没有 GitHub 指标的工具",
        "演示条目：产品没有 star 指标时，直接展示功能和观察理由。",
        {
          category: "PRODUCTIVITY",
          tags: [],
          extra: {
            repo: null,
            github_stars: null,
            stars_growth: null,
            language: null,
            trend_signal: null,
          },
        },
      ),
    ],
  };
  const open = index < 2;
  const market: ReportV1 = {
    ...base,
    generated_at: `${date}T16:10:00+08:00`,
    channel: "market",
    title: "A 股收盘点评",
    summary: open
      ? "模拟交易日 · 量能与结构观察"
      : "休市观察 · 保留时间的连续性",
    market_open: open,
    indices: ["上证指数", "深证成指", "创业板指", "科创 50"].map((name, i) => ({
      name,
      code: ["000001", "399001", "399006", "000688"][i],
      close: open ? [3200, 10200, 2100, 950][i] + index * 10 : null,
      change_pct: open ? [0.42, -0.31, 0.86, 1.12][i] : null,
    })),
    metrics: {
      turnover: open ? "演示：1.2 万亿元" : null,
      up_count: open ? 2800 : null,
      down_count: open ? 2300 : null,
      limit_up: null,
      limit_down: null,
    },
    leading_sectors: open
      ? [{ name: "模拟科技板块", reason: "演示：结构性观察，不代表实际行情。" }]
      : [],
    lagging_sectors: open
      ? [{ name: "模拟防御板块", reason: "演示：与风险偏好的关系仍需验证。" }]
      : [],
    sentiment: {
      stage: open ? "演示 · 分歧中观察" : "休市",
      summary: open
        ? "仅用于展示正负数值和市场分析布局，不能作为历史市场信息。"
        : "本期无当日行情指标，不把最近交易日数据当作今日收盘。",
      evidence: ["所有市场数值均为测试数据。"],
    },
    analysis: open
      ? "演示分析：指数表现和市场广度可能给出不同信号。先观察成交与板块结构，再讨论可能的解释；没有可靠数据的指标保持 null。"
      : "非交易日演示。连续保存每日稿件，使读者仍可查看休市说明与下一交易日的关注事项。这里没有引用真实最近交易日行情。",
    outlook: {
      horizon: "1-5 trading days",
      scenarios: [
        {
          name: "量能改善",
          conditions: "若后续成交与市场广度同时改善",
          implication: "演示：可以进一步观察参与范围是否扩大。",
        },
        {
          name: "结构分化",
          conditions: "若热点集中且广度没有改善",
          implication: "演示：继续核实结构信号的持续性。",
        },
      ],
      risks: ["演示：数据口径变化与信息缺失。"],
      opportunities: ["演示：观察有公开证据支持的结构变化。"],
    },
    sources: [
      {
        name: "上海证券交易所（仅供来源链接展示）",
        url: "https://www.sse.com.cn/",
      },
    ],
  };
  for (const report of [
    frontier,
    ...(date === "2026-10-02" ? [] : [trending]),
    market,
  ])
    writeFileSync(
      join(root, `PH_${report.channel.toUpperCase()}_${date}.json`),
      JSON.stringify(report, null, 2) + "\n",
    );
  if (index === 4) {
    writeFileSync(
      "fixtures/cases/update-frontier.json",
      JSON.stringify(
        {
          ...frontier,
          generated_at: `${date}T12:00:00+08:00`,
          title: "每日前沿简报 · 修订版",
          items: frontier.items.slice(0, 2),
        },
        null,
        2,
      ),
    );
    writeFileSync(
      "fixtures/cases/null-fields.json",
      JSON.stringify(
        {
          ...frontier,
          items: [
            { title: "不完整条目", summary: null, image_url: null, tags: null },
          ],
        },
        null,
        2,
      ),
    );
  }
}
writeFileSync(
  "fixtures/cases/bad-json.txt",
  '{ "schema_version": 1, broken JSON',
);
console.log("已生成 5 天 / 14 期演示日报 + 更新/null/坏文件场景。");
