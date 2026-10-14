# SOTA / Personal HOT 需求说明

> 状态：V1 实施基线（2026-10-03 更新：普通 JSON + Drive Desktop 本地同步为默认路径）
> 目录：sota/  
> 参考项目：KKKKhazix/AIHOT  
> 核心原则：ChatGPT Scheduled Tasks 负责云端采集、筛选、分析与写作；Google Drive 负责云端持久化和分发；SOTA 本地服务负责同步、规范化、归档、搜索和展示。

## 1. 背景与问题

当前已有三个稳定运行的 ChatGPT Scheduled Tasks：

1. 每日前沿简报
2. Daily Trending Projects
3. A 股收盘点评

这些任务已经承担了最重要、也最昂贵的工作：

- 联网搜索与资料发现
- 信息筛选
- 基础去重
- 事实核验
- 摘要与分析
- 来源整理
- 图片选择
- 市场或趋势判断

因此本项目不再实现第二套采集和 AI 编辑流水线。

当前主要问题在于 ChatGPT Task 的阅读形态：

- 三个任务分别位于不同会话中；
- 每天需要手动回溯当天任务的开始位置；
- 历史内容缺乏日期连续性；
- 无法自然查看“昨天 / 前天 / 上周同一天”；
- 三类内容彼此割裂；
- 长文本展示紧凑，缺乏视觉层次；
- 图片、来源、标签、项目指标等结构化字段利用率低；
- 历史检索能力弱；
- 不方便观察某个事件、项目或主题持续多天的变化；
- 后续难以扩展收藏、已读、趋势、周报、月报等能力。

SOTA 的目标是参考 AIHOT 的 publication 和日报阅读思路，构建一个轻量、Local First 的个人情报阅读系统。

## 2. 产品定位

SOTA 不是新闻抓取器，不是新的 Agent，也不是 AIHOT 的完整复制。

它是：

> 一个专门消费 ChatGPT Scheduled Tasks 成品内容的个人情报 publication system。

职责分层：

    ChatGPT Scheduled Tasks
        搜索 / 筛选 / 判断 / 写作
                    |
                    v
            Google Drive
          云端稿库 / 持久化
                    |
              增量同步
                    |
                    v
             SOTA Local
       Normalize / SQLite / API
                    |
                    v
               SOTA Web
       Today / Archive / Search

## 3. 核心原则

### 3.1 云端生产，本地消费

Scheduled Tasks 在云端按时执行，因此：

- Mac 是否开机不影响日报生成；
- Mac 是否联网不影响云端生产；
- Google Drive 是云端 source of truth；
- Mac 恢复联网后补齐缺失数据；
- 本地服务不承担内容生产调度。

### 3.2 页面不调用模型

参考 AIHOT 的核心原则：

> 用户打开页面时只读取已经生产好的数据。

禁止在页面加载过程中：

- 调用 LLM；
- 搜索互联网；
- 重新生成摘要；
- 重新分析市场；
- 重新进行项目筛选。

所有 AI 工作在 Scheduled Tasks 中提前完成。

### 3.3 Source、Normalized Store、Publication 分离

数据流：

    Google Drive source
            |
            v
         importer
            |
            v
       normalized store
          SQLite
            |
            v
      publication service
            |
            v
            Web

原始 Drive 数据和本地数据库必须解耦。未来即使 Google Drive 的文件形式改变，也不应影响前端页面。

### 3.4 原始数据可重建

Google Drive 中的原始日报是核心资产。

SQLite 是可重建的派生数据。

必须提供从 Google Drive 已同步到本地的原始 JSON 文件全量重建数据库的能力。Google API 直读作为可选源。

### 3.5 优先简单实现

V1 不要复制 AIHOT 的完整架构，不要为了未来假设提前引入复杂系统。

## 4. V1 正式数据频道

V1 包含三个 channel：

| channel | 名称 | Scheduled Task |
| --- | --- | --- |
| frontier | 每日前沿简报 | 每日前沿简报 |
| trending | 热门项目 | Daily Trending Projects |
| market | A 股收盘 | A股收盘点评 |

架构必须允许未来新增：

- medical
- codex
- github-watch
- zhihu
- livingroom
- 其他个人主题

新增 channel 不应要求重写核心数据库、归档和导航框架。

## 5. V1 非目标

以下能力不进入 V1：

