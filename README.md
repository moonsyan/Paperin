# Paperin

Paperin 是一个本地优先的个人 Markdown 知识工作台。核心任务是：**打开资料 → 用来源写一段技术说明**——收下资料，写出理解，带来源交付。

Paperin 是项目统一产品名称，工作区状态写入 `.paperin`，应用设置和缓存沿用 Electron 的 Paperin 用户数据目录。

当前为 **0.7.0 私有种子验证候选**。代码能力、自动门禁、安装验证与真人任务分别计分，最新结果见 [项目状态](docs/PROJECT-STATUS.md)。本轮文档已按代码核对；来源异步隔离、逐篇来源基线、索引失效、缓存校验和有界搜索语料仍是待实施任务。

## 产品方向

产品面向需要长期积累资料、写作和管理个人项目的用户。核心闭环是：

```text
打开资料 → 用来源写一段技术说明 → 保存重开 → 导出成果
```

设计原则是“安静写作，随时复用”。默认页面突出当前文档，低频操作集中到“更多”、命令面板和上下文面板；知识库、文件树、标签、反向链接和图谱仍然可用，但不会同时抢占正文的注意力。

当前阶段保持免费，优先把本地写作、资料复用和可靠性做好。默认不启用账号和云同步。HTML 资源包发布、来源变化提示和交付报告已经在本地实现；远程 AI、账号同步和跨设备服务仍未做，也不把研究方案当成已上线功能。

## 当前能力

- 本地知识库：打开文件夹后，文件树、标签、标签页、编辑器和辅助面板共享同一个工作区上下文。
- Markdown 写作：Milkdown/ProseMirror 编辑器支持 GFM、任务列表、表格、代码、公式、Mermaid、脚注和 frontmatter。从其他软件复制 Markdown 原文时，会按标题、列表和强调排版，不会因为剪贴板附带的 HTML 变成纯文本。网页里的标题和强调仍会转成 Markdown。剪贴板 HTML 只解析，不执行脚本，也不去加载里面的图片。
- JSON 与 YAML 代码块可以在块内格式化或压成一行。jsonc 会去掉注释后再整理，不支持尾逗号。YAML 排齐时保留注释，压成一行时注释不会留下。有缩进的代码块可以折叠其中一段，折叠不改文件里的文字。复制和导出时去掉这些按钮，被折叠的代码仍在结果里。
- Mermaid 图在渲染前会去掉共同缩进、零宽字符、误带的代码围栏，以及会改全局样式的 init 指令，不写回文件。主题样式里的 `error-icon`，或节点文字里的 Syntax error，都不会把图判失败。画不出来时可以切回源码再看图表。
- 文件可靠性：新建、打开、保存、另存为、重命名、移动、回收站删除、外部修改冲突和多种编码处理；已有文件覆盖写入保留可恢复的确认版本。路径在授权后被换成链接时，读取、保存、版本历史、图片显示和样式导入都不会跟着访问链接目标。
- 文档会话：多标签、固定标签、dirty 状态、草稿恢复、关闭确认和外部 Markdown 文件统一走同一套会话模型。
- 找回与复用：快速打开、工作区全文搜索、当前文档查找替换、最近编辑、收藏、标签、Wiki 链接、反向链接和关系图谱。工作区搜索命中后可「插入引用」，保存重开后引用仍在，并可导出 HTML 资源包。插入成功后记下该来源当时的修改时间；质量面板会提示来源已变化、来源缺失或索引未完成。来源被移动或改名时不自动改正文链接，只提供重新定位和打开搜索。
- 收藏闭环：文件树、最近编辑和“我的收藏”都可点击星标收藏/取消；收藏按知识库保存在本机，重启后恢复。
- 辅助工具：大纲、属性、链接、标签、质量检查、写作统计、版本历史和图片管理按需打开。
- 输出：HTML、PDF、DOCX、EPUB、LaTeX、Pandoc 等导出入口保留在菜单、命令面板和文档操作中。导出 Markdown、HTML、PDF、Word 或 Pandoc 前会检查空图片、不安全链接和缺失的本地目标；未完成任务只提醒，不会被删掉。发布对话框可保存最多 20 条模板与范围配置；HTML 资源包同时写出 `reports/paperin-delivery-report.json`，其中不含正文、绝对路径或搜索词。取消导出不会改动原文件。各格式能保证什么，见 [导出支持范围](docs/export-formats.md)。
- 外观：九套主题、字体与字号设置、雾白/夜松的柔和工作台样式、窄窗口抽屉和键盘焦点恢复。
- 安全边界：Renderer 只通过 typed `window.desktopAPI` 访问文件和设置；路径信任、图片协议、CSP 和 IPC 参数均由主进程校验。

