# Paperin 当前完成度

更新时间：2026-09-19（Asia/Shanghai）

本文只记录当前仍然有效的事实。旧的 M0–M2 批次日志、互相矛盾的“已完成/仍失败”段落已从本文删除，需要时看 git 历史。任务顺序和验收口径分别在 [NEXT-DEVELOPMENT-PLAN](NEXT-DEVELOPMENT-PLAN.md) 与 [strategy-validation](development/strategy-validation.md)。自动测试通过不等于平台、用户或商业验收通过。

## 这次核对跑过什么

2026-09-19 在本机执行 `npm run typecheck` 与 `npm run test`：177 个测试文件、1328 项通过。同日没有重跑 `lint`、`a11y`、`build`、`smoke` 或 `perf:electron`。那些命令的最近记录仍是 2026-09-16 至 2026-09-18 的批次，不能改记成今天的结果。

## 已经落地、且有自动测试的行为

- **保存身份**：大文档保存和关闭绑定文件、会话和编辑器实例。超时、切换或晚到的旧回执不会把新输入标成已保存，也不会放行关闭。顶栏和状态栏会显示保存中、冲突、编码无法保存和保存失败。无磁盘路径的示例和未命名文档不会显示“已保存”。
- **可恢复写入**：已有文件经同目录 journal/backup 覆盖。可控注入点（临时写入拒绝、备份复制失败、覆盖中断、目标同步失败、prepared 恢复、committed 清理、外部修改保留、活动 journal 并发拒绝）各有 20 次隔离目录回归。进程终止、真实磁盘满/权限、符号链接换靶的完整矩阵和三平台文件身份还没有做。
- **5 MiB 硬门禁**：2026-09-15 起，固定长段落夹具在这台 Windows 开发机上有三次独立 Electron 通过记录；2026-09-18 另有一次生产构建记录（打开 2673.2 ms、保存 300.05 ms、资源包导出 121.94 ms，20 标签循环 P95 82.5 ms）。这不能外推到多结构夹具、另一台电脑或 8 小时运行。
- **资料复用**：工作区搜索按文件名和标题优先排序，并分开说明“匹配达到 200 条”和“没有扫完”。搜索和反链可插入当时的片段快照；标题行带普通 Markdown 锚点；搜索插入后回到打开搜索时的位置；换成另一篇后拒绝旧结果。搜索词和最近引用的库内路径会记住，可以清除，不存正文。
- **打开与导出**：打开知识库后只报告未扫完、缺附件、断链和残缺脚注，不改原文。Markdown、HTML、PDF、Word 和 Pandoc 导出前检查空图片、不安全链接和缺失本地目标；取消不写文件。技术文章和决策记录模板可从命令面板创建。说明见 [coexistence](coexistence.md) 与 [export-formats](export-formats.md)。
- **界面基线**：顶栏、路径条、同名消歧、窄窗口抽屉、轻大纲、九主题对比度门禁、收藏重启恢复和低频命令登记已经实现。真实中文输入法、九主题加 100/125/150% 缩放的人工矩阵还没有做。输入法组合态下的 Escape 已有自动保护，不能代替真机输入法。

## 明确还没验证

- 安装、升级、卸载、文件关联，以及 macOS / Linux。2026-09-18 只生成过未签名的 Windows 安装包，没有在隔离环境安装。
- Q01 里尚未注入的故障：进程终止、真实磁盘满、真实权限拒绝、硬件掉电。
- Q02 的完整时序矩阵：真实中文输入法、跨平台、每类规模的全量重复。
- M01 的多结构 5 MiB、另一台 16 GB / SSD 设备、8 小时内存趋势。
- 用户任务成功率、试用回访、研究记录、获客和收费。

## 仍超过行数门禁、且这次没有拆的文件

2026-09-19 实数。触及时再拆，不把账本当成已经拆完。

| 文件 | 行数 |
| --- | --- |
| `src/renderer/src/lib/docx.ts` | 599 |
| `src/renderer/src/app/workspace/useWorkspaceFiles.ts` | 505 |
| `src/renderer/src/app/useAppSettings.ts` | 496 |
| `src/renderer/src/components/Editor/overlays/useEditorOverlays.ts` | 486 |
| `src/renderer/src/components/Editor/instance/useMilkdownInstance.ts` | 485 |
| `src/main/ipc/file-handlers.ts` | 450 |
| `src/renderer/src/app/AppComposition.tsx` | 449 |
| `src/renderer/src/components/Editor/content/useEditorContentReplacement.ts` | 345 |

`AppComposition.tsx` 停在 449 行，超过 450 行不得再往里加功能。