- 自己抓 RSS
- 自己抓网页
- 自己抓 X
- 自己调用搜索引擎
- 双模型评分
- 复杂选稿系统
- embedding 搜索
- LLM event clustering
- AIHOT 热度算法
- 多用户系统
- 权限系统
- 评论系统
- 云端公开部署
- PostgreSQL
- pg-boss
- MCP
- RSS 输出
- 周报/月报自动生成
- 自动投资建议
- 复杂图表系统

如实现某项能力极其简单，可保留接口或 TODO，但不要阻塞主流程。

## 6. Google Drive 数据组织

推荐目录：

    docs/
    └── personal-hot/
        ├── frontier/
        ├── trending/
        └── market/

正式产物使用普通 UTF-8 JSON 文件，文件名统一为：

    PH_FRONTIER_YYYY-MM-DD.json
    PH_TRENDING_YYYY-MM-DD.json
    PH_MARKET_YYYY-MM-DD.json

Google Drive Desktop 将文件同步到 `~/ai/docs/personal-hot/`，SOTA 默认只读取本地文件，无需 Google API/OAuth。可另附 Markdown 阅读版，正式结构化输入统一为 JSON。

日期统一使用 Asia/Shanghai。

如果 Scheduled Task 无法稳定定位子目录，允许先全部写到一个目录，通过文件名前缀识别 channel。Importer 不应把目录结构作为唯一识别条件。

## 7. Google Drive 输入形式

必须设计 SourceAdapter 抽象，不让上层依赖具体 Drive 文件形式。

建议接口：

    interface SourceAdapter {
      scan(): Promise<SourceArtifact[]>
      fetch(id: string): Promise<RawReport>
    }

V1 至少设计两种 adapter。

### 7.1 FileSystemAdapter

默认主适配器。Scheduled Tasks 将普通 JSON 文件写入 Drive，Google Drive Desktop 同步到本机 `~/ai/docs/personal-hot/`，SOTA 直接读取这些本地文件。

要求：

- 启动时完整递归扫描；
- 默认每 5 分钟后台扫描本地目录，可手动刷新或关闭轮询；
- 不能仅依赖 watcher；
- 程序关闭数天，重新启动也能补齐所有文件；
- 用原文内容 hash 判断变化，相同 channel + date 执行 UPSERT；
- 只读取日报命名规则匹配的文件，忽略目录中的其他资料；
- 普通 .md / .txt 仅在正文为严格 schema JSON 时可用，不猜测任意 Markdown/PPT 中的数据结构；
- 不需要 Google API key、OAuth 或服务账号。

### 7.2 GoogleDocsAdapter

可选适配器，仅在用户主动选择直接读取 Google API 时使用；不得作为本地普通文件模式的先决条件。

保留目录/前缀查找、分页、正文读取、revision/hash 跳过和只读访问能力。正式任务默认产出普通 .json 文件，不要求原生 Google Docs 或 .gdoc。

## 8. Scheduled Task 正式输出约定

每个 Scheduled Task 最终都要生成结构化日报。

原则：

- 正式产物是普通 .json 文件，正文为严格 JSON；
- 不要在 JSON 前后添加解释文字；
- 不要使用 Markdown code fence；
- 不确定字段使用 null；
- 不允许编造 URL、时间、指标、图片地址；
- 顶层必须包含 schema_version、channel、date、generated_at；
- 同一天同一 channel 视为同一期日报。

顶层通用结构：

    {
      "schema_version": 1,
      "channel": "frontier",
      "date": "2026-10-03",
      "generated_at": "2026-10-03T08:10:00+08:00",
      "title": "每日前沿简报",
      "summary": "今日总述",
      "items": []
    }

## 9. 版本规则

所有日报都必须包含：

    "schema_version": 1

本地 parser 按版本分发：

    v1 -> parserV1
    v2 -> parserV2

未来升级 schema 时，不修改历史 Drive 源数据。

## 10. 同一天重复执行

Scheduled Task 可能自动重试、手工重跑或修改 prompt 后再次执行。

因此数据库唯一键必须是：

    UNIQUE(channel, report_date)

重新导入时执行 UPSERT，而不是创建重复日报。

需要保留：

- source_file_id
- source_revision
- content_hash
- generated_at
- imported_at
- updated_at

## 11. 通用 Item Schema

frontier 和 trending 尽量共用基础字段：

    {
      "title": "...",
      "summary": "...",
      "why_it_matters": "...",
      "category": "...",
      "tags": ["..."],
      "source_name": "...",
      "source_url": "https://...",
      "image_url": "https://... or null",
      "published_at": "ISO timestamp or null",
      "evidence": "strong | moderate | weak | disputed | null",
      "extra": {}
    }

