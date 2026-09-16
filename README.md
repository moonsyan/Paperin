# Paperin

Paperin 是一个本地优先的个人 Markdown 知识工作台。它把真实的 Markdown 文件、连续写作体验和知识关联放在同一个工作区里：文件在本地，编辑器负责写作，搜索和关联帮助你在需要时找回旧内容。

Paperin 是项目统一产品名称，工作区状态写入 `.paperin`，应用设置和缓存沿用 Electron 的 Paperin 用户数据目录。

## 产品方向

产品面向需要长期积累资料、写作和管理个人项目的用户。核心闭环是：

```text
收下资料 → 写出理解 → 找到相关内容 → 用进文章或项目 → 导出成果
```

设计原则是“安静写作，随时复用”。默认页面突出当前文档，低频操作集中到“更多”、命令面板和上下文面板；知识库、文件树、标签、反向链接和图谱仍然可用，但不会同时抢占正文的注意力。

当前阶段保持免费，优先把本地写作、资料复用和可靠性做好。默认不启用账号和云同步；AI、发布和跨设备能力按真实使用场景逐项验证，不把概念方案当成已实现功能。

## 当前能力

- 本地知识库：打开文件夹后，文件树、标签、标签页、编辑器和辅助面板共享同一个工作区上下文。
- Markdown 写作：Milkdown/ProseMirror 编辑器支持 GFM、任务列表、表格、代码、公式、Mermaid、脚注和 frontmatter。
- 文件可靠性：新建、打开、保存、另存为、重命名、移动、回收站删除、外部修改冲突和多种编码处理；已有文件覆盖写入保留可恢复的确认版本。
- 文档会话：多标签、固定标签、dirty 状态、草稿恢复、关闭确认和外部 Markdown 文件统一走同一套会话模型。
- 找回与复用：快速打开、工作区全文搜索、当前文档查找替换、最近编辑、收藏、标签、Wiki 链接、反向链接和关系图谱。
- 收藏闭环：文件树、最近编辑和“我的收藏”都可点击星标收藏/取消；收藏按知识库保存在本机，重启后恢复。
- 辅助工具：大纲、属性、链接、标签、质量检查、写作统计、版本历史和图片管理按需打开。
- 输出：HTML、PDF、DOCX、EPUB、LaTeX、Pandoc 等导出入口保留在菜单、命令面板和文档操作中。
- 外观：九套主题、字体与字号设置、雾白/夜松的柔和工作台样式、窄窗口抽屉和键盘焦点恢复。
- 安全边界：Renderer 只通过 typed `window.desktopAPI` 访问文件和设置；路径信任、图片协议、CSP 和 IPC 参数均由主进程校验。

## 界面原则

生产界面采用柔和、留白和内容优先的工作台布局：

- 顶栏左侧固定为“Logo → Paperin → 收起按钮”。收起侧栏时 Logo 与项目名一起隐藏，只保留展开按钮。
- 侧栏依次提供搜索、最近编辑、我的收藏、知识库文件树和设置入口。收藏使用行内星标，不再把低频动作塞入常驻工具栏。
- 正文上方保留轻路径条，区分示例文档、未命名文档、库内文件和外部文件；右侧 ContextDock 默认收敛，需要时显示大纲或关联内容。

首次启动会显示一个轻量的“项目文档”示例文件夹，其中包含“欢迎使用”等入门文档；示例不会写入用户知识库。桌面系统中从文件管理器打开 Markdown 时，Paperin 使用居中的普通应用窗口；保存已有文件会保留文件对象，不会主动移动桌面图标。
- “更多…”只呈现高频快捷动作和按任务分组的低频能力；菜单项、快捷键和命令面板共用同一套命令注册表。
- 已有磁盘路径的文件按当前编辑版本显示已保存或未保存；示例和未命名文档没有磁盘目标，顶栏与状态栏会明确提示示例或“尚未保存到磁盘”，保存时需选择路径。修改状态也会显示在标签和关闭确认中。

可交互原型位于 [`design/soft-workbench`](./design/soft-workbench/README.md)，它只用于体验布局和信息层级，不会读写真实知识库。运行 `npm run demo:soft` 可预览原型。

## 技术架构

```text
Renderer (React UI)
  → window.desktopAPI
Preload (typed narrow bridge)
  → IPC channels
Main (文件、工作区、索引、窗口、设置、导出)
Shared (DTO、状态、常量；无副作用)
```

项目使用 Electron、React 18、TypeScript strict、electron-vite、Milkdown 7、mdast/micromark、原生 CSS Variables、Vitest、Testing Library 和 electron-builder。正文状态以 Milkdown/ProseMirror 为源，应用状态与用户 Markdown 文件分开保存。

主要目录：

| 目录 | 职责 |
| --- | --- |
| `src/main/` | 文件读写、索引、窗口、设置、导出和 IPC handler |
| `src/preload/` | 唯一的 Electron 能力出口与 typed API |
| `src/renderer/src/app/` | 页面编排、会话、命令、工作区控制器 |
| `src/renderer/src/components/` | 侧栏、标签、编辑器、面板和设置视图 |
| `src/renderer/src/hooks/` | 生命周期与可复用状态逻辑 |
| `src/renderer/src/lib/` | 解析、转换、搜索和纯规则 |
| `src/shared/` | 进程间共享 DTO、状态和通道常量 |
| `docs/` | 当前设计规范、维护契约、计划、兼容矩阵和验证记录 |
| `design/soft-workbench/` | 独立 UI 原型 |

