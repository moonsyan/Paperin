# Quiet Workspace Demo 审查与优化建议

## 总体判断

当前 demo 的视觉方向可以继续使用：知识库持续存在，当前文件成为焦点；顶栏收敛，正文区域保持安静。这套布局比“知识库模式 / 单文件模式”二选一更适合 MarkdownSoft 的长期产品形态。

但 demo 目前仍然偏向“展示页面”，还不能直接作为生产 UI 的结构蓝图。它需要补一层稳定的工作区模型，才能在保留旧功能的同时继续增加功能。

补充审查现有 MarkdownSoft 后发现，旧项目已经有不少可复用基础：`src/shared/workspace-state.ts`、`app-command-registry`、文件监听、保存队列、草稿恢复、版本历史、标签索引、链接索引和多种导出能力。因此新项目不应重新发明这些模块，应该把它们整理成清晰的核心层，再接入新的工作区视觉。

## 必须保留的产品能力

这些能力不能因为界面简化而被藏得太深：

- 打开文件、打开目录、最近文件和系统文件关联打开。
- 保存、另存为、重命名、移动、删除到回收站。
- 外部修改冲突、GBK/UTF-8 编码信息和不可映射字符提示。
- 多标签、未保存标记、关闭前保存确认和会话恢复。
- 工作区全文搜索、当前文档搜索、搜索结果定位。
- Markdown 往返、GFM、任务列表、表格、代码、公式、Mermaid、脚注和 frontmatter。
- 图片路径、HTML/PDF 导出、主题、快捷键和写作统计。

界面可以让低频能力退到命令面板或上下文菜单，但不能删除功能，也不能只保留一个“更多”菜单而没有搜索入口。

## Demo 现在还缺什么

### 1. Demo 没有体现现有的工作区模型

Demo 数据以 `documents` 和 `activeId` 为主，无法体现生产代码已经支持的多个工作区、文件夹展开状态、持久化布局、文件来源和磁盘状态。

建议生产模型至少拆成：

```ts
type Workspace = {
  id: string
  rootPath?: string
  label: string
  kind: 'vault' | 'loose-file'
}

type DocumentRef = {
  id: string
  path: string
  workspaceId?: string
  title: string
  isExternal: boolean
}

type OpenTab = {
  documentId: string
  dirty: boolean
  view: 'edit' | 'preview'
  lastKnownMtime?: number
}
```

`loose-file` 表示文件来源，而不是一种界面模式。它仍然可以显示在当前知识库工作台中。

迁移时应先对照已有的 `WorkspaceStateBundle`、`WorkspaceTabState` 和 `WorkspaceDocumentViewState`，避免创建第二套状态定义。

### 2. 顶栏还需要一个稳定的扩展位

现在的顶栏适合 demo，但正式版应明确三个区域：

- 左侧：侧栏开关、当前工作区名称。
- 中间：标签和当前文件状态。
- 右侧：搜索、专注、目录、更多。

搜索应当是一个一等入口，不能只依赖 `Ctrl K`。目录、导出、分享、版本历史等功能则通过命令注册表进入“更多”，避免每次新增功能都修改顶栏布局。

### 3. 文件树需要表达“当前文件来自哪里”

当前文件被选中后，文件树高亮已经足够清楚，但还需要处理：

- 外部直接打开的文件不属于当前知识库时，在文件树顶部显示一个“当前文件”临时项。
- 关闭该文件后移除临时项，知识库文件树不被污染。
- 文件重命名或移动后，标签、面包屑、收藏和最近文件同步更新。

### 4. 编辑器功能不能继续依赖 contenteditable demo

Demo 的 `contenteditable` 适合展示交互，不适合作为正式编辑器。生产实现应保持 Milkdown 作为唯一正文状态源，通过适配层暴露：

```ts
interface EditorAdapter {
  focus(): void
  getMarkdown(): string
  setMarkdown(markdown: string): void
  runCommand(command: EditorCommand): boolean
  onChange(listener: (markdown: string) => void): () => void
}
```

页面组件只调用适配层，不直接触碰 ProseMirror transaction。

## 推荐的扩展机制

### 先收敛已有实现

旧项目已经存在 `src/renderer/src/app/commands/app-command-registry.ts` 和 `src/shared/workspace-state.ts`。新版本应该优先：

- 保留现有命令 ID、快捷键冲突处理和可用性判断。
- 将现有命令注册表接到新的搜索入口、标签上下文菜单和文件树菜单。
- 把 `WorkspaceStateBundle` 作为持久化协议，UI 只新增视图字段，不在组件内另存一份布局状态。
- 将 `useWorkspaceFiles`、`useDocumentSessionPersistence`、`useDraftPersistence` 和 `document-save-queue` 组合成一个明确的 `DocumentSessionController` 外观。