本地端生成 stable key，不完全依赖上游 id。

推荐优先级：

1. canonical URL
2. GitHub owner/repo
3. 股票或指数代码 + 日期
4. channel + normalized title

可通过 SHA-256 生成 stable_key。

## 12. Frontier Schema

顶层：

    {
      "schema_version": 1,
      "channel": "frontier",
      "date": "YYYY-MM-DD",
      "generated_at": "...",
      "title": "每日前沿简报",
      "summary": "...",
      "items": []
    }

建议 category：

- AI
- MEDICINE
- TECH
- MACRO
- OPEN_SOURCE
- CHINA
- OTHER

每条 item 至少尽量包含：

- title
- summary
- why_it_matters
- category
- tags
- source_name
- source_url
- image_url
- published_at
- evidence
- extra

## 13. Trending Schema

顶层：

    {
      "schema_version": 1,
      "channel": "trending",
      "date": "YYYY-MM-DD",
      "generated_at": "...",
      "title": "Daily Trending Projects",
      "summary": "...",
      "top_picks": ["owner/repo"],
      "items": []
    }

项目 item 的 extra 建议包含：

    {
      "repo": "owner/repo or null",
      "github_stars": 12345,
      "stars_growth": "+1200/24h or null",
      "trend_signal": "GitHub Trending + X",
      "language": "TypeScript or null"
    }

Top picks 最多 3 个，必须能对应 items 中的项目。

## 14. Market Schema

A 股报告不要强行压成普通新闻卡片。

推荐结构：

    {
      "schema_version": 1,
      "channel": "market",
      "date": "YYYY-MM-DD",
      "generated_at": "...",
      "title": "A股收盘点评",
      "market_open": true,
      "indices": [],
      "metrics": {},
      "leading_sectors": [],
      "lagging_sectors": [],
      "sentiment": {},
      "analysis": "...",
      "outlook": {},
      "sources": []
    }

indices item：

    {
      "name": "上证指数",
      "code": "000001",
      "close": null,
      "change_pct": null
    }

metrics：

    {
      "turnover": null,
      "up_count": null,
      "down_count": null,
      "limit_up": null,
      "limit_down": null
    }

sentiment：

    {
      "stage": "...",
      "summary": "...",
      "evidence": []
    }

outlook：

    {
      "horizon": "1-5 trading days",
      "scenarios": [],
      "risks": [],
      "opportunities": []
    }

非交易日仍然创建当日文件：

    "market_open": false

并说明休市、最近交易日概况与下一交易日关注事项。

## 15. 数据校验与容错

Fatal error，整期拒绝导入：

- channel 缺失或未知
- date 非法
- JSON 完全不可解析
- schema_version 不支持
- 顶层结构严重不合法

Warning，不阻止导入：

- image_url 缺失
- published_at 缺失
- evidence 缺失
- stars 缺失
- tag 缺失
- 某一 item 字段不完整

一次同步中单个文件失败时：

- 记录 error；
- 继续处理其他文件；
- 不允许一个坏文件中断整个同步。

## 16. Raw Data 保留

reports 表必须保留 raw_json。

原因：

- schema 未来升级；
- parser 出错可以重建；
- 新增 UI 字段时可以重新 normalize；
- 无需重新访问 Drive 历史文件。

## 17. SQLite

V1 使用 SQLite，不使用 PostgreSQL。

建议数据库位置：

    data/local/sota.db

建议至少包含：

- reports
- items
- report_items
- sync_state
- 可选 search_index / FTS5

### reports

建议字段：

- id
- channel
- report_date
- title
- summary
- schema_version
- generated_at
- source_type
- source_file_id
- source_revision
- content_hash
- raw_json
- source_missing
- created_at
- updated_at

唯一键：

    UNIQUE(channel, report_date)

### items

建议字段：

- id
- stable_key
- title
- summary
- why_it_matters
- category
- tags_json
- source_name
- source_url
- image_url
- published_at
- evidence
- extra_json
- created_at
- updated_at

### report_items

建议字段：

- report_id
- item_id
- position
- section

### sync_state

建议字段：

- source_id
- source_revision
- last_seen_at
- last_success_at
- last_error

## 18. 同步流程

