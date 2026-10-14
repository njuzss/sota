# SOTA V2 Scheduled Task Prompts

以下三份完整 Prompt 继承旧版选题、原始来源、图片、医学证据和市场情景规则，仅调整 GitHub 交付与核验。以 schemas/report-v1.schema.json 为数据契约。

2026-10-14 用户明确选择新建三个独立 ChatGPT 云端任务，而非替换旧任务。新任务名称使用「SOTA V2 · 每日前沿简报」「SOTA V2 · 热门项目」「SOTA V2 · A股收盘点评」；原任务的提示词与时间配置保留；为解除 5 个活跃任务的账户额度限制，用户随后明确授权仅暂停旧「A股收盘点评」，其余旧任务继续开启。三个新任务均已创建并开启。计划为前沿/Trending 每日 08:00、市场周一至周五 15:30，均使用 Asia/Shanghai，并从下一个计划时刻执行，不在创建时立即采集或写 GitHub。以下完整提示词用于新任务；创建与首次成功交付需分别核验。

# 2. 每日前沿简报

建议任务名称：

    每日前沿简报

建议 Prompt：

每天早晨制作一份“最关心话题”前沿简报，并将正式结果直接写入 GitHub 仓库 njuzss/sota 的 main 分支，供 SOTA 云端静态日报读取。

【内容要求】

只保留当天最值得关注的约 20 条，不要为了凑数量降低质量。

重点覆盖：

- AI / 大模型 / Agent / Codex
- 医学循证 / 新药 / 临床研究
- 科技 / 软件 / 开源项目
- 宏观经济 / 利率 / 资本市场
- GitHub Trending 与 X 上近期流行的开源项目
- 中国 / 中文互联网值得关注的重要进展

筛选原则：

1. 前沿研究优先。
2. 重大新闻优先。
3. 冷门但高价值的信息可以入选。
4. 全球英文信息源为主，同时重点覆盖中国和中文互联网。
5. 优先使用论文、监管机构、公司公告、官方博客、项目仓库等一手来源。
6. 可以辅助参考高质量媒体、开发者社区、GitHub 和 X。
7. 避免连续几天重复同一事件，除非存在实质性新进展。
8. 如果当天真正高价值内容不足 20 条，可以少于 20 条。
9. 同一个事件有多个来源时，优先保留最原始、最权威的来源。
10. 不要仅因为社交媒体热度高就提高优先级，应同时考虑实际信息价值。

每条内容尽量包含：

- 简洁标题
- 2~4 句摘要
- 为什么值得关注
- 分类
- 标签
- 原始来源名称
- 原始来源链接
- 发布时间，如能确认
- 一张合适的相关图片 URL，如能可靠获得
- 必要时指出证据强弱、可信度或争议

分类优先使用：

- AI
- MEDICINE
- TECH
- MACRO
- OPEN_SOURCE
- CHINA
- OTHER

【证据字段】

evidence 只使用：

- strong
- moderate
- weak
- disputed
- null

不要把主观“我觉得重要”当成证据等级。

【正式数据输出与核验】

唯一交付目标：GitHub 仓库 njuzss/sota，分支 main。
唯一正式文件路径：data/reports/frontier/PH_FRONTIER_<YYYY-MM-DD>.json。
日期使用本次执行的 Asia/Shanghai 自然日；目录频道、文件名、JSON 顶层 channel/date 必须完全一致。schema_version 固定为 1，generated_at 使用真实带时区时间。

1. 先完成以下内容的事实核验和 JSON 校验，再通过 GitHub Connector 读取此路径。
2. 不存在时 create；存在时读取最新正文与 blob SHA，按最新 SHA update。同一 channel/date 只保留这一条路径，不能创建副本或改其他频道。
3. 正文为 UTF-8 严格 JSON，不含 code fence、前后说明、凭据或个人隐私；字段结构遵守 schemas/report-v1.schema.json。未知可靠数字/URL/图片用 null。
4. 409/422 冲突时重新读取最新 SHA；限流/连接失败按服务提示有限退避。总计最多 3 次写入尝试。重读若正文已是本次有效稿，按幂等成功处理；无依据不覆盖较新稿。
5. 写完必须从 GitHub 读回正文并用标准 JSON parser 解析，核对 channel、date、schema_version 及关键内容，不能只凭写入响应宣布成功。
6. 成功后在任务会话简要汇报频道、日期、条数/交易状态和完整 GitHub 文件链接；失败则明确写失败阶段与原因，不得声称完成。
7. 不写 manifest、索引、dist 或其他任务文件；不自动回退 Drive，除非用户明确启用应急交付；不修改任务执行时间。

JSON 顶层结构：

    {
      "schema_version": 1,
      "channel": "frontier",
      "date": "YYYY-MM-DD",
      "generated_at": "ISO 8601 timestamp with timezone",
      "title": "每日前沿简报",
      "summary": "用 2~4 句话概括今天整体最重要的变化",
      "items": [
        {
          "title": "...",
          "summary": "...",
          "why_it_matters": "...",
          "category": "AI",
          "tags": ["..."],
          "source_name": "...",
          "source_url": "https://...",
          "image_url": "https://... or null",
          "published_at": "ISO timestamp or null",
          "evidence": "strong | moderate | weak | disputed | null",
          "extra": {}
        }
      ]
    }

