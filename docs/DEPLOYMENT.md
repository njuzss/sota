# Deployment and task cutover

目标仓库：njuzss/sota，main。正式网址目标：https://njuzss.github.io/sota/。

## Initial deployment

1. 源码、workflow 和通过公开范围审查的日报推送 main。
2. 进入 https://github.com/njuzss/sota/settings/pages ，在 Build and deployment → Source 选择 GitHub Actions。不要修改旧 njuzss/ai 设置。
3. 在 https://github.com/njuzss/sota/actions/workflows/deploy.yml 手动 Run workflow（或等下一次 main/data/reports push）。默认无需 secrets/PAT。
4. 以 deploy job 的 github-pages environment URL 和成功状态为准，然后实际打开首页、搜索、归档和日期链接并刷新。源码推送、CI 成功或 configure-pages 步骤存在不等于已上线。

使用 GitHub 官方 configure-pages、upload-pages-artifact 和 deploy-pages：
https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages

## Source delivery

唯一写入路径见 REQUIREMENTS.md。任务必须先 fetch 最新路径/SHA，再 create/update，并读回解析；冲突/限流有限重试。任务不写构建产物或其他频道。新 raw commit 自动触发 Pages 构建，不需要任何本地服务在线。

三个完整可替换 Prompt 见 TASK_PROMPTS.md。现有选题/原始来源/图片/证据/市场情景规则保留；只有交付方式和校验改为 GitHub。**当前没有改动任何线上任务，也没有创建任务或改时间。**

用户确认切换后，先在现有前沿或 Trending 任务中替换对应完整 Prompt，并核对实际后台的执行时间。先验证一次 GitHub 写入→读回→Actions→Pages 可见，再切换另两个。旧记录为前沿/Trending 每日 08:00，市场周一至周五 15:30（Asia/Shanghai），应以用户后台当前实际设置为准。

## Failure and rollback

- 独立严格审计 `npm run validate:reports` 返回非零时，查看相对源路径/解析原因。
- 一条坏 JSON 被隔离，其他合法历史继续发布；无有效内容的错误构建失败，上一次成功 Pages 不变。空 source 且无错误可发布诚实空态。
- 缺报不删除历史、不伪造，不使用上日稿冒充今日。图片 403/404 降级不阻塞正文。
- 部署失败到 Actions 查日志并重跑。静态页面只能呈现上一次生效版本，不自动检测尚未生效的新失败。
- 回退代码/日报：在 njuzss/sota 对问题提交执行 git revert 并推送 main，让工作流重建。原稿 Git 历史可恢复；不删除 Drive 原件或旧项目。
- 任务交付回退需用户确认，恢复其保留的旧 Prompt 与来源。新站验证稳定之前，旧本地服务不主动停用。
