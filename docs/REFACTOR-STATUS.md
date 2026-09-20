# Paperin 当前完成度

更新时间：2026-09-20（Asia/Shanghai）

## R00 结项（feat/strategy-execution）

**任务号：** R00  
**提交：** `bead366`  
**失败测试（修复前）：** HelpDialog 未使用 `fireEvent`（lint error）；`useWorkspaceFiles` hooks 依赖警告 3 条；Electron 缺失时 3 套件无法加载。  
**修复后结果：** 针对性 vitest 26/26 通过；全量 **194** 文件 **1408** 项通过（exit 0）；lint 0 error 0 warning；typecheck/build exit 0。  
**全量门禁：** `npm run lint` 0；`npm run typecheck` 0；`npm run test` 0（1408 passed）；`npm run build` 0；`npm run smoke` **exit 1**（Electron 二进制已存在，首步 `SMOKE_FAIL 系统关联文件未进入外部标签`，渲染层 React #301，待 R00 后单独归因，不阻塞 lint/单测基线）。  
**文档：** 本文件、`docs/superpowers/plans/2026-09-20-product-strategy-execution.md` §3 复选框。  
**人工边界：** 本地 Node **v24.19.0** / npm **11.17.0**（CI 仍用 Node 22）；`node_modules/electron/dist/electron.exe` 存在；smoke 未绿。  
**实际工时：** ~2h（自动化记录）  
**下一项：** R01  

**环境证据：** Node v24.19.0、npm 11.17.0、Electron 可执行文件 present、`useWorkspaceFiles.ts` 356 行（已拆 `workspace-file-pre-save.ts`、`workspace-move-file.ts`）。

## 2026-09-20 审查增量

基线 `b6ad9a5` 本轮类型检查和生产构建通过；lint 有 1 个 error、3 个 warning；主题/焦点静态门禁通过但有 37 项主题基线豁免。全量测试为 190 文件通过、3 文件因 Electron 二进制缺失加载失败，执行到的 1,374 项通过；smoke 同样被运行时缺失阻塞。官方二进制下载超时，本轮没有新的桌面运行或性能通过记录。

代码定向复现发现带 BOM 异常编码可被宽松转换、保存旧基线 500ms 容差契约缺口（双窗口端到端仍待验证）、集合输出内容失真与目录事件过滤问题；另有搜索覆盖、输出反馈和恢复边界问题。**本轮仅审查并交付文档，没有修复这些实现。** 细节和复现见 [审查证据](development/product-audit-2026-09-20.md)，后续顺序见 [R00–R17 实施任务](superpowers/plans/2026-09-20-product-strategy-execution.md)。

下方保留 9 月 19 日的工程记录；它不代表新发现已经处理，也不替代本轮验证结果。

以下为 9 月 19 日保留记录；更晚的证据以上方审查增量为准。旧 M0–M2 批次可查 Git 历史。下一轮顺序见 [R00–R17 实施任务](superpowers/plans/2026-09-20-product-strategy-execution.md)，验收口径见 [strategy-validation](development/strategy-validation.md)。自动测试通过不等于平台、用户或商业验收通过。

## 这次核对跑过什么

2026-09-19 夜间再次执行 `npm run typecheck` 和 `npm run test`（193 个测试文件、1400 项通过）。同日较早一次 `npm run build` 已通过；这一轮没有重跑 `build`、`lint`、`a11y`、`smoke` 或 `perf:electron`。

## 已经落地、且有自动测试的行为

