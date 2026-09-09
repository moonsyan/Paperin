# LastFileHome 重构实施计划

> 本文是新项目的执行手册。每个任务都必须形成可运行、可测试、可回退的独立增量；执行前先阅读根目录 `AGENTS.md`。

**目标：** 在保留 MarkdownSoft 现有文件、编辑器、搜索、导出、会话和安全能力的前提下，重建一个以知识库为默认上下文、当前文件为焦点、可持续扩展的本地优先 Markdown 工作台。

**架构：** 沿用 Electron 三进程模型。Renderer 只通过窄化的 `window.desktopAPI` 调用能力；Main 负责文件、索引、窗口、设置和导出；Shared 只放无副作用 DTO、状态和通道常量。知识库不是模式切换，而是所有文档打开行为的工作区上下文。

**技术栈：** Electron、React、TypeScript strict、electron-vite、Milkdown/ProseMirror、mdast/micromark、原生 CSS Variables、Vitest、Testing Library、electron-builder。

**依据：** `docs/TECH-STACK.md`、`docs/DEMO-AUDIT.md`、`design/quiet-workspace/` 和旧项目 `src/` 中已有实现。

## 全局门禁

- 每个功能先补测试，再写最小实现；测试不能只验证实现细节，必须验证用户行为或跨模块契约。
- 每个功能完成时同步更新用户文档、维护文档、快捷键说明或错误码说明中受影响的部分。
- 每个任务结束必须通过 `npm run typecheck`、相关 Vitest 测试和 `npm run build`；涉及 UI、Electron、文件或 IPC 时还要完成开发环境冒烟。
- 不允许在 Renderer 导入 `electron`、Node 内置模块、`fs`、`path` 或通用 IPC。
- 新 IPC 必须按“共享通道常量 → Main handler → preload API → `api.d.ts` → Renderer 调用 → 测试”顺序完成。
- 文件写入必须携带 `expectedMtime`；遇到 `CONFLICT`、`ENCODING_LOSS` 或取消都要保留用户内容并给出明确结果。
- 新增目录、标签、链接、历史、插件和导出功能必须接入现有状态和命令边界，不创建平行的隐式全局状态。

## 文件拆分门禁

- 单个 `.ts/.tsx` 文件超过 300 行时必须在当前任务中评估拆分；超过 450 行不得继续增加功能，必须先拆分。
- React 组件超过 250 行、包含超过 3 个独立异步流程或拥有超过 8 个互不相关状态时，拆成子组件或 hook。
- 一个文件只能有一个主要职责；类型、纯函数、IPC handler、React 视图和副作用不得长期混在一起。
- 拆分按业务边界命名，例如 `document-save-queue.ts`、`workspace-search-service.ts`、`useDocumentTabs.ts`，禁止使用 `utils2.ts`、`helpers-new.ts` 等无语义名称。
- 每次拆分必须保留原有测试并补充新模块的直接测试；目录重组必须更新 import、测试路径和维护文档。
- 允许在任何阶段重新组织目录，但必须先写出新的职责边界，再移动代码，最后执行全量类型检查和测试。

## 阶段 0：冻结基线

### 目标

建立旧项目行为清单和新项目空壳，防止视觉重构时丢失已有能力。

### 文件

- 参考：旧项目 `src/main/`、`src/preload/`、`src/shared/`、`src/renderer/src/`
- 修改：`README.md`、`docs/TECH-STACK.md`、`docs/DEMO-AUDIT.md`
- 新增：`docs/compatibility-matrix.md`

### 步骤

- [ ] 列出打开、保存、另存为、重命名、移动、回收站删除、外部修改、GBK/UTF-8、草稿恢复、多窗口和关闭确认场景。
- [ ] 列出 Milkdown 语法、搜索、标签、链接、历史、图片、HTML/PDF/DOCX/Pandoc 导出场景。
- [ ] 为每个场景标记现有测试、缺失测试和手工验证方式。
- [ ] 把 `design/quiet-workspace` 标为视觉参考，不把静态 demo 数据当成生产数据模型。

### 验收

- `docs/compatibility-matrix.md` 覆盖所有现有用户可感知能力。
- 基线命令 `npm run typecheck`、`npm run test`、`npm run build` 可执行并记录结果。

## 阶段 1：共享领域模型

### 目标

复用并收敛已有 `WorkspaceStateBundle`，明确工作区、文档、标签、会话和磁盘状态。

### 文件

- 复用：`src/shared/workspace-state.ts`、`src/shared/workspace-index.ts`
- 整理：`src/renderer/src/app/workspace/types.ts`、`src/renderer/src/app/document-session/`
- 测试：对应 `.test.ts`
- 文档：`docs/domain-model.md`

### 交付接口

```ts
type DocumentSource = 'workspace' | 'external'

interface DocumentRef {
  id: string
  path: string
  workspaceId?: string
  source: DocumentSource
  title: string
}

interface DocumentSession {
  ref: DocumentRef
  content: string
  savedContent: string
  dirty: boolean
  encoding: 'utf8' | 'gbk'
  expectedMtime?: number
}
```

### 步骤

- [ ] 先为路径规范化、外部文件识别、dirty 计算、标签迁移和 schema 版本迁移补测试。
- [ ] 将现有 workspace state 类型与文档会话类型分开，避免布局字段进入正文模型。
- [ ] 为旧 JSON 增加显式迁移函数和损坏回退测试。
- [ ] 为外部文件建立临时工作区引用，关闭标签后不写入知识库文件树。