## 界面原则

来源健康当前是全工作区共用的最多 50 条修改时间记录；重复引用同一来源会更新共享基线，不是每篇文章独立的来源关系。重新定位按钮目前打开搜索，尚不完成关系迁移。索引未完成或外部目标变化后的提示不能作为全部已核验的证明；逐篇复核与准确失效按 [实施计划](docs/superpowers/plans/2026-09-22-product-workflow-implementation.md)完善。

生产界面采用柔和、留白和内容优先的工作台布局：

- 顶栏左侧固定为“Logo → Paperin → 收起按钮”。收起侧栏时 Logo 与项目名一起隐藏，只保留展开按钮。
- 侧栏依次提供搜索、最近编辑、我的收藏、知识库文件树和设置入口。收藏使用行内星标，不再把低频动作塞入常驻工具栏。
- 正文上方保留轻路径条，区分示例文档、未命名文档、库内文件和外部文件；右侧 ContextDock 默认收敛，需要时显示大纲或关联内容。

首次启动会显示合成「示例任务 / 资料来源」文件夹（旧笔记、技术说明草稿与可引用来源），并完成一篇欢迎引导；**示例不会写入**你打开的知识库。关闭全部标签会出现开始页，引导打开/继续资料，并说明命令面板模板与「插入引用」入口。桌面系统中从文件管理器打开 Markdown 时，Paperin 使用居中的普通应用窗口；保存已有文件会保留文件对象，不会主动移动桌面图标。
- “更多…”只呈现高频快捷动作和按任务分组的低频能力；菜单项、快捷键和命令面板共用同一套命令注册表。
- 命令面板可以新建技术文章和决策记录。这两份模板只是普通 Markdown，不会覆盖已打开的文件，也不要求署名。
- 工作区搜索按当前知识库的 Markdown 查找。普通关键词会把文件名和标题排在正文前面，并标明相对目录。匹配达到 200 条和没有扫完是两件不同的事，没扫到不能当成没有结果。
- 工作区搜索和反链都可以把来源片段插入当前文章。片段是插入当时的快照，标题行会带普通 Markdown 锚点，不会改来源文件。从搜索插入后回到打开搜索时的位置，可用撤销收回。换成另一篇后再插入会被拒绝。
- 再次打开同一知识库时，会填回上次的搜索词，搜索框里也能看到最近引用的库内路径。这些导航记录可以清除，不会删正文。阅读位置随文档视图保存。打开后若索引没扫完、附件缺失或链接对不上，只给出说明，不改原文件。和现有 Markdown 工具一起用，见 [共存说明](docs/coexistence.md)。

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

## 开发

环境要求：Node.js 22 LTS、npm，以及当前平台可运行的 Electron。安装依赖后：

```bash
npm ci
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
```

常规提交至少运行 `npm run lint`、`npm run typecheck`、`npm run test` 和 `npm run build`；UI 变更追加 `npm run a11y`，UI、文件、IPC、编辑器或打包变更追加 `npm run smoke`。性能任务单独运行 `npm run perf:regression` 和 `npm run perf:production`，不与构建争抢资源。性能脚本使用合成临时数据，不会扫描或上传用户知识库。