## 开发

环境要求：Node.js 20 或 22 LTS，npm，以及当前平台可运行的 Electron。安装依赖后：

```bash
npm install
npm run dev
```

常用命令：

```bash
npm run lint          # ESLint
npm run typecheck     # Renderer 与 Node 两套 TypeScript 检查
npm run test          # Vitest 全量测试
npm run build         # electron-vite 生产构建
npm run smoke         # 隔离临时目录的真实 Electron 主链路
npm run a11y          # 主题对比度与焦点轮廓门禁
npm run perf:regression
npm run demo:soft     # 仅启动柔和工作台原型
```

提交功能前应至少运行 `npm run typecheck`、`npm run test` 和 `npm run build`；涉及 UI、文件或 IPC 时追加 `npm run lint`、`npm run a11y` 和 `npm run smoke`。性能脚本使用合成临时数据，不会扫描或上传用户知识库。

## 数据与隐私

正文始终是用户拥有的本地 Markdown 文件。应用设置、标签页、草稿、最近文件、收藏和统计与正文分离；收藏按工作区路径分桶写入本机设置。应用不要求登录，不会默认上传正文，也不会把 token、绝对路径、草稿正文或用户数据写进仓库和日志。

如果未来启用远程 AI，发送范围、提供商和内容会在操作前明确展示；模型结果按不可信内容处理，不能获得执行命令、删除文件、联网或发布内容的权限。没有模型时，编辑、查找、关联和导出仍应完整可用。

## 文档导航

文档已经收敛为当前仍有用途的维护资料、设计规范和验证记录：

- [`docs/PRODUCT-STRATEGY-ROADMAP.md`](./docs/PRODUCT-STRATEGY-ROADMAP.md)：战略定位、竞品事实校正、目标用户、增长与商业验证规则。
- [`docs/README.md`](./docs/README.md)：文档入口、职责说明和按优先级整理的后续任务总表。
- [`docs/development/strategy-validation.md`](./docs/development/strategy-validation.md)：正确性、性能、复用效率、留存与增长的验收指标及采样口径。
- [`docs/REFACTOR-STATUS.md`](./docs/REFACTOR-STATUS.md)：当前 `master` 的唯一实时完成度和验证证据。
- [`docs/NEXT-UI-SPEC.md`](./docs/NEXT-UI-SPEC.md)：顶栏、侧栏、路径条、上下文面板、主题和窄窗口规范。
- [`docs/NEXT-DEVELOPMENT-PLAN.md`](./docs/NEXT-DEVELOPMENT-PLAN.md)：战略落地的 S00–S17 任务、优先级、依赖、验收、回退及旧任务映射。
- [`docs/compatibility-matrix.md`](./docs/compatibility-matrix.md)：旧能力、当前实现、测试依据和平台验证边界。
- [`docs/command-panels.md`](./docs/command-panels.md)：命令注册表、快捷键、面板插槽和低频能力入口。
- [`docs/workspace-shell.md`](./docs/workspace-shell.md)：工作区壳层、路径来源、dirty 和窄窗口交互契约。
- [`docs/system-file-open-and-close.md`](./docs/system-file-open-and-close.md)：系统文件关联、多窗口和关闭保护规则。
- [`docs/file-write-recovery.md`](./docs/file-write-recovery.md)：已有桌面文件的可恢复覆盖写入协议、恢复边界和验证范围。
- [`docs/document-tab-lifecycle.md`](./docs/document-tab-lifecycle.md) 与 [`docs/domain-model.md`](./docs/domain-model.md)：文档会话、标签生命周期和状态边界。
- [`docs/TECH-STACK.md`](./docs/TECH-STACK.md)：技术路线和替代方案评估。
- [`docs/ACCESSIBILITY-SMOKE.md`](./docs/ACCESSIBILITY-SMOKE.md)：主题可读性、焦点和人工冒烟范围。
- [`docs/development/`](./docs/development/)：性能基线、主题基线和回归脚本数据。

`docs/IMPLEMENTATION-PLAN.md` 是仓库开发门禁要求的执行手册；战略取舍以 `PRODUCT-STRATEGY-ROADMAP` 为准，新的工程工作以 `NEXT-DEVELOPMENT-PLAN` 和 `REFACTOR-STATUS` 为准，历史一次性评估不再作为当前规范。

## 当前边界与后续方向

已完成的 P0 工程增量包括已有文件的中断恢复、快照超时不写旧版本、关闭前不放行未确认内容，以及 5 MiB 保存的阶段诊断。仍需继续验证大文档编辑/保存/导出的性能与正确性、写入故障矩阵、长时间运行下的索引与 UI 性能，以及 Windows 安装包和 macOS/Linux 文件关联。三平台安装验证、真实输入法、缩放和权限异常不能用一次开发态构建替代。

产品下一步优先验证“资料找到后真的被重新用进写作”的任务闭环，再决定 AI 资料问答、发布预览和跨设备同步的投入。同步暂缓，不新增账号或云端前置条件；发布从已有导出能力开始，所有扩展都必须保留原始 Markdown 的可取回性。

## 许可证

当前仓库许可证和第三方依赖声明以仓库文件为准。发布安装包前请同时检查 `package.json`、`resources/` 和各依赖的许可证要求。
