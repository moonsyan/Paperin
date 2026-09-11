# LastFileHome 已完成与未完成清单

更新时间：2026-09-10（Asia/Shanghai）

本文是当前 `master` 的唯一实时完成度记录。实施计划和路线图描述目标，不因代码存在而自动视为完成；本清单只记录已经验证的行为，以及仍需继续处理的工作。

## 当前结论

本批重构、运行时告警治理、生产搜索/监听门禁、标签会话拆分和窄窗口可访问性收敛已完成，并已验证到本地 `master` 工作区。项目可构建、可运行，普通真实 Electron smoke 主链路通过。

整个产品重构尚未完成。5 MiB 编辑器保存/导出全链路、完整 quiet-workspace 迁移、低频能力迁移和三平台安装包验证仍是明确的发布前工作；性能门禁已将保存未进入 IPC 的问题固定为失败证据。

## 已完成

### 工程与进程边界

- 已建立 Electron Main、Preload、Renderer、Shared 的可运行基线，并保留窄化的 `window.desktopAPI` 边界。
- ESLint 9 flat config 已覆盖源码、脚本和根 TypeScript 配置；lint、strict typecheck、测试、构建和 smoke 都有稳定命令。
- Electron smoke 使用隔离的临时 `userData`，无 GPU 环境会在 `app.ready` 前禁用硬件加速。
- 未提交 `out/`、`release/`、用户数据、日志、草稿正文、token 或绝对用户路径。

### 文档会话与编辑器

- Shared 已定义 `DocumentRef`、`DocumentSession`、工作区/外部文件来源、mtime 和 UTF-8/UTF-16/GBK 编码联合类型。
- `useDocumentState` 已收敛为单一 `DocumentRecord` store；正文、保存基线、mtime、编码不再由多套 React state 独立维护。
- 保存竞态会保留保存开始后的新输入；冲突和编码损失路径继续禁止静默覆盖或丢字。
- 真实 Milkdown 组件已实现 `EditorAdapter` 的 Markdown 读写、聚焦、语义命令和订阅；卸载时清理订阅，Milkdown/ProseMirror 仍是正文唯一状态源。

### 工作区壳层、命令与面板

- `WorkspaceShell` 持续显示知识库上下文；`CurrentFileBanner` 显示标题、来源、路径和 dirty 状态，外部文件不会被误标为知识库文件。
- 命令注册表已支持 app/workspace/document scope、关键词和统一可用性判断；外部 Markdown 在没有知识库时仍拥有文档级命令。
- `ContextDock` 已真正由 `PanelRegistry` 驱动顺序、标题、scope 和 `render(context)`；支持安全的自定义面板 ID、内置面板覆盖和布局持久化。
- 文档级大纲/属性与工作区级关系/标签/检查会按上下文出现；持久化面板失效时回退至第一个可用面板。
- 隐藏状态保留可访问恢复入口；Escape 收起并恢复按钮焦点；分隔器支持键盘调宽和数值 ARIA；拖拽取消或组件卸载会清理全局监听。
- ContextDock 主组件和面板渲染组件分别保持在 250 行门禁以内。

### 运行时安全与告警

- Renderer CSP 只在已有图片白名单之外，为构建内联的 KaTeX 字体在 `font-src` 放行 `data:`；脚本与连接来源未放宽。
- Mermaid 源码通过 Refractor 纯文本别名交给既有预览插件处理，Prism 不再误报不支持语言。
- CSP 有直接安全契约测试；Electron smoke 遇到 CSP violation 或 Prism unsupported 会失败。

### 系统打开与生产索引

- Windows 文件关联、启动 argv、macOS `open-file` 和 `second-instance` 均经过 Main 校验后才进入 Preload 窄事件；启动早期事件有队列，单窗口复用、无窗口恢复、多窗口 fresh 隔离均有规则测试。
- 外部 Markdown 通过现有文档标签路径打开，同一路径去重；外部临时文件不会加入工作区索引，关闭前保存失败会保持窗口。Electron smoke 已覆盖关联文件、外部标签和重复打开。
- 生产 `WorkspaceIndexService` 已改用真实文件系统适配器，5000 文件预算、无变更刷新和单文件增量刷新进入独立性能门禁；当前基线约为冷索引 538ms、刷新 97ms、增量 98ms、峰值 RSS 126.5MiB。
- 生产工作区搜索现在与索引共享 5000 文件覆盖预算；真实 IPC 在末尾文件命中，watcher 对 20000 事件按路径去重并合并为单批刷新，`npm run perf:workspace-search-watch` 已纳入回归门禁。