服务启动后：

    scan source
        -> compare revision/hash
        -> fetch changed artifact
        -> parse
        -> validate
        -> normalize
        -> transaction UPSERT
        -> update publication cache/index

要求：

- 启动时自动执行增量扫描；
- 提供 Sync Now；
- 提供命令行同步命令；
- 可选 5~15 分钟后台轮询；
- 页面访问本身不得触发 Drive 全量扫描。

建议命令：

    npm run sync
    npm run rebuild

rebuild 必须支持删除本地 SQLite 后从 Google Drive 重新生成。

## 19. Google Drive 安全原则

SOTA 本地应用只需要读取源数据。

默认：

- 不修改 Drive 源日报；
- 不删除 Drive 文件；
- 不重命名 Drive 文件；
- 不自动修复云端内容。

如果 Drive 文件后来消失：

- 本地历史数据仍保留；
- 标记 source_missing = true；
- 不自动删除本地日报。

## 20. Backend

推荐：

- TypeScript
- Node.js
- Fastify 或 Hono

如果参考 AIHOT，Fastify 比较自然，但不要因此复制 AIHOT 的完整 backend。

服务职责：

- source sync
- parsing
- normalization
- SQLite
- publication API
- search
- status

## 21. Frontend

推荐：

- React
- React Router
- Tailwind CSS

允许根据当前仓库技术栈调整，但应保持轻量。

视觉可参考 AIHOT 的数字报纸结构，不复制 AIHOT 名称和 Logo。

如直接复用 AIHOT 代码，遵守 MIT License 和 NOTICE 要求。

## 22. Publication API

V1 建议至少提供：

    GET  /api/day/latest
    GET  /api/day/:date
    GET  /api/archive
    GET  /api/channel/:channel
    GET  /api/search?q=
    GET  /api/status
    POST /api/sync

UI 只依赖 publication service，不直接执行 SQL。

即使单体项目也保持：

    UI -> service/API -> DB

## 23. Web 路由

至少：

    /
    /day/:date
    /frontier
    /trending
    /market
    /archive
    /search
    /settings

首页 / 展示最新有数据的日期。

如果当天某个 channel 尚未生成，不要偷偷拿昨天的数据冒充今天。

例如：

    每日前沿       ✓
    Trending       未生成
    A股收盘         ✓

## 24. 日报是核心实体

SOTA 的核心阅读单位不是“文章流”，而是“一期日报”。

Header 参考：

    SOTA / PERSONAL HOT
    2026.10.03 · SAT
    第 12 期

可展示：

- 今日条目数
- 已生成频道数
- 最后同步时间

首页顺序建议：

1. Masthead
2. 今日概览
3. 今日重点
4. 每日前沿
5. Trending Projects
6. A 股收盘
7. 前后日报导航

## 25. 今日概览

顶部提供频道索引：

    每日前沿            20
    Trending            16
    A股收盘              ✓

点击滚动到相应 section。

## 26. 每日前沿 UI

采用编辑式新闻布局，不使用聊天气泡。

每条展示：

- 分类
- 标题
- 2~4 句摘要
- why it matters
- 来源
- 发布时间
- evidence
- 图片

桌面端允许两列，但重要头条可占整行。

图片加载失败时自动降级为纯文本布局，不显示破图。

## 27. Trending UI

Trending 使用更适合项目的卡片样式：

    owner/repo
    一句话描述
    为什么值得关注
    GitHub stars
    增长信号
    Language
    GitHub / X / Community signal

Top 3 应有明显但克制的视觉强调。

指标为 null 时不显示占位假数据。

## 28. Market UI

A 股页面不要使用新闻卡片堆叠。

顶部指标：

- 上证
- 深证
- 创业板
- 科创主要指数
- 成交额
- 上涨家数
- 下跌家数
- 涨停
- 跌停

下方：

- 领涨板块
- 领跌板块
- 核心驱动
- 市场情绪
- 综合分析
- 未来 1~5 个交易日场景
- 风险
- 机会观察

图表不是 V1 blocker。

## 29. 前后日报导航

日报底部必须提供：

    <- 2026-10-02      日报合订本      2026-10-04 ->

prev / next 必须寻找“实际存在的报告日期”，不能简单 date +/- 1。

原因：

- 任务可能失败；
- 数据可能缺失；
- 历史回填可能不连续。

## 30. Archive

参考 AIHOT Daily Archive。

至少支持按年月归档：

    2026
      October
        03
        02
        01

每天显示：

- 日期
- 星期
- frontier 条数
- trending 条数
- market 是否存在
- 是否完整