### 命令注册表

把新建、打开、导出、切换主题、插入 Mermaid、切换目录等动作统一成命令对象：

```ts
type Command = {
  id: string
  label: string
  shortcut?: string
  keywords?: string[]
  isEnabled?: (context: CommandContext) => boolean
  run: (context: CommandContext) => Promise<void> | void
}
```

命令面板、顶部菜单、右键菜单和快捷键都消费同一注册表。这样新增功能不需要复制四套事件分发逻辑。

### 面板插槽

工作区可以预留稳定的区域，而不是每次新增功能都加弹窗：

- `sidebar.primary`：文件树、收藏、最近文件。
- `sidebar.secondary`：大纲、反向链接、标签。
- `editor.toolbar`：格式化和编辑器命令。
- `editor.margin`：当前文档相关信息。
- `statusbar.end`：字数、编码、保存状态。

这些插槽先作为内部 React 扩展点，等第三方插件需求真实出现后再设计公开插件 API。

## 视觉层还可以优化的地方

- 文件树和正文之间再减少一层视觉容器，避免“侧栏卡片 + 正文卡片”的后台感。
- 顶部工作区名称可以更弱，当前文件标题和保存状态应更突出。
- 当前标签建议增加未保存圆点，而不是依赖底部状态栏才知道是否保存。
- 当前 demo 的目录、关联笔记和设置仍然偏向弹窗；后续可以优先使用可折叠页边栏，减少打断写作的模态层。
- 移动窗口宽度较小时，侧栏、标签和页边目录应采用同一抽屉机制，避免三套响应式行为。

## 本轮审查补充的工程风险

### 1. 现有能力入口容易继续膨胀

旧项目已经有版本历史、图谱、标签、链接、质量检查、发布、图床、DOCX/PDF/HTML 导出等能力。如果全部作为顶层按钮加入新界面，简洁设计会很快失效。建议按“当前文件、当前工作区、应用设置”三类上下文分组，并让命令注册表作为唯一入口目录。

### 2. 索引和文件监听需要独立生命周期

文件树刷新、全文索引、标签/链接索引和外部修改监听不能由编辑器组件直接触发。它们应该由工作区服务统一管理，向 Renderer 发出可取消、可丢弃旧请求的事件。窗口关闭、切换工作区和大量文件扫描时必须验证取消行为。

### 3. 多窗口和系统打开文件要提前定规则

`window-manager` 已支持带文件创建窗口，新版本需要明确：系统双击文件是复用现有窗口、创建新窗口，还是按设置决定；同一个路径在多窗口中是否允许重复打开；关闭工作区后外部文件标签如何保留。这个规则应在状态模型和测试中固定，不能留给 UI 猜测。

### 4. 共享状态需要版本迁移

工作区布局和文档会话已经有 schema version。新版本增加标签、外部文件、面板插槽或插件数据时，必须提供显式迁移函数和损坏回退策略，不能直接改变 JSON 结构后让旧用户丢失布局或草稿。

### 5. 安全边界不能被“插件化”削弱

未来即使增加插件，也应先提供受限的命令和面板扩展；插件不得获得通用 IPC、任意文件路径或图床 token。自定义 CSS、Markdown HTML、图片协议和导出打印窗口继续沿用现有白名单与信任路径规则。

### 6. 性能预算需要写进设计验收

文件树、搜索结果、标签列表和反向链接必须设数量上限或虚拟化策略；编辑器输入期间不能同步刷新全文索引。建议记录大工作区基线，例如 5,000 个 Markdown 文件、单文件 5 MB、同时打开 20 个标签时的首次打开、搜索和保存耗时。

### 7. 可访问性和输入法要作为核心回归项

新的简洁界面不能只依赖图标。侧栏、标签、命令面板、页边栏和弹窗都需要完整的键盘焦点顺序、中文输入法组合态、Escape 关闭和焦点恢复测试。现有快捷键测试应迁移到新布局，而不是只做鼠标冒烟。

## 建议的实施顺序

1. 先盘点并复用现有 `WorkspaceStateBundle`、命令注册表、保存队列、草稿恢复和索引服务，不改视觉。
2. 抽出 `DocumentSessionController` 和 `EditorAdapter`，补齐外部文件、多窗口和冲突规则。
3. 将搜索、导出、设置、快捷键、大纲、标签和链接接入命令与面板插槽。
4. 为索引、监听、schema migration、性能和输入法补齐回归测试。
5. 最后迁移 quiet-workspace 的视觉细节，再评估受限插件扩展。

这个顺序能让简洁界面与旧功能同时保住，也避免为了扩展性提前引入全局状态库或公开插件协议。