### 维护性拆分

- GraphView 入口已从 932 行拆为 197 行入口、画布、工具栏、设置、布局/视口/交互 hooks 和纯函数模块；Sidebar 已收敛为 438 行以内的文件树，并将上下文菜单、图标、外部文件模型独立成模块。
- GraphView、Sidebar、系统打开和文档来源均有直接行为测试；拆分没有改变现有外部 API。
- `useDocumentTabs` 已拆为打开、关闭、工作区视图恢复和纯关闭计划模块；入口 103 行，补充关闭计划测试和维护说明。
- 窄窗口下 Sidebar 变为不挤压正文的抽屉；TabBar 上下文菜单接管焦点并在 Escape 后恢复触发标签，Sidebar/TabBar 组件测试覆盖这些行为。
- `App.tsx` 已保留稳定入口，组合控制器移至 `app/AppComposition.tsx`；组合控制器已从 2010 行收敛到约 440 行，只负责装配功能域 hook 与渲染视图组合。业务实现移入 `useAppSettings`、`useWorkspaceIndexes`、`useEditorFeatures`、`useGraphView`、`useAppLayout`、`useWritingMetrics`、`resolve-collection-entries`，视图拆为 `AppTopBar`、`AppWorkspace`、`AppDialogs`。
- 编辑器目录已按功能域重排：`adapter/`（对外门面与命令映射）、`content/`（正文替换、位置换算、视图状态）、`viewport/`（视口虚拟化与导出快照）、`navigation/`（光标导航与标题枚举）、`overlays/`（浮动层与 Wiki 补全）、`instance/`（Milkdown 实例装配），原有 `plugins/` 不变。`useEditorContentReplacement.ts` 从 709 行降到约 340 行，大文档流式替换独立为 `useStreamingReplace`，新增纯函数模块均带直接测试。
- 图谱打开的工作区校验与链接刷新收敛到 `useGraphView.openGraphView`，`useAppActions` 只保留委托，避免同一策略分散两处；主题持久化统一收进 `useAppSettings`。

### 合成性能基线

- 仓库提供 5,000 个 Markdown 文件 × 2,048 B 的合成脚本基线和阈值，以及单个 5 MiB 文件的补充基线。
- 最新门禁运行结果：`treeMs=12.15`、`indexMs=452.66`、`searchMs=323.73`、峰值 RSS `146 MiB`。
- `npm run perf:regression` 默认读取仓库场景；显式更新基线时会同步更新场景，避免 baseline 与 scenario 不一致。
- 该门禁只约束 `scripts/perf-baseline.mjs` 的合成扫描/解析/搜索口径，不代表生产 `WorkspaceIndexService`、Renderer 或 Electron 端到端性能。

## 最终验证

| 门禁 | 结果 |
| --- | --- |
| `npm run lint` | 通过 |
| `npm run typecheck` | 通过 |
| `npm run test` | 通过：116 个测试文件，945 项测试 |
| `npm run build` | 通过：Main、Preload、Renderer 均成功构建 |
| `npm run perf:regression` | 通过：5,000 文件合成场景未超阈值 |
| `npm run smoke` | 通过：打开工作区、新建、保存、冲突、重读、重命名、搜索、状态读取 |
| `npm run perf:workspace-search-watch` | 通过：5000 文件末尾搜索；20000 watcher 事件去重，搜索 P95 约 437ms、刷新 P95 约 192ms |
| `npm run perf:production` | 通过：生产索引、搜索、监听门禁；本次冷索引 1375ms、暖刷新 99ms、增量刷新 105ms |
| `npm run perf:electron` | 修复前未通过：5 MiB 打开/DOM 编辑后，Milkdown 序列化超过 240s 仍未进入保存 IPC；已加入 >1 MiB 快照保存策略，完整门禁待重新跑完 |

