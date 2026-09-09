# 工作区壳层

工作区壳层是 LastFileHome 的固定页面上下文。它始终显示知识库名称和路径，文件树、标签、编辑器和 ContextDock 都挂在同一个工作区内；没有打开知识库时仍保留壳层，只把状态标记为“未打开知识库”。

`WorkspaceShell` 位于 `src/renderer/src/components/WorkspaceShell/`，只负责页面结构和工作区上下文，不持有文件正文、标签或保存状态。`workspacePath` 存在时区域的 `data-workspace-state` 为 `open`，否则为 `empty`。

`CurrentFileBanner` 位于 `src/renderer/src/components/CurrentFileBanner/`，挂在编辑器宿主的标签栏之前。它由 App 根据当前会话传入标题、路径、来源和 dirty 状态：

- `workspace` 来源显示知识库名称和相对路径。
- `external` 来源显示“外部文件”和完整路径，避免把临时文件误认为知识库索引内容。
- `dirty` 同时通过“未保存”文本、颜色和 `data-dirty="true"` 表达；保存后显示“已保存”。

来源判定在 App 中完成：没有路径的演示/新文档属于当前工作区体验；有路径时，只有位于当前知识库根目录下的文件才标记为 `workspace`。组件不自行访问文件系统，也不复制编辑器正文。

组件的可访问契约包括：工作区使用 `region`/“工作区”名称，当前文件使用 `status`、`aria-live="polite"` 和包含标题、来源、保存状态的 `aria-label`。路径和标题使用省略显示，完整值保留在 `title` 属性中，窄窗口继续使用同一套布局。
