# LastFileHome 重构设计

## 目标

将 `mkEditor` 迁移为 LastFileHome 的可运行基线，保持现有 Markdown 编辑、文件操作、工作区、搜索、导出、历史、草稿和安全能力，同时把知识库工作区作为所有文档打开行为的统一上下文。

## 架构

继续使用 Electron 三进程模型：Renderer 仅调用窄化的 `window.desktopAPI`，Preload 负责类型化 IPC 桥接，Main 负责文件、索引、窗口、设置和导出，Shared 只放无副作用 DTO、状态和通道常量。迁移按阶段执行，先复制可运行基线，再收敛共享领域模型与文档会话，最后替换工作区壳层和面板布局。

## 第一批交付

1. 从旧项目复制可运行源码、配置和资源，不复制构建产物或用户数据。
2. 建立兼容矩阵，记录用户能力、已有测试和后续人工冒烟入口。
3. 在 Shared 增加 `DocumentRef`、`DocumentSession`、来源类型和显式解析/迁移函数；保留旧 `WorkspaceStateBundle` 的兼容解析。
4. 为新模型补纯函数测试和 schema 损坏回退测试。

## 约束

- Renderer 不得导入 Electron、Node 内置模块或通用 IPC。
- 文件写入继续携带 `expectedMtime`，冲突和编码损失不得静默覆盖或丢弃内容。
- 新增模型必须是纯 TypeScript，不能依赖 React、DOM 或 Electron。
- 第一批不改 UI 视觉和不重写索引协议，保证可回退。

## 验收

`npm run typecheck`、`npm run test`、`npm run build` 在 LastFileHome 通过；兼容矩阵覆盖旧项目 README 中的用户可感知能力；新模型测试覆盖正常、中文、外部文件、dirty 计算、路径迁移和损坏状态回退。