要求：

- 不要编造链接、发布时间、图片 URL 或指标。
- 不确定字段使用 null。
- URL 使用完整绝对地址。
- source_url 尽量指向论文、官方公告、官方博客、项目仓库等原始来源。
- 如果一条内容存在重要争议，可以在 extra 中补充 controversy 或 notes。
- JSON 必须能够直接被标准 JSON parser 解析。
- 写入并读回核验成功后，回复生成条数、频道/日期和 GitHub 文件链接。

---

# 3. Daily Trending Projects

建议任务名称：

    Daily Trending Projects

建议 Prompt：

每天制作一份高质量的 Trending / Popular Projects 简报，并将正式结果直接写入 GitHub 仓库 njuzss/sota 的 main 分支，供 SOTA 云端静态日报读取。

【覆盖范围】

不要只关注单一类型，包括但不限于：

- GitHub 开源项目
- AI / Agent 工具
- Skills
- Plugins
- Apps
- macOS / Windows / Linux 桌面工具
- CLI / TUI
- 浏览器扩展
- 开发者工具
- Productivity tools
- Creative tools
- 有趣、实验性或技术上新颖的软件

主要观察：

- GitHub Trending
- GitHub star 增长
- X / Twitter 开发者讨论
- Hacker News
- Reddit
- 开发者社区
- Product launch buzz
- 技术社区传播

优先选择：

- 最近突然获得大量关注
- 新发布且技术上有意思
- 实用性明显
- 有潜力真正使用
- 有明显开发者传播
- 不常见但很有创意
- 对 AI / Agent / 开发工作流有直接价值

每天约 15~20 个强项目。

不要为了数量纳入平庸项目。

避免重复最近几天已经介绍过的项目，除非：

- 有重大版本更新
- 突然爆红
- star / 社区讨论显著变化
- 出现值得关注的新能力
- 项目定位发生明显变化

选出：

    Top 3 worth trying today

Top 3 要基于实际产品价值和当日信号，不要夸大弱信号。

【每个项目】

尽量包含：

- 项目名称
- owner/repo，如适用
- 一句话说明它做什么
- 简短摘要
- 为什么值得关注
- 为什么最近在流行
- 原始项目链接
- GitHub stars，如能可靠获取
- star 增速，如能可靠判断
- 主要语言，如适用
- trend signal
- 标签
- 相关图片 URL，如能可靠获取

拿不到的指标填 null，不允许猜测。

【正式数据输出与核验】

唯一交付目标：GitHub 仓库 njuzss/sota，分支 main。
唯一正式文件路径：data/reports/trending/PH_TRENDING_<YYYY-MM-DD>.json。
日期使用本次执行的 Asia/Shanghai 自然日；目录频道、文件名、JSON 顶层 channel/date 必须完全一致。schema_version 固定为 1，generated_at 使用真实带时区时间。

1. 先完成以下内容的事实核验和 JSON 校验，再通过 GitHub Connector 读取此路径。
2. 不存在时 create；存在时读取最新正文与 blob SHA，按最新 SHA update。同一 channel/date 只保留这一条路径，不能创建副本或改其他频道。
3. 正文为 UTF-8 严格 JSON，不含 code fence、前后说明、凭据或个人隐私；字段结构遵守 schemas/report-v1.schema.json。未知可靠数字/URL/图片用 null。
4. 409/422 冲突时重新读取最新 SHA；限流/连接失败按服务提示有限退避。总计最多 3 次写入尝试。重读若正文已是本次有效稿，按幂等成功处理；无依据不覆盖较新稿。
5. 写完必须从 GitHub 读回正文并用标准 JSON parser 解析，核对 channel、date、schema_version 及关键内容，不能只凭写入响应宣布成功。
6. 成功后在任务会话简要汇报频道、日期、条数/交易状态和完整 GitHub 文件链接；失败则明确写失败阶段与原因，不得声称完成。
7. 不写 manifest、索引、dist 或其他任务文件；不自动回退 Drive，除非用户明确启用应急交付；不修改任务执行时间。

结构：

    {
      "schema_version": 1,
      "channel": "trending",
      "date": "YYYY-MM-DD",
      "generated_at": "ISO 8601 timestamp with timezone",
      "title": "Daily Trending Projects",
      "summary": "概括今天项目生态最明显的趋势",
      "top_picks": [
        "owner/repo"
      ],
      "items": [
        {
          "title": "owner/repo or product name",
          "summary": "...",
          "why_it_matters": "...",
          "category": "...",
          "tags": ["..."],
          "source_name": "GitHub",
          "source_url": "https://...",
          "image_url": "https://... or null",
          "published_at": null,
          "evidence": null,
          "extra": {
            "repo": "owner/repo or null",
            "github_stars": 12345,
            "stars_growth": "+1200/24h or null",
            "trend_signal": "...",
            "language": "TypeScript or null"
          }
        }
      ]
    }

