# SOTA / Personal HOT — V2

将前沿、热门项目和 A 股日报编成可归档、搜索、连续阅读的云端出版物。V2 继承旧 SOTA 的 React 报纸 UI、Schema v1、解析器、历史快照和 publication 逻辑，正式架构由本仓库 REQUIREMENTS.md 定义：

```text
既有 ChatGPT Scheduled Tasks
      ↓ GitHub Connector create/update UTF-8 JSON
njuzss/sota · main · data/reports/<channel>/PH_<CHANNEL>_<DATE>.json
      ↓ push → GitHub Actions 校验/归一化/静态构建
GitHub Pages · https://njuzss.github.io/sota/
      ↓ 同源静态 JSON
日报 / 三频道 / 合订本 / 中英文检索 / 发布诊断
```

页面不调用 GitHub/Google API、模型、采集器或本地后端，不需要登录、Mac 在线或 token。SQLite 仅作为复用旧 publication 逻辑的构建期内存索引，浏览器与 Pages 不运行数据库。

## 开发与测试

Node.js 24+：

```sh
npm ci
npm test
npm run typecheck
npm run dev
```

本地开发地址为 http://127.0.0.1:5173/sota/。演示模式明确标记 demo，与正式稿库分离：

```sh
npm run dev:demo
PAGES_BASE_PATH=/sota/ npm run build:demo
npm run preview
```

预览默认 http://127.0.0.1:4173/sota/。正式 `npm run build` 只读 data/reports；空目录显示诚实空态，不填充演示稿。`dist/` 和生成的 `web/public/data/` 不提交。可通过 `PAGES_BASE_PATH=/` 构建自定义域名根路径。

## 唯一正式稿件路径

- `data/reports/frontier/PH_FRONTIER_YYYY-MM-DD.json`
- `data/reports/trending/PH_TRENDING_YYYY-MM-DD.json`
- `data/reports/market/PH_MARKET_YYYY-MM-DD.json`

目录、文件名、正文 channel/date 必须匹配；日期为 Asia/Shanghai 自然日。正文为 Schema v1 严格 UTF-8 JSON，可保留原有 BOM，禁止 code fence、说明前缀、凭据或个人隐私。完整契约见 schemas/report-v1.schema.json。每频道每日一个文件，同日修订更新原路径，历史版本由 Git 保存。

任务只负责自己的原稿，不写 manifest、索引或构建产物。写后必须读回、解析、核对；冲突使用最新 SHA 限次重试。三份完整提示词见 TASK_PROMPTS.md。**本次只产出替换方案，没有改动现有任务或执行时间；正式切换需用户确认，先验证一个任务后再切换其余两个。**

## 历史迁移

```sh
# 默认 dry-run，输入仅接受正式 PH_*.json；不写源文件
npm run migrate -- --source /Users/zss/ai/docs/personal-hot
# 先复制到 ignored 隔离区，审阅 SHA-256 清单、冲突和隐私范围
npm run migrate -- --source /Users/zss/ai/docs/personal-hot --apply
SOURCE_DIR=./data/migration/reports npm run build
# 审核后按固定路径复制到正式仓库
npm run migrate -- --source /Users/zss/ai/docs/personal-hot --out data/reports --apply
```

工具只复制通过校验的普通 JSON，忽略阅读版/.gdoc/备份；已知 fixtures 不允许导入正式稿库。`data/migration/manifest.json` 记录 hash、数量、去重、错误和冲突。依据合法 generated_at 和可信源修订时间选择；无证据的同时间不同正文拒绝静默覆盖，供人工核验。可以重复执行，不会自动删除历史。也保留只读 SQLite raw_json 导出工具，数据库二进制永不迁入。

## 构建、诊断与部署

`npm run validate:reports` 是严格独立审计，任何坏稿返回非零并列出路径；`npm run build` 会隔离单份坏稿，仍出版其余有效历史，并在日志、manifest、诊断页记录错误。若只有坏稿、源扫描失败或构建异常，则失败且不部署，保留上次成功网站。没有稿件且没有错误时可发布空站。

部署工作流为 .github/workflows/deploy.yml，push main 的源码或 data/reports 变化自动触发，支持 workflow_dispatch。每次构建获取最新 main 快照；workflow 串行执行并跳过已过时的提交，避免较旧构建覆盖较新数据。只授予读取代码与 Pages 发布权限，不需要 Actions secrets 或 PAT。

设置页改为来源与出版诊断：区分构建时间、真实稿件生成时间、各频道最新日期、缺报和解析错误，提供仓库及 Actions 链接。部署实际完成时间以 Actions 记录为准；本站不能探测一个尚未成功替换本站的失败部署，不会将网站可读解释成三任务成功。

首次发布要在 https://github.com/njuzss/sota/settings/pages 选择 Source → GitHub Actions。地址目标为 https://njuzss.github.io/sota/；workflow 配置或源码推送本身不证明网站已上线。部署、手动重跑、回退和任务切换步骤见 docs/DEPLOYMENT.md。

## 实现与边界

静态资源使用版本化 manifest，并按日期/频道读取正文；搜索首次查询才加载分片。中文分字/二元词、英文大小写无关及前缀/多词匹配复用旧 tokenizer；结果按日期排序，最多 50 条，不宣称与 SQLite BM25 排名相同。稳定条目锚点在历史回填后仍有效，后一天的描述不反写旧刊。

沿用 BrowserRouter 的阅读 URL，为已存在的日期与固定页面生成真实 HTML 目录入口。已知深链接刷新不依赖 SPA 重写；未知路径由 Pages 404.html 显示空态，HTTP 仍为 404。详见 docs/ARCHITECTURE.md 和 docs/VALIDATION.md。

AIHOT 仅为旧版展示思路参考；未引入采集/模型流水线、PostgreSQL、队列或后台服务。旧 njuzss/ai、原始 Drive/本地源稿及既有任务保持不变，可回退。docs/V1_REQUIREMENTS.md 仅为历史参考，当前正式链路以本仓库 REQUIREMENTS.md 为准。