测试输出仍包含部分既有脚注/数学异常输入用例的预期诊断，以及 Vite CJS API 的弃用提示；它们不导致失败，但后续应继续收敛测试噪声。

## 未完成

### 发布前高优先级

- 优化 5 MiB 文档的保存/关闭路径：超过 1 MiB 时优先复用已落账快照，避免重复同步序列化；真实 Electron 门禁仍需重新跑完以确认 `document.save` IPC、导出和 20 标签切换 P50/P95、内容一致性、监听释放与主/渲染进程内存。
- 完成 Windows 安装包启动、文件关联、保存、导出验证；macOS/Linux 安装包与更新流程仍需对应平台环境。

### 架构与维护性

- 仍超过项目行数门禁的文件：`src/main/ipc/file-handlers.ts`（654）、`src/renderer/src/lib/docx.ts`（613）、`app/useAppActions.ts`（552）、`hooks/useExports.ts`（506）、`app/workspace/useWorkspaceFiles.ts`（505）、`app/useAppSettings.ts`（496）、`Editor/overlays/useEditorOverlays.ts`（486）、`Editor/instance/useMilkdownInstance.ts`（485）。`AppComposition.tsx`（447）与 `useEditorContentReplacement.ts`（约 340）已完成第一轮拆分，需继续按命令域与导出域收敛。
- Sidebar 主区域、`editor.margin` 和 `statusbar.end` 尚未全部消费 `PanelRegistry`；菜单、右键菜单和全部快捷键也未完全统一到命令注册表。
- 搜索、图谱、反向链接、标签和质量检查的往返选择状态尚未统一到单一工作区视图模型。
- 文档会话控制器尚未完全收口草稿恢复、关闭确认和所有保存分支；仍需逐项验证卸载取消和多窗口竞态。

### UI 与功能迁移

- 顶栏、Sidebar、TabBar 和窄窗口抽屉只完成了第一轮 quiet-workspace 收敛，整体迁移仍未完成。
- 中文输入法组合态、全键盘导航、焦点不被弹层遮挡，以及全部内置主题的文本/边框/悬停/禁用/焦点对比度仍需完整人工冒烟。
- 最近文件、收藏、搜索、图谱、标签、链接、图片、发布、导出、历史、草稿和设置等既有能力仍需逐项登记到“命令 + 面板 + 新文档模型”，并同步兼容矩阵。
- Renderer 主包仍较大；Mermaid/图谱等低频能力的按需加载和分包尚未完成。

## 本轮提交

| 提交 | 内容 |
| --- | --- |
| `d76a0a5` | 稳定 Electron smoke 启动 |
| `9854fef` | 将真实 Milkdown 接入 EditorAdapter |
| `34d138d` | 统一 DocumentRecord 会话 store |
| `4867244` | 恢复 ESLint 质量门禁 |
| `926018a` | 增加运行时告警和合成性能门禁 |
| `2e8827c` | 让 ContextDock 完整消费 PanelRegistry |
| `fa66e1d` | 生产搜索/监听门禁、文档标签职责拆分、窄窗口抽屉与 TabBar 焦点，以及真实 Electron 大文档门禁（当前暴露序列化瓶颈） |
| `9eecdf0` | 超过 1 MiB 文档保存/关闭优先复用落账快照，避免同步序列化阻塞 Renderer |

更早的基线、领域模型、命令边界和工作区壳层提交已包含在同一 `master` 历史中。

## 建议继续顺序

1. 先修复 5 MiB Milkdown 序列化/保存瓶颈，恢复 Electron 全链路性能门禁的通过证据。
2. 以 `app/useAppActions.ts`、`hooks/useExports.ts`、`app/workspace/useWorkspaceFiles.ts`、`Editor/instance/useMilkdownInstance.ts`、`Editor/overlays/useEditorOverlays.ts` 和 `src/main/ipc/file-handlers.ts` 为下一批拆分入口，按功能域继续收敛控制器和单职责组件。
3. 完成 quiet-workspace、小窗口、输入法、焦点和主题的人工/端到端验证。
4. 逐项迁移低频功能到命令注册表、面板和新文档模型。
5. 完成 Windows 安装包以及 macOS/Linux 安装包和更新流程验证。
