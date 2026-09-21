# 参与 Paperin

Paperin 在 `master` 上开发。功能、缺陷修复和文档都直接进入这条分支。

## 报告问题

- 缺陷、体验和数据安全问题使用 GitHub 上对应的 Issue 模板。
- 不要在 Issue 里粘贴笔记正文、绝对路径、token 或可识别的知识库内容。
- 安全漏洞按 [`SECURITY.md`](SECURITY.md) 走 GitHub 私密安全公告，不要公开复现数据。

## 提交代码

1. 阅读仓库根目录 `AGENTS.md` 和 `docs/IMPLEMENTATION-PLAN.md`。
2. 保持 Main、Preload、Renderer、Shared 的进程边界。
3. 同一变更里带上对应测试和需要同步的文档。
4. 提交前运行 `npm run typecheck`、`npm run test` 和 `npm run build`。界面、文件、IPC 或打包变更再运行 `npm run smoke`。
5. 提交说明使用 `<type>: <简体中文摘要>`，例如 `feat:`、`fix:`、`docs:`、`test:`、`chore:`。不要追加虚构的工单编号。

当前没有外部协作流程、账号体系或实时协作接口。
