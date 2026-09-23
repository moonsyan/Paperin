# 参与 Paperin

当前集成分支为 `master`；独立变更可在工作分支完成，提交与合并遵守任务授权和仓库门禁。GitHub 已有公开 v0.6.0；当前 0.7.0 候选的 Draft/安装循环仍为 UNVERIFIED，不因贡献说明而自动推送或发布。

## 报告问题

- 缺陷、体验和数据安全问题使用 GitHub 上对应的 Issue 模板。
- 不要在 Issue 里粘贴笔记正文、绝对路径、token 或可识别的知识库内容。
- 安全漏洞按 [`SECURITY.md`](SECURITY.md) 走 GitHub 私密安全公告，不要公开复现数据。

## 提交代码

1. 阅读仓库根目录 `AGENTS.md`、[`docs/IMPLEMENTATION-PLAN.md`](docs/IMPLEMENTATION-PLAN.md) 与 [`docs/PROJECT-STATUS.md`](docs/PROJECT-STATUS.md)。
2. 保持 Main、Preload、Renderer、Shared 的进程边界。
3. 同一变更里带上对应测试和需要同步的文档。
4. 提交前运行 `npm run lint`、`npm run typecheck`、`npm run test` 和 `npm run build`。界面变更加 `npm run a11y`；界面、文件、IPC、编辑器或打包变更加 `npm run smoke`；性能变更按计划执行专项门禁。默认测试当前可能因已知工程问题失败，见项目状态，不得隐瞒。
5. 提交说明使用 `<type>: <简体中文摘要>`，例如 `feat:`、`fix:`、`docs:`、`test:`、`chore:`。不要追加虚构的工单编号。

当前没有外部协作流程、账号体系或实时协作接口。

文档变更按[文档维护规则](docs/development/documentation-maintenance.md)核对代码、命令、链接和阶段依赖。战略入口为 [2026-09-23 报告](docs/PRODUCT-STRATEGY-REVIEW-2026-09-23.md)。入门文档与 `buildGettingStartedMarkdown` 同步，运行现有一致性测试。历史审阅与原始测量保留原事实；待实现或未验证能力不能写成用户已可用且已验收。提交只包含本任务文件，尤其排除 `.paperin`、草稿与生成产物。