## 阶段 2：文档会话与编辑器适配

### 目标

让 Milkdown 成为唯一正文状态源，统一保存、草稿、冲突、编码和恢复流程。

### 文件

- 新增：`src/renderer/src/app/document-session/document-session-controller.ts`
- 新增：`src/renderer/src/components/Editor/editor-adapter.ts`
- 复用：`useWorkspaceFiles.ts`、`document-save-queue.ts`、`useDraftPersistence.ts`
- 测试：`document-session-controller.test.ts`、`editor-adapter.test.ts`

### 交付接口

```ts
interface EditorAdapter {
  focus(): void
  getMarkdown(): string
  setMarkdown(markdown: string): void
  runCommand(command: EditorCommand): boolean
  subscribe(listener: (markdown: string) => void): () => void
}
```

### 验收场景

- 输入、撤销、重做、切换标签后内容不串文档。
- 保存冲突不会覆盖外部内容。
- GBK 文件遇到不可映射字符时不会静默丢失。
- 草稿恢复前校验 mtime，恢复后可继续保存。
- 组件卸载时取消监听、定时器和未完成请求。

## 阶段 3：工作区壳层与打开规则

### 目标

实现“知识库始终在场、当前文件成为焦点”的工作台。

### 文件

- 重构：`App.tsx`、`app/workspace/`、`components/TabBar/`
- 新增：`components/WorkspaceShell/`、`components/CurrentFileBanner/`
- 样式：`styles/components/workspace-shell.css`、`tabbar.css`、`sidebar.css`
- 测试：工作区、标签、单文件打开、多窗口和焦点恢复测试

### 打开规则

- 打开目录：创建或恢复一个知识库工作区。
- 双击文件：在当前工作区打开；不属于工作区时创建外部临时项。
- 系统文件关联打开：复用现有窗口或按设置创建窗口，规则必须固定并测试。
- 同一路径重复打开：聚焦已有标签，不创建重复会话。
- 关闭外部文件：移除临时项，但不修改知识库索引。

### UI 验收

- 顶栏只保留工作区上下文、标签、搜索、专注、目录和更多。
- 文件树、当前标签、面包屑和标题指向同一个文档。
- 未保存状态在标签、关闭确认和底部状态中保持一致。
- 小窗口使用同一套抽屉逻辑处理侧栏和目录。

## 阶段 4：命令、搜索和面板插槽

### 目标

让新增功能通过命令和面板扩展，而不是不断增加顶栏按钮或修改巨型组件。

### 文件

- 复用：`app/commands/app-command-registry.ts`、`lib/command-palette.ts`
- 新增：`app/commands/command-context.ts`、`app/panels/panel-registry.ts`
- 测试：命令可用性、快捷键冲突、权限上下文、面板切换和焦点恢复

### 命令要求

- 每个命令有稳定 `id`、中文 label、关键词、快捷键和可用性判断。
- 命令面板、菜单、右键菜单和快捷键只调用注册表，不重复写业务逻辑。
- 命令必须区分当前文档、当前工作区和应用级上下文。

### 面板插槽

- `sidebar.primary`：文件、最近、收藏。
- `sidebar.secondary`：大纲、反向链接、标签、质量检查。
- `editor.margin`：属性、关联笔记、版本信息。
- `statusbar.end`：字数、编码、保存状态。

## 阶段 5：索引、监听与性能

### 目标

在大知识库下保持可用，并确保索引和文件监听不会干扰输入。

### 验收基线

- 5,000 个 Markdown 文件：首次扫描、增量扫描和搜索有可记录耗时。
- 单文件 5 MB：打开、编辑、保存和导出不阻塞界面。
- 同时打开 20 个标签：切换不丢内容，关闭释放监听和缓存。
- 输入期间不触发同步全文索引；索引请求可取消并丢弃过时结果。

### 测试

- workspace index、file watcher、latest request、search guard 和超限行为。
- 文件删除、重命名、移动和外部修改事件的顺序测试。

## 阶段 6：功能迁移

按以下顺序迁移，保持每项独立可回退：

- [ ] 最近文件、收藏、标签和链接。
- [ ] 当前文档查找/替换与工作区全文搜索。
- [ ] 图片导入、附件目录、图片协议和图床配置。
- [ ] HTML、PDF、DOCX、Pandoc 和导出包。
- [ ] 版本历史、差异查看和草稿恢复。
- [ ] Mermaid、数学、代码高亮、脚注、frontmatter、表格和任务列表。
- [ ] 主题、字体、字号、Typewriter、快捷键和窗口布局。
- [ ] 图谱、质量检查、发布和其他低频能力。

每一项必须同时更新：组件、命令、IPC/API（如需要）、测试、用户文档和回归矩阵。

## 阶段 7：发布与质量门禁

### 必须执行

```bash
npm run typecheck
npm run test
npm run build
npm run smoke
```

触及打包、主进程、窗口或平台行为时还要执行目标平台安装包启动验证。UI、编辑器、文件操作或 IPC 变更必须启动开发环境进行人工冒烟。

### 发布前清单

- 三平台启动、打开文件、保存、另存为、导出通过。
- 无未处理的 `CONFLICT`、`ENCODING_LOSS`、取消和权限失败分支。
- 全部内置主题检查文本、边框、禁用、悬停和焦点状态。
- 不提交 `node_modules`、`out`、`release`、token、用户路径、草稿正文和日志。
- 文档、快捷键、错误码、目录职责和版本迁移说明已同步。