- **保存身份**：大文档保存和关闭绑定文件、会话和编辑器实例。超时、切换或晚到的旧回执不会把新输入标成已保存，也不会放行关闭。关窗超时会作废这次关闭许可，但已经启动的保存继续跑完，并等它结束才允许下一次关窗。切离、新建、打开和重命名/删除/移动大文档时会等待 listener 快照，超时则取消操作。覆盖写入若已把新内容校验进目标、只差 committed journal，下次打开会保留新版本而不是回滚 backup。顶栏和状态栏会显示保存中、冲突、编码无法保存和保存失败。无磁盘路径的示例和未命名文档不会显示“已保存”。
- **可恢复写入**：已有文件经同目录 journal/backup 覆盖。可控注入点（临时写入拒绝、备份复制失败、覆盖中断、目标同步失败、prepared 恢复、committed 清理、外部修改保留、活动 journal 并发拒绝）各有 20 次隔离目录回归。进程终止、真实磁盘满/权限、符号链接换靶的完整矩阵和三平台文件身份还没有做。
- **5 MiB 硬门禁**：2026-09-15 起，固定长段落夹具在这台 Windows 开发机上有三次独立 Electron 通过记录；2026-09-18 另有一次生产构建记录（打开 2673.2 ms、保存 300.05 ms、资源包导出 121.94 ms，20 标签循环 P95 82.5 ms）。这不能外推到多结构夹具、另一台电脑或 8 小时运行。
- **资料复用**：工作区搜索按文件名和标题优先排序，并分开说明“匹配达到 200 条”和“没有扫完”。搜索和反链可插入当时的片段快照；标题行带普通 Markdown 锚点；搜索插入后回到打开搜索时的位置；换成另一篇后拒绝旧结果。搜索词和最近引用的库内路径会记住，可以清除，不存正文。
- **打开与导出**：打开知识库后只报告未扫完、缺附件、断链和残缺脚注，不改原文。Markdown、HTML、PDF、Word 和 Pandoc 导出前检查空图片、不安全链接和缺失本地目标；取消不写文件。按标签或目录做集合导出时，已经打开的笔记用编辑器实时正文，未打开的才读磁盘。导出内联本地图片按文件句柄读取，路径被换成链接后不把目标写进导出文件。保存对话框选定路径后，写出前再核对目标真实身份。资源包只写刚刚选定的导出目录，不把知识库当成写出目标。导出代码块时去掉格式化按钮和折叠标记，被折叠的文字仍在结果里。技术文章和决策记录模板可从命令面板创建。说明见 [coexistence](coexistence.md) 与 [export-formats](export-formats.md)。
- **粘贴、代码块和图表**：剪贴板里的 Markdown 原文按标题、列表和强调排版，不因附带 HTML 变成纯文本；网页 HTML 用 DOMParser 转换，不执行脚本、不加载图片。JSON/YAML 可格式化或压成一行，有缩进的代码可折叠一段且不改文件。Mermaid 渲染前去掉共同缩进、零宽字符、误带围栏和 init；主题样式里的 `.error-icon` 以及节点中的 Syntax error 文字不算画失败。
- **写入授权**：跨进程保存锁等待期间，若该路径已经不在信任范围内，保存拒绝写入，不会把缺失的授权函数当成放行。信任根在首次解析后钉住真实路径，之后 junction 换靶不会扩大范围；钉住结果写入主进程私有清单，重启后继续使用。图片读取白名单同样记下并恢复真实目录。工作区新建、重命名、移动和删除使用同一钉住根，并在真正调用系统函数前再核对一次。打开对话框和另存为只授权这一篇，不把父目录升级为可写工作区。拖入文件只授图片读取，不能用该白名单保存或删除图片。自定义 CSS 导入只读普通文件句柄。读取路径的 journal 恢复若授权失败则跳过，不会把 backup 写到未授权目标。打开、索引、搜索、版本快照和 `mdimg` 图片都拒绝符号链接，并只读取与打开前 inode 一致的普通文件；单篇身份变化不会拖垮整库索引。
- **外部冲突**：保存除 mtime 和尺寸外，还会比较上次读取/写入的内容哈希，等长且保留 mtime 的外部替换也会 `CONFLICT`。冲突哈希只读普通文件句柄；保存成功后记下的哈希是刚刚写出的字节。重命名和移动在尺寸不变时把这份哈希带到新路径。重启恢复草稿时，若记下了起草时正文的哈希，磁盘正文已经不同就放弃草稿。编辑器撤销回已保存基线会消耗 pending dirty。活动预览仍有未落账输入时会固定而不是拆掉。命令面板是模态对话框，Escape 在捕获阶段关闭。
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
| `src/renderer/src/app/workspace/useWorkspaceFiles.ts` | 356（R00 已拆 move/pre-save） |
| `src/renderer/src/app/useAppSettings.ts` | 496 |
| `src/renderer/src/components/Editor/overlays/useEditorOverlays.ts` | 486 |
| `src/renderer/src/components/Editor/plugins/mermaidCodeBlock.ts` | 482 |
| `src/renderer/src/components/Editor/instance/useMilkdownInstance.ts` | 462 |
| `src/main/ipc/file-handlers.ts` | 451 |

`AppComposition.tsx` 停在 449 行。上表里的文件已经超过 450 行，触及时先拆再加功能。