## 数据与隐私

正文始终是用户拥有的本地 Markdown 文件。应用设置、标签页、草稿、最近文件、收藏和统计与正文分离；收藏按工作区路径分桶写入本机设置。应用不要求登录，不会默认上传正文，也不会把 token、绝对路径、草稿正文或用户数据写进仓库和日志。

知识库内 `.paperin` 保存布局、阅读位置、搜索词、最近引用、来源时间记录和发布配置；这些是本地私有状态，不能随文档提交到仓库。索引缓存位于应用数据目录，可能包含本地路径、标题等派生信息。保存恢复 backup 含旧正文、临时文件含待保存正文，journal 只含恢复元数据；删除 `.paperin` 不删正文，但会丢失上述库状态。完整位置与边界见 [隐私说明](PRIVACY.md)。

生产环境默认会通过 `electron-updater` 检查更新、自动下载，并在退出时安装已下载的包；开发环境永不检查。设置 → 高级里的「自动检查更新」同时控制这三步，关闭后下次启动不再联系更新服务器，也不会在退出时安装此前已下载的包。该过程不上传 Markdown 正文。图片默认保存为本地附件；只有用户主动配置并选择 SM.MS 图床后，粘贴或拖入的图片才会发送到 SM.MS。Token 只存主进程，经操作系统安全存储（Windows 为 DPAPI）加密；渲染进程只能看到是否已配置，拿不到明文。旧明文 token 会在加密写入成功后删除；加密失败时禁用远程上传并保留明文，安全存储不可用时回退本地附件。拼写检查默认关闭；用户打开后 Electron 可能下载对应语言词典，不上传正文。联网范围、数据位置和可选上传见 [PRIVACY.md](PRIVACY.md)。

如果未来启用远程 AI，发送范围、提供商和内容会在操作前明确展示；模型结果按不可信内容处理，不能获得执行命令、删除文件、联网或发布内容的权限。没有模型时，编辑、查找、关联和导出仍应完整可用。

## 文档导航

本轮战略审查与后续执行入口：

- [2026-09-22 产品战略发展报告](docs/PRODUCT-STRATEGY-REVIEW-2026-09-22.md)：基于当前代码与战略审查日证据（性能/审计为当日快照；文档同步复验见项目状态）的产品现状、竞品定位、阶段路线、商业化和团队/企业进入条件。
- [产品整体工作流](docs/PRODUCT-WORKFLOW.md)：从发现安装、资料写作、保存恢复到交付维护的端到端产品契约。
- [按优先级排列的完整实施计划](docs/superpowers/plans/2026-09-22-product-workflow-implementation.md)：先处理搜索性能、发布身份、安装和恢复，再进入用户验证、个人专业版和团队/企业条件任务。
- [当前项目状态](docs/PROJECT-STATUS.md)：当前代码能力、新鲜门禁结果、红灯、未验证范围和执行顺序。
- [文档维护与全量核对](docs/development/documentation-maintenance.md)：事实来源、全量文档覆盖及当前/计划/历史的区分规则。

文档已经收敛为当前仍有用途的维护资料、设计规范和验证记录：