要求：

- top_picks 最多 3 个。
- top_picks 中的值必须能对应到 items。
- 所有数字指标必须来自可靠公开信息。
- stars_growth 如果无法可靠计算或找到可信变化信号，填 null。
- source_url 优先指向 GitHub 原始仓库或官方项目页面。
- 不确定字段填 null。
- JSON 必须可直接被标准 parser 解析。
- GitHub 写入并读回核验成功后，回复项目数、Top 3 数量和 GitHub 文件链接。

---

# 4. A 股收盘点评

建议任务名称：

    A股收盘点评

建议 Prompt：

在每个 A 股交易日收盘后生成当日 A 股收盘点评，并将正式结果直接写入 GitHub 仓库 njuzss/sota 的 main 分支，供 SOTA 云端静态日报读取。

【分析内容】

重点分析：

- 上证指数
- 深证成指
- 创业板
- 科创相关主要指数
- 成交额与量能变化
- 上涨 / 下跌家数
- 涨停 / 跌停
- 主要领涨板块
- 主要领跌板块
- 核心市场驱动
- 重要政策 / 宏观 / 行业因素
- 资金与市场情绪

如果某类资金数据已经不可比、暂停发布、口径发生变化或无法可靠获取，不要机械引用。

明确区分：

- 已确认事实
- 市场解释
- 推断
- 不确定性

对短线市场情绪进行描述，但不得把主观判断表达为确定事实。

最后给出未来 1~5 个交易日的多个情景分析，包括：

- 可能的核心变量
- 主要风险
- 值得继续观察的机会方向

不要做确定性涨跌承诺。

不要把投资建议写成确定性指令。

【非交易日】

如果当天不是 A 股交易日，仍创建当天文件，并设置：

    "market_open": false

同时简短说明：

- 当日休市原因，如可确认
- 最近一个交易日概况
- 下一个交易日值得关注的事项

【正式数据输出与核验】

唯一交付目标：GitHub 仓库 njuzss/sota，分支 main。
唯一正式文件路径：data/reports/market/PH_MARKET_<YYYY-MM-DD>.json。
日期使用本次执行的 Asia/Shanghai 自然日；目录频道、文件名、JSON 顶层 channel/date 必须完全一致。schema_version 固定为 1，generated_at 使用真实带时区时间。

1. 先完成以下内容的事实核验和 JSON 校验，再通过 GitHub Connector 读取此路径。
2. 不存在时 create；存在时读取最新正文与 blob SHA，按最新 SHA update。同一 channel/date 只保留这一条路径，不能创建副本或改其他频道。
3. 正文为 UTF-8 严格 JSON，不含 code fence、前后说明、凭据或个人隐私；字段结构遵守 schemas/report-v1.schema.json。未知可靠数字/URL/图片用 null。
4. 409/422 冲突时重新读取最新 SHA；限流/连接失败按服务提示有限退避。总计最多 3 次写入尝试。重读若正文已是本次有效稿，按幂等成功处理；无依据不覆盖较新稿。
5. 写完必须从 GitHub 读回正文并用标准 JSON parser 解析，核对 channel、date、schema_version 及关键内容，不能只凭写入响应宣布成功。
6. 成功后在任务会话简要汇报频道、日期、条数/交易状态和完整 GitHub 文件链接；失败则明确写失败阶段与原因，不得声称完成。
7. 不写 manifest、索引、dist 或其他任务文件；不自动回退 Drive，除非用户明确启用应急交付；不修改任务执行时间。

结构：

    {
      "schema_version": 1,
      "channel": "market",
      "date": "YYYY-MM-DD",
      "generated_at": "ISO 8601 timestamp with timezone",
      "title": "A股收盘点评",
      "market_open": true,
      "indices": [
        {
          "name": "上证指数",
          "code": "000001",
          "close": null,
          "change_pct": null
        }
      ],
      "metrics": {
        "turnover": null,
        "up_count": null,
        "down_count": null,
        "limit_up": null,
        "limit_down": null
      },
      "leading_sectors": [
        {
          "name": "...",
          "reason": "..."
        }
      ],
      "lagging_sectors": [
        {
          "name": "...",
          "reason": "..."
        }
      ],
      "sentiment": {
        "stage": "...",
        "summary": "...",
        "evidence": ["..."]
      },
      "analysis": "...",
      "outlook": {
        "horizon": "1-5 trading days",
        "scenarios": [
          {
            "name": "...",
            "conditions": "...",
            "implication": "..."
          }
        ],
        "risks": ["..."],
        "opportunities": ["..."]
      },
      "sources": [
        {
          "name": "...",
          "url": "https://..."
        }
      ]
    }

要求：

- 不得编造行情数据。
- 数字无法可靠核实时填 null。
- 尽量使用交易所、监管机构、指数公司、权威金融数据来源。
- 保留重要来源 URL。
- 任何情景分析都必须写成条件式，不写成确定性预测。
- JSON 必须可以被标准 parser 直接解析。
- 写入成功后，Task 回复只简短说明已经写入当日 A 股报告。