推荐 V1 增加月历视图：

- 完整：实心状态
- 缺频道：半状态
- 无数据：空状态

这是体现“每日连续性”的关键体验。

## 31. Channel 页面

例如 /frontier：

展示该 channel 的跨日期时间流。

用途：

> 不按“日报”阅读，而是持续观察某类内容。

例如顶部：

    每日前沿
    最近 30 天 · 600 条

同样支持 trending 和 market。

## 32. Search

V1 使用 SQLite FTS5。

搜索字段：

- title
- summary
- why_it_matters
- tags
- source_name

结果展示：

- title
- channel
- date
- snippet
- source

点击跳转：

    /day/YYYY-MM-DD#item-xxxx

V1 不做 embedding 搜索。

## 33. 轻量连续性

V1 只做 deterministic continuity：

- canonical URL
- GitHub repo
- stable key
- normalized title

可展示：

    首次出现 10/01
    已出现 3 天

但不要在没有充分依据时声称“这是同一事件的后续”。

V2 再考虑：

- events
- event_items
- embedding
- LLM event matching
- follow-up 标记
- 热度
- 时间线

## 34. 图片策略

上游任务保存 image_url。

V1 可直接加载远程图片。

设计 ImageService 抽象，为未来预留：

- proxy
- cache
- thumbnail

不要第一版实现复杂图片 crawler。

## 35. 阅读状态

V1 可选：

- read
- favorite

优先存 localStorage。

不建立用户系统。

## 36. 响应式

至少保证：

- Mac Desktop
- iPhone
- iPad

这是阅读系统，移动端不是次要场景。

## 37. 本地安全

默认监听：

    127.0.0.1

不要默认暴露：

    0.0.0.0

用户明确配置后才能开放 LAN。

## 38. 配置

建议 .env：

    PORT=3000
    DATA_DIR=./data/local
    SOURCE_ADAPTER=filesystem
    SOURCE_DIR=/Users/zss/ai/docs/personal-hot
    SYNC_INTERVAL_SECONDS=300
    TIMEZONE=Asia/Shanghai

默认本地文件模式不需要 Google 凭据。可选的 Google API 模式中，OAuth token 或 service credentials：

- 不提交 Git；
- 加入 .gitignore；
- 权限最小化；
- SOTA 默认只读 Google Drive。

## 39. Settings 页面

展示：

- Source adapter
- 本地源目录 / source scope
- Last sync
- Last successful sync
- Imported reports
- Latest report
- Current errors
- Schema warnings

按钮：

- Sync Now
- Rebuild Search Index

不要提供删除 Drive 源数据的按钮。

## 40. Import Log

同步日志至少区分：

- FOUND
- UNCHANGED
- UPDATED
- IMPORTED
- WARNING
- FAILED

便于定位 Scheduled Task 输出格式问题。

## 41. 性能

目标：

- 已同步数据情况下，本地首页首次响应尽量低于 500ms；
- 普通页面切换接近即时；
- 页面打开不访问 Google Drive；
- Drive 请求仅发生在同步层。

## 42. 推荐目录

可以参考：

    sota/
    ├── apps/
    │   ├── web/
    │   └── server/
    ├── packages/
    │   ├── contracts/
    │   ├── importer/
    │   ├── publication/
    │   └── db/
    ├── data/
    ├── fixtures/
    ├── docs/
    │   ├── ARCHITECTURE.md
    │   └── SCHEMA.md
    ├── scripts/
    │   ├── sync.ts
    │   └── rebuild.ts
    ├── .env.example
    ├── AGENTS.md
    ├── README.md
    └── package.json

这不是强制目录。若项目规模不需要 monorepo，优先简单结构。

不要为了形式制造无意义复杂度。

## 43. AIHOT 借鉴范围

重点参考：

- apps/web/app/features/report/
- apps/web/app/routes/daily-archive.tsx
- packages/backend/src/publication/

重点借鉴：

- 报纸式日报
- Masthead
- issue
- section
- previous / next
- archive
- publication layer
- 页面不调模型

不要移植：

- RSS collectors
- web collectors
- X collectors
- LLM scoring
- double scoring
- selection pipeline
- event clustering
- heat algorithm
- worker queue
- PostgreSQL
- pg-boss
- source admin
- budget circuit breaker
- model leaderboard
- Codex reset monitor

## 44. 视觉方向

不要做成：