- [`docs/README.md`](./docs/README.md)：文档入口。完成度不在这里重复抄表。
- [`docs/coexistence.md`](./docs/coexistence.md)：和现有 Markdown 工具、以及导出副本怎么一起用。
- [`docs/getting-started.md`](./docs/getting-started.md)：首次打开「欢迎使用.md」时的分模块入门，与应用内正文相同。
- [`docs/export-formats.md`](./docs/export-formats.md)：各导出格式实际检查什么。
- [`docs/development/strategy-validation.md`](./docs/development/strategy-validation.md)：正确性、性能、复用效率、留存与增长的验收指标及采样口径。
- [`docs/PROJECT-STATUS.md`](./docs/PROJECT-STATUS.md)：当前唯一的项目状态与门禁记录。
- [`docs/UI-INTERACTION-SPEC.md`](./docs/UI-INTERACTION-SPEC.md)：顶栏、侧栏、路径条、上下文面板、主题和窄窗口规范。
- [`docs/compatibility-matrix.md`](./docs/compatibility-matrix.md)：旧能力、当前实现、测试依据和平台验证边界。
- [`docs/command-panels.md`](./docs/command-panels.md)：命令注册表、快捷键、面板插槽和低频能力入口。
- [`docs/workspace-shell.md`](./docs/workspace-shell.md)：工作区壳层、路径来源、dirty 和窄窗口交互契约。
- [`docs/system-file-open-and-close.md`](./docs/system-file-open-and-close.md)：系统文件关联、多窗口和关闭保护规则。
- [`docs/file-write-recovery.md`](./docs/file-write-recovery.md)：已有桌面文件的可恢复覆盖写入协议、恢复边界和验证范围。
- [`docs/document-tab-lifecycle.md`](./docs/document-tab-lifecycle.md) 与 [`docs/domain-model.md`](./docs/domain-model.md)：文档会话、标签生命周期和状态边界。
- [`docs/TECH-STACK.md`](./docs/TECH-STACK.md)：技术路线和替代方案评估。
- [`docs/ACCESSIBILITY-SMOKE.md`](./docs/ACCESSIBILITY-SMOKE.md)：主题可读性、焦点和人工冒烟范围。
- [`docs/development/`](./docs/development/)：性能基线、主题基线和回归脚本数据。

`docs/IMPLEMENTATION-PLAN.md` 是稳定开发入口，详细任务以 2026-09-22 产品工作流实施计划为准。被替代的审计和计划由 Git 历史保留，不在当前树重复维护。

## 当前边界与后续方向

已有工程能力包括已有文件的中断恢复、快照超时不写旧版本、关闭前不放行未确认内容、来源修改时间提示、可复用发布配置和脱敏交付报告。工作区路径授权与 Electron smoke 已通过；最近一次性能测量（2026-09-22 战略审查日，文档同步未重跑）中，5000 篇合成索引/搜索和生产搜索均超阈值，当前不得宣称大型库性能达标。Windows 安装/升级/卸载循环、8 小时稳定性和第二台设备仍为 **UNVERIFIED**。三平台安装验证、真实输入法、缩放和权限异常不能用一次开发态构建替代。

产品下一步先定位并修复搜索性能红灯，再完成 Windows 安装态验收；GitHub `moonsyan/Paperin` 已与 `package.json` 和 CI 发布门禁对齐，日常推送仍可走 Gitee `origin`，GitHub Draft 可达性尚未在本机验证。两位现有用户研究可同步准备，但不能替代这些发行证据。远程 AI 资料问答和跨设备同步仍不做；同步不新增账号或云端前置条件。发布从已有本地导出和交付报告开始，所有扩展都必须保留原始 Markdown 的可取回性。

研究顺序为两人种子观察 → 6–8 人 Alpha 发现轮 → 12 位新用户 U01/U02 确认轮 → 两批各至少 20 人 W2/W4 队列 → 条件成立后的人工付款实验。来源/索引/缓存正确性任务可提前修复，Alpha 前通过；没有样本时保持未验证。

## 许可证、隐私与安全

- 源码许可：[LICENSE](LICENSE)（MIT，版权所有者为 `package.json` 的 `author`：ming）
- 第三方与 Electron/Chromium：[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)
- 联网与数据位置：[PRIVACY.md](PRIVACY.md)
- 安全报告：[SECURITY.md](SECURITY.md)

用户 Markdown 始终是本地文件。应用设置、草稿、最近文件和统计与正文分开存放。生产环境默认检查更新、自动下载并在退出时安装；可在设置中关闭，下次启动生效。SM.MS 与拼写词典均为可选联网。卸载是否保留用户知识库文件夹尚未在隔离环境验证。
