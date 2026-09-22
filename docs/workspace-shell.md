# 工作区壳层

工作区壳层是 Paperin 的固定页面上下文。文件树、标签、编辑器和 ContextDock 都挂在同一个工作区内；名称和路径按侧栏、路径条及窄窗状态显示或保留可访问信息，不要求两者始终重复展示。没有打开知识库时仍保留壳层，状态为“未打开知识库”。

`WorkspaceShell` 位于 `src/renderer/src/components/WorkspaceShell/`，只负责页面结构和工作区上下文，不持有文件正文、标签或保存状态。`workspacePath` 存在时区域的 `data-workspace-state` 为 `open`，否则为 `empty`。

`CurrentFileBanner` 位于 `src/renderer/src/components/CurrentFileBanner/`，挂在编辑器宿主的标签栏之前。它由 App 根据当前会话传入标题、路径、来源和 dirty 状态：

- `workspace` 来源显示知识库名称和相对路径。
- `external` 来源显示“外部文件”和完整路径，避免把临时文件误认为知识库索引内容。
- `dirty` 同时通过文本、颜色和 `data-dirty="true"` 表达；只有磁盘确认当前版本后显示“已保存”，未命名/示例沿用下述存储身份语义。

来源判定在 App 中完成：没有路径的演示/新文档属于当前工作区体验；有路径时，只有位于当前知识库根目录下的文件才标记为 `workspace`。组件不自行访问文件系统，也不复制编辑器正文。

组件的可访问契约包括：工作区使用 `region`/“工作区”名称，当前文件使用 `status`、`aria-live="polite"` 和包含标题、来源、保存状态的 `aria-label`。当前文件顶栏附 `data-storage-kind=disk|demo|unnamed`，保存语义与状态栏共用 `lib/document-save-status.ts`。有磁盘路径且当前版本已落盘时显示“已保存”；示例和未命名不会显示成已落盘。保存进行中、外部冲突、编码无法保存和保存失败会盖过这两句。路径和标题使用省略显示，完整值保留在 `title` 属性中。

## 窄窗口与键盘

桌面窗口宽度低于 820px 时，文件侧栏改为覆盖正文的抽屉，正文宽度不再因侧栏而缩小；侧栏切换按钮通过 `aria-controls="workspace-file-sidebar"` 关联这个具名的互补区域。折叠的侧栏保留树的滚动与重命名状态，但会被设为 `inert`，不会接收键盘焦点。

标签页可通过菜单键或 `Shift+F10` 打开上下文菜单。菜单接管键盘焦点；按 `Escape` 后焦点返回触发它的标签。菜单项使用原生禁用状态，不能执行的“关闭其他/全部”操作不会响应。

## 来源与索引上下文（待补齐）

当前质量面板使用工作区共享来源快照，并非当前文章独立清单。P1-06/07 将补齐异步工作区隔离、逐篇基线与明确范围；P0-07/P1-08 将补齐目标变化和索引释放。实现前保持现有说明，不新增虚假的“已复核”状态。布局和功能待办见 [UI 规范](UI-INTERACTION-SPEC.md)，实际通过范围见 [项目状态](PROJECT-STATUS.md)。
