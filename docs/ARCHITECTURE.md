# Architecture

## Reuse

从旧 SOTA 复用 contracts、Schema v1、parser、importer、SQLite/store、publication、image-service、React App、样式和 fixtures/25 个原回归测试。没有重建 UI 或采集系统。构建使用内存 SQLite 来复用 publication/FTS 列；不产生需迁移的数据库，也不在网站运行它。

REQUIREMENTS.md 是 njuzss/sota 初始提交提供的正式 V2 边界，保持原文。旧 V1 文档单独存档，不作为当前投递说明。

## Source and publication

正式来源固定 data/reports/<channel>/PH_<CHANNEL>_YYYY-MM-DD.json。ReportDirectoryAdapter 严格核对目录、文件名、正文和 schema；每文件解析失败记录相对源路径，继续处理其他合法报告。忽略 .md/.txt，拒绝已知 fixture 的原文字节。扫描/fetch 使用同一份构建快照，运行时 reader 无 source adapter。

沿用每期 snapshot_json，身份由 canonical URL/repo/规范化标题确定。公开 report ID 从 channel+date 派生，item ID 从 channel+stable_key 派生（52-bit SHA-256 整数并检查碰撞），保持分享锚点稳定。generated_at 决定确定性导入顺序，checkout mtime 不影响内容版本。

```text
manifest.json  # version/schema/build, built_at, commit, latest, dates, archive counts, validation summary
revisions/<content-hash>/
  archive.json
  status.json
  day/YYYY-MM-DD.json
  channel/{frontier,trending,market}.json
  search/{frontier,trending,market}.json
```

构建时间只在 manifest 中记录，内容 revision 不因 wall clock 改变。Manifest 最后写入。构建先写临时目录再替换成功快照；没有可信内容的错误输入不会覆盖上一份成功版本。没有来源且无错误允许发布诚实空态。部分坏稿随有效历史一起输出诊断，坏期不伪装成功刊。原稿从不因缺报或构建失败自动删除。

## Reader and routing

PublicationReader 保留原 API-shaped 服务调用接口，实际网络只请求同源 /sota/data/... JSON；无 /api HTTP 依赖。一次阅读固定 manifest 版本；日期、归档和频道按需读取，首次搜索才读三份分频道索引。共享缓存避免重复传输，不加载整个历史正文进首屏 JS。

Vite 默认 /sota/，BrowserRouter 使用 BASE_URL。routes.ts 为已知日期和固定页面写真实 HTML 入口，资产均为绝对子路径；Pages 对目录 URL 的重定向保留查询和锚点。404.html 仅用于未知路径，HTTP 404 语义不隐藏。发布后仍需实际访问/刷新验证。

## Actions and delivery

任务直接写 main 下各自频道原稿，使用最新 SHA、限次重试和写后读回；不会争用派生 manifest。Actions 不进行新闻采集或模型写作，不需要 Google/GitHub secrets。

部署使用 workflow-level concurrency（不取消正在运行的部署）；每个 run 取得最新 main，上传该快照的 artifact；部署前比对 main SHA，若已过时则跳过，由排队的后续 run 发布。GitHub 可能替换 pending runs，但后续构建仍读最新 main，包含所有已提交频道。build 只读代码/pages 元数据，deploy 只加 pages:write/id-token:write。

诊断页给出 built_at、构建 commit、稿件生成时间、每频道最新期、缺报、解析失败和警告。真正的部署完成时间/其他运行是否失败，必须到 Actions 查验；不能通过静态页面推断未生效的新部署状态。

## Migration

默认 dry-run，普通 PH_*.json 白名单，拒绝 fixture；仅写新仓库中的隔离输出或 data/reports/<channel>。保留原始 UTF-8/BOM/换行，输出 SHA-256 清单。channel/date 重复按生成时间及可信源修订顺序选择，并给出冲突清单；无法排序的竞争稿不覆盖。SQLite 导出连接只读，不复制二进制。生产数据公开前审查凭据、私有链接和个人/内部资料。

保留的 V1 backend/adapters/旧命令只是回归兼容性代码，不是当前正式入口。它们不被浏览器 bundle 引用；新的生产命令、工作流和 TASK_PROMPTS 全部只使用 GitHub 原稿链路。