- Chat UI
- 普通后台 Dashboard
- Notion Database
- 玩具化卡片站
- 过度 SaaS 风格

希望接近：

- 现代数字报纸
- 研究日报
- 独立出版物
- AIHOT 的信息密度
- Bloomberg Editorial
- The Economist Digital

关键词：

- editorial
- information dense
- calm
- high signal
- minimal
- serious
- modern
- readable

避免：

- 大面积渐变
- 玻璃拟态
- 五颜六色
- 过度圆角
- 大量阴影
- “AI 产品模板感”

## 45. 测试数据

不要等待真实 Scheduled Tasks 累积数天后才开发。

先创建 fixtures，模拟 3~5 天：

    fixtures/
      2026-10-01-frontier.json
      2026-10-01-trending.json
      2026-10-01-market.json
      2026-10-02-frontier.json
      ...

必须覆盖：

- 三频道完整
- 缺一个频道
- 非交易日
- 图片失败
- 字段为 null
- 同一天重复更新
- 同一项目跨日出现
- Drive revision 更新
- 单个坏文件

## 46. V1 开发顺序

### Phase 1：数据契约与 Fixture

先完成：

- contracts
- schema v1
- fixtures
- parser validation
- unit tests

### Phase 2：数据链路

完成：

    Google Drive 普通 JSON
      -> Drive Desktop 同步到本地
      -> FileSystemAdapter 读取
      -> parse
      -> normalize
      -> SQLite

并支持 npm run sync。

### Phase 3：最小日报

完成：

    /day/:date

正确显示三个 section。

### Phase 4：连续阅读

完成：

- latest
- prev
- next
- archive
- 缺频道状态

### Phase 5：视觉升级

参考 AIHOT 的 report 设计语言完成：

- masthead
- front page
- sections
- cards
- market panel

### Phase 6：Search

SQLite FTS5。

### Phase 7：可选增强

- calendar
- favorites
- read state
- image proxy
- continuity badges

## 47. 验收场景

### Case A：Mac 关机三天

ChatGPT Scheduled Tasks 在云端继续生成 Drive 数据。

Mac 再次开机并同步后，SOTA 能补齐全部历史日报。

### Case B：同一天任务重跑

SOTA 更新原有 channel + date，不产生重复日报。

### Case C：某频道缺失

例如：

    frontier ✓
    trending 未生成
    market ✓

首页仍可正常展示，并明确缺失状态。

### Case D：图片失效

某 image_url 返回 403 或 404。

正文正常显示，图片区域自动降级。

### Case E：Google Drive 断网

已经同步到 SQLite 的历史日报仍可以完整阅读和搜索。

### Case F：本地数据库丢失

删除 data/sota.db 后运行：

    npm run rebuild

能够从 Google Drive 已同步到本机的普通 JSON 重新构建。

### Case G：坏文件

一个格式错误的 Drive 文档不会阻塞其他日报导入。

## 48. README 要求

README 至少说明：

- SOTA 是什么
- 为什么存在
- 架构
- 三个数据频道
- Google Drive 数据流
- 如何配置
- 如何启动
- 如何 sync
- 如何 rebuild
- 如何运行测试
- Scheduled Task 数据格式入口
- 与 AIHOT 的关系：只借鉴展示/publication 思想，不复制采集流水线

## 49. AGENTS.md 原则

保持精简，只写真正需要显式强调的项目约束，例如：

- Google Drive raw reports are source data. Never mutate or delete them.
- Pages must not call LLMs or perform web collection.
- Preserve backward compatibility with report schema versions.
- Keep SQLite rebuildable from raw sources.
- Prefer simple implementations over copying the full AIHOT architecture.
- Do not introduce PostgreSQL, queues, or background AI pipelines without an explicit requirement.

不要把通用工程常识大量写进 AGENTS.md。

## 50. 最终体验

用户每天只需要打开：

    http://localhost:3000

看到当天完整的一期 SOTA。

目标流程：

    打开 SOTA
      -> 今天
      -> 顺序阅读三个频道
      -> 昨天 / 前天
      -> 合订本
      -> 搜索历史
      -> 查看某一频道长期变化

而不是：

    打开 ChatGPT
      -> 找 Task A
      -> 回溯当天执行节点
      -> 返回
      -> 找 Task B
      -> 再找 Task C

SOTA 的价值是把 ChatGPT Scheduled Tasks 从“会话里的定时输出”升级为一个连续、可归档、可搜索、可扩展的个人情报系统。
