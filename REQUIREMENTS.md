# SOTA 云端迁移与 GitHub Pages 发布需求（V2）

> 状态：待 Codex 实施 · 2026-10-13 · 时区 Asia/Shanghai  
> 目标仓库：[`njuzss/sota`](https://github.com/njuzss/sota)（公开，新建）  
> 现有实现：[`njuzss/ai/sota`](https://github.com/njuzss/ai/tree/main/sota)（私有，V1）  
> 本文是**V1 到 GitHub 原生发布的迁移增量需求**，不代表现有 V1 全部功能从零重做。与 V1 旧文档冲突时，以本文关于数据来源、运行架构、部署、任务交付和验收的条款为准；内容质量、Schema v1 与既有阅读交互尽量继承。

## 0. 决策与边界

- **已经由用户验证**：ChatGPT Scheduled Tasks 能在无人值守时通过 GitHub Connector 直接写入仓库。无需再次将其作为立项阻塞点。
- 选择 `ChatGPT Tasks → GitHub 原始 JSON → GitHub Actions 静态构建 → GitHub Pages`；不再依赖 Drive 上传、本地 Drive Desktop 同步或 Mac 常驻服务。
- **不**在 Actions 中重新运行新闻采集、LLM 写稿或金融数据抓取；保留现有三个 ChatGPT 任务负责内容生产。
- **重用**旧版 SOTA 的视觉与交互，不要重新设计一个“差不多”的网站。保持轻量，优先基于 React、Vite、TypeScript。
- 新仓库是公开的：所有入库日报及 Pages 成品均视为**可被公众访问**。不可提交凭据、个人隐私、敏感附件、Drive token、原本只适合私有保存的资料。
- 迁移应可逐步验收和回退。**用户确认正式切换前，不修改、删除旧仓库、旧 Drive 文件或三个现有任务。**

## 1. 现状（已对旧仓库实际检查）

旧 `ai/sota` 已有：

- `web/App.tsx`、`web/styles.css`：日报纸面布局、首页、每日分期、频道、合订本、搜索、设置/同步状态，桌面与手机适配；
- `src/contracts.ts`：频道及出版数据类型；`schemas/report-v1.schema.json` 为正式 JSON Schema；
- `src/parser.ts`、`src/importer.ts`：原始稿校验、归一化、去重与入库；
- `src/publication.ts`、`src/db.ts`：日报/历史/检索读取服务、SQLite + FTS；
- `src/app.ts`、`src/server.ts`：Fastify `/api/*`、`127.0.0.1:3000`；
- `src/adapters.ts`：本地目录及可选 Google Adapter；
- `fixtures/`、`tests/`：包括缺频道、休市、空值、坏稿、失效图片和重复导入场景；
- `TASK_PROMPTS.md`：frontier、trending、market 三个渠道的既有采集及输出规则。

当前 web 通过 `fetch('/api/...')` 调用本地服务，`web/main.tsx` 使用 `BrowserRouter`；Vite 未设置 Pages 项目仓库的 `base`。**这些都是迁移时应实际修改、测试的确定性兼容点**，不能仅把现有 dist 复制到 Pages。

## 2. 目标与非目标

### P0 必须

1. 任意设备访问 `https://njuzss.github.io/sota/`，无需 Mac 在线、Google Drive、后端进程或登录；
2. 三个既有云端任务仍按既定选题与时刻运行，分别写每日一份可校验的 Schema v1 JSON；
3. 每次新日报写入/修订后，自动触发 Actions 构建并部署 Pages；支持手动重跑；
4. 日报、旧刊、三个频道、日期导航、搜索、市场专用呈现、图片、原文链接、缺报/休市状态继续正常工作；
5. 历史原始 JSON 可完整重建发布数据；同日期同频道覆盖更新，不能复制出多期；
6. 有清晰的构建校验、错误日志和上线/回退流程。

### P1 后续优化（不阻塞上线）

- 专题跨天追踪、收藏与已读、周/月总结、RSS/PWA、服务端搜索等。不要为了这些引入数据库、云函数、API 服务。
- 远程图片缓存/代理先不做；缺图需要优雅降级。
- 可选自定义域名，先使用默认 Pages 地址。

## 3. 总体架构

```text
ChatGPT Scheduled Tasks（用户既有云端任务）
   ├── 每日前沿简报（frontier）
   ├── Daily Trending Projects（trending）
   └── A 股收盘点评（market）
                    │ GitHub Connector 直接 create/update UTF-8 JSON
                    ▼
             njuzss/sota (main)
              data/reports/**/*
                    │ push / workflow_dispatch
                    ▼
              GitHub Actions
       严格发现文件 → 校验 → 归一化
       → 构建静态索引/出版快照 → Vite
                    │
                    ▼
              GitHub Pages
        HTML/CSS/JS + 静态 JSON
                    │
                 浏览器
```

运行时浏览器**只读取部署在同源 Pages 的静态数据**，不依赖 GitHub REST API（避免匿名 API 限额/跨域）、Google API、Node/Fastify/SQLite、localhost 或任何 LLM。Actions 是构建时处理器，不是常驻后端。

## 4. 仓库目录契约

推荐目录（可按旧项目必要部分微调，但**日报路径契约必须固定**）：

```text
njuzss/sota/
├── README.md
├── REQUIREMENTS.md                 # 本文件
├── TASK_PROMPTS.md                 # 迁移后的完整任务交付提示词（实施时新建）
├── package.json
├── package-lock.json
├── vite.config.ts
├── src/                            # 共用 contracts / parser / publication
├── web/                            # 尽量复用旧版前端和样式
├── scripts/
│   ├── build-publication.ts        # 原始 JSON → 可部署的静态数据
│   └── validate-reports.ts
├── schemas/report-v1.schema.json   # 保持与旧稿兼容
├── fixtures/                       # 测试数据；绝不作为正式刊发布
├── tests/
├── data/
│   └── reports/
│       ├── frontier/PH_FRONTIER_2026-10-13.json
│       ├── trending/PH_TRENDING_2026-10-13.json
│       └── market/PH_MARKET_2026-10-13.json
├── .github/workflows/deploy.yml
└── dist/                            # 构建产物，gitignore，不提交
```

**三任务唯一正式写入路径**：

- `data/reports/frontier/PH_FRONTIER_YYYY-MM-DD.json`
- `data/reports/trending/PH_TRENDING_YYYY-MM-DD.json`
- `data/reports/market/PH_MARKET_YYYY-MM-DD.json`

文件名、目录中的频道、JSON 顶层 `channel`、`date` **必须互相匹配**。日期采用 Asia/Shanghai 自然日，不用任务执行平台的 UTC 当天日期。每任务只负责自己的路径，避免并发争用公共 manifest/index。

同日重跑：先检查文件是否存在，存在则基于最新 SHA 更新；否则创建；写完**读回、解析、核对 channel/date/schema**，通过后才报告成功。冲突（409/422）、限流或连接失败时安全重读最新状态后限次重试，不能无限重试、不能静默宣布成功、不能破坏其他任务文件。

原始每日 JSON 是 source of truth，**历史文件永不因构建失败、当日缺报而自动删除**。生成的 `manifest`、索引、静态分页均是可重建的派生数据，不应由 ChatGPT Task 写入，也不应与其争用同一路径。

## 5. 数据契约：维持 Schema v1

不得凭空发明新格式导致原有 Scheduled Tasks 或历史稿件失效。复制/继承旧仓库的 `schemas/report-v1.schema.json`、`src/contracts.ts` 和兼容解析逻辑；与旧 `TASK_PROMPTS.md` 对照完成迁移。

**通用必备**：

```json
{
  "schema_version": 1,
  "channel": "frontier",
  "date": "2026-10-13",
  "generated_at": "2026-10-13T08:10:00+08:00",
  "title": "每日前沿简报",
  "summary": "本日概要",
  "items": []
}
```

- `frontier`：约 20 条高价值资讯，`items[]` 有 title、summary、why_it_matters、category、tags、source_name/source_url、image_url、published_at、evidence、extra；
- `trending`：约 15–20 项，`top_picks` 最多三个且能对应 items，项目指标在 `extra`，不能编造 stars/增幅；
- `market`：**不是通用新闻卡片数组**，保留 `market_open`、`indices`、`metrics`、`leading_sectors`、`lagging_sectors`、`sentiment`、`analysis`、`outlook`、`sources`；非交易日如任务实际执行，仍可以创建 `market_open=false` 的当日稿。

`schema_version=1` 保持不变；未来添加 v2 必须版本分发，不能原地篡改历史原稿。URL/数字/图片无可信来源填 `null`，允许 warning 降级；缺 channel/date、不合法日期、完全不可解析或不支持的版本属 fatal，**该期不得发布为成功日报**。对具体字段严格性沿用旧 JSON Schema 与 parser 的正式契约，避免本文简化示意与实际字段发生冲突。

构建时保留每期独立快照；`stable_key` 和出现次数沿用旧代码确定性规则（以 canonical URL、owner/repo、规范化标题等识别），**不把一个项目的最新描述反写到旧刊**。同一 channel/date 唯一，发布日期与 `generated_at` 区分。相同路径被修订后，应在下一次部署反映新正文。

## 6. 静态出版数据与页面读取

引入与原始稿分离的构建期 `build-publication`。可以继续使用旧 parser 的归一化逻辑，不要求保留 SQLite。建议输出到构建中间目录并随 dist 部署：

```text
dist/
├── index.html
├── assets/*
└── data/
    ├── manifest.json
    ├── days/2026-10-13.json
    ├── channels/frontier.json
    ├── channels/trending.json
    ├── channels/market.json
    └── search-index.json
```

具体格式由 Codex 设计，但必须至少覆盖旧 `PublishedDay`、`ArchiveEntry`、`PublishedReport`、`SearchResult` 阅读功能，且**明确版本化或集中提供类型定义**。按需读取当天/指定日期，避免一次性把全部历史正文打包进首屏 JS。索引可独立加载，历史增长后分页或分片。

`manifest.json` 至少提供：schema/build 版本、构建时间、最大可用日期、实际日期列表、每天三个频道有无稿/各频道数量、数据有效性/警告摘要。**构建时间不等于任务执行成功时间**。诊断页需区分“尚未有该日报”“文件解析失败”“网站部署失败（可能无法在页面直接检测）”和“上次部署何时完成”；不要因为网站最新就宣称三个任务都成功。

搜索替代旧 SQLite FTS：构建期产出可检索文本/索引，浏览器端支持中文字符串/英文不区分大小写、多词查询、日期和频道结果定位；可使用简单确定性分词/二元词索引，不必上云服务或引入大型搜索集群。保留旧 UI 查询体验及 `/day/:date#item-...` 锚点定位，搜索结果尽可能提供片段、来源和渠道。

## 7. 前端迁移：保留阅读体验

旧版可复用：`web/App.tsx`、`web/styles.css`、React 组件、频道专用市场视图、UI 配色排版及响应式设计。

必须检查并修改：

1. 去掉对 `/api/day/latest`、`/api/day/:date`、`/api/archive`、`/api/channel/:channel`、`/api/search`、`/api/status`、`POST /api/sync` 的**运行时 Fastify 依赖**；通过小型静态 `PublicationReader`（服务接口）替代，不要在各组件硬编码文件路径；
2. Vite 构建配置 `base: '/sota/'`（或正确的运行时 base），浏览器静态请求不能从域名根目录错误请求 `/data/*`；
3. 当前 `BrowserRouter` 在 GitHub Pages 项目站点直接刷新深层 URL 会 404；优先选择无服务器依赖的路由方案（例如 `HashRouter`），**必须确保首页、日期页、频道、合订本、搜索页的直接打开/刷新/返回/分享链接可靠**；若使用 404.html SPA fallback，需真实验证并解释取舍；
4. `settings` 中“Sync Now”属于已取消的本地文件同步操作，应改成**来源与发布诊断页**（最后构建、已有期数、最新三频道日期、缺刊、校验警告、仓库/Actions 链接）；不可显示一个无法生效的按钮；
5. 原 UI 的 LOCAL EDITION / 云端成稿·本地阅读等旧标识改为恰当的 CLOUD EDITION 文案；保留品牌和视觉主轴；
6. 图片失败、外部链接、null 指标、休市、缺频道、空态与手机端体验不得回退；图片不经 Google Drive 私有地址；
7. 页面初次打开不自动调用任何 LLM/采集，不依赖 GitHub API token，不要求用户登录；公开网站不展示私有 Drive 来源信息。

**缺报语义**：某日两个频道成功、一个缺失时，只展示两个成功频道，第三个明确写“未生成/缺报”；不能用昨天的报告冒充今天。如果历史上有某天存在日报，首页仍以**最新有数据日期**为准，同时可单独提示按上海日期判断的“今天待更新”。

## 8. GitHub Actions + Pages

- 建立 GitHub Pages workflow：`push` 到 `main`（包含 `data/reports/**`、前端、构建脚本/配置时）及 `workflow_dispatch`；
- 采用官方 Pages artifact/upload/deploy action（或 GitHub 当前官方推荐的受支持动作），最小权限 `contents: read` 和部署所需 `pages: write`、`id-token: write`；使用 `github-pages` environment；
- Node/npm 版本按旧项目要求（Node >=24），`npm ci` → 校验/测试/类型检查 → 静态数据生成 → Vite build → 发布；
- 使用适当的 concurrency；连续三任务提交不会出现旧 build 后发布覆盖新数据。构建应基于触发时可获得的**最新 main 快照**；必要时处理并发取消、commit 检查及部署排序；
- 公开网站**不需要 GitHub PAT / Actions secrets 来读取同仓库公开 JSON**；
- 任何一条坏日报不能导致其余历史消失：对坏稿按源文件记录 error，尽量继续构建其他合法日报；若构建无法产出可信非空内容，则 job 失败并保留上一次成功部署；
- workflow 日志输出失败源路径和校验原因（不输出机密）。可选独立按上海时间每日执行的轻量巡检，校验 expected/received，**不承诺 Actions 定时任务一定秒级准时**；
- 部署异常通过 GitHub Actions 失败记录和可见诊断处理，不加入常驻监控服务器。提供 README 中启用 Pages 的仓库 Settings 步骤、手动触发、部署结果 URL、回滚方式。

GitHub Pages 默认地址目标：`https://njuzss.github.io/sota/`。在用户设置中选定 `GitHub Actions` 作为 Pages 发布来源前，workflow 写好不代表已上线。

## 9. 迁移历史：不丢稿，不公开不该公开的内容

- 旧源在 `njuzss/ai/sota`（私有）及本地同步稿库 `~/ai/docs/personal-hot/`，需要 Codex 读取本地实物后对照清点；**不能假定私有仓库里有全部真实日报**。
- 写一个**可重复运行、默认 dry-run、明确白名单**的导入命令：仅接受 `PH_(FRONTIER|TRENDING|MARKET)_YYYY-MM-DD.json`，校验 Schema/日期/频道后复制到新 `data/reports/<channel>/`；忽略 .gdoc、阅读版、临时备份、演示稿；
- 同一 channel/date 多个候选时按合法 `generated_at` 及可信修订时间/内容选择，并输出冲突清单供人工核验；无证据不静默覆盖；
- 记录迁移数量/日期范围/遗漏/重复/错误，对源文件只读。上传新公开仓库前检查凭据、个人数据、内部文档、非公开交易数据等；
- 旧 `fixtures` 可以进入测试，但**不能出现在正式网站或正式 data/reports**，不许自动将 demo 数据变成生产日报；
- 不迁移旧 SQLite 二进制文件、缓存、日志、密钥、`.env`。如需迁移搜索历史，只从原始 JSON 重建。

## 10. 三个 ChatGPT 任务交付规则（实施阶段产出完整 TASK_PROMPTS.md）

用户已经证明任务能直接写 GitHub；不要重新建任务，也不要改动执行时间。旧配置记录见私有仓库 `sota/docs/TASK_STATUS.md`：前沿/Trending 每日 08:00，A 股周一至周五 15:30，Asia/Shanghai。实施时用户再确认后台实际任务设置，以当前实情为准。

保留既有每个任务**完整选题范围、资讯价值筛选、原始来源和图片、医学证据、市场情景及风险、去重、不造假**规则；**只改投递方式和核验规则**：

```text
正式交付目标：GitHub 仓库 njuzss/sota，分支 main。
frontier: data/reports/frontier/PH_FRONTIER_<Asia/Shanghai日期>.json
trending: data/reports/trending/PH_TRENDING_<Asia/Shanghai日期>.json
market:   data/reports/market/PH_MARKET_<Asia/Shanghai日期>.json
正文：UTF-8 严格合法 JSON，schema_version=1，且与路径频道/日期匹配。
同日已有则更新；若不存在则创建。写完读回并解析，核对重要字段。
成功后会话中简要汇报频道、日期、条数/交易状态和 GitHub 文件链接；
若失败，明确报错和失败阶段，不得宣称成功。不要回退到 Drive，除非用户明确启用应急路径。
其他两个频道文件不得触碰；不得同时写入 manifest 或构建产物。
```

`TASK_PROMPTS.md` 应给出**三份可完整替换、可复制的成稿 Prompt**，而不是只有上述公共片段，方便用户在独立 ChatGPT 任务中逐一更新。注意：本次“写需求文档”并**不**意味着马上修改线上任务配置；先完成部署验证，用户确认后再替换交付目标。

## 11. 故障处理与可观测性

| 故障 | 期望行为 |
| --- | --- |
| 某任务漏跑/上传失败 | 历史可读、该频道缺报明显、构建不伪造内容；任务对话报告失败 |
| 同日重跑 | 更新同路径，页面只存在一份最新刊；保留 Git 历史 |
| 三任务近同时写入 | 频道文件隔离；对 Git 提交冲突幂等重试；最终部署覆盖所有成功稿 |
| 新 JSON 不可解析/字段缺失 | 严格记录错误，隔离该期；其余有效历史正常发布 |
| GitHub Pages 部署失败 | 上一次成功部署仍可打开；可从 Actions 追查并手动重跑 |
| 图片 403/404 或 URL 为空 | 不阻塞文章；图片占位/隐藏 |
| 当日 A 股休市 | `market_open=false`；不编造行情，也不强制工作日一定有收盘值 |
| 市场数据滞后 | 显示报告实际日期及生成时间，不把旧刊标为当日行情 |
| Mac 离线 | 在线 Pages 仍可使用，跟 Mac 无关 |
| Schema 未来升级 | 老文件原样保留，可继续解析历史版本 |

## 12. 分阶段实施（Codex 可连续执行，不必每个小步骤询问）

**Phase A — 源码迁移与静态化**：检查旧仓库现状，迁移必需的前端、样式、类型、parser/schema/fixtures/test；新增静态出版构建器与 reader；解决 `/sota/` base、路由、图片和静态搜索。完成演示 fixtures 的离线构建测试，**不把演示数据部署成正式稿**。

**Phase B — GitHub Pages 上线**：部署 workflow、README 操作说明、构建测试和诊断页；在没有正式日报时提供诚实空态。实际首次 Pages 发布依赖用户启用 Pages 设置时，明确操作入口即可；可以先提交代码和 workflow。

**Phase C — 历史导入与回归测试**：本地原稿清点、迁移脚本 dry-run、隐私审查、合法历史入库；对真实中文数据、市场休市、修订和中英文搜索全流程验收。

**Phase D — 任务切换**：输出三份完整新任务 Prompt；先只切换一个任务并确认写入/读回/自动部署/线上可见，再切换剩余两个。切换前保留旧 Drive 来源作为人工备份，但不要求双写。切换成功后旧本地服务可停用，旧系统保留可回退。

若遇到用户授权才能完成的设置（如 GitHub Pages 选项、ChatGPT Task Prompt 修改），Codex 完成可自动完成的开发与提交，最后汇总需要用户操作的最少步骤；**不要越权改现有任务或原仓库**。

## 13. 可验收的完成定义（Definition of Done）

- [ ] 新仓库构建及测试通过，静态资源在 `/sota/` 下正确加载；
- [ ] 页面主要布局与旧版 SOTA 基本一致，桌面及 390px 手机均无横向溢出；
- [ ] Pages 正式网址可访问，不要求 Mac 或 Google Drive；
- [ ] 刷新/直接打开日报、日期、频道、合订本、搜索 URL 均可工作；
- [ ] 三种 Schema v1 真实/fixture 数据可解析；market 专用视图及休市表现正确；
- [ ] 最新有效日期、日期前后导航、每频道缺报、历史归档与日报序号正确；
- [ ] 中英文搜索能命中日报概要及条目，结果可跳转并定位；
- [ ] 重跑同日 JSON 只修改一期、保持历史快照与稳定项目标识；
- [ ] 测试坏 JSON、空值、失效图片、缺频道，其他日报不受污染；
- [ ] push 正式 JSON 后 Actions 自动完成 Pages 发布，无需人工刷新本地服务；
- [ ] 连续/近同时写入两个频道，最终在线版本都包含各自的最新数据；
- [ ] 线上生产内容不会意外包含 fixtures/demo、私有 Drive 文件、密钥或内部资料；
- [ ] 保留有用的现有回归测试并新增静态发布/路由/索引/冲突测试；
- [ ] `README.md` 说明本地开发、数据契约、部署配置、手动重建、故障定位及回退；
- [ ] `TASK_PROMPTS.md` 提供三份完整、保留原选题质量的 GitHub 交付 Prompt；
- [ ] 明确给用户可直接打开的 Pages URL 和需要手工调整的任务配置。

## 14. 给 Codex 的执行原则

1. 先审查 `njuzss/ai/sota` 最新代码（私有源仓库）与新仓库现状；**先迁移有用成果，不准随意重造 UI**。
2. 允许调整目录、抽象层，但优先少改代码且以端到端可用为衡量标准。
3. 仅向 `njuzss/sota` 写代码；`njuzss/ai`、旧 Drive/本地源稿只读。
4. 文档保持单一事实源：本文件为 V2 迁移边界；实际数据结构以 `schemas/report-v1.schema.json` 为准；实施中及时更新 README、TASK_PROMPTS，不要留下 Drive 为默认正式链路的冲突说明。
5. 尽可能自动连续推进 Phase A–C；确需用户人工设置时集中反馈，避免每次完成一个小步骤就停下来征求确认。
6. 最终回复提供 commit、测试结果、线上 URL（若已部署）及需要用户处理的事项。**禁止把未实际部署说成已经上线。**
