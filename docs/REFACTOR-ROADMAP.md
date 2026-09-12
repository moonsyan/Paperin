# LastFileHome 重构路线

> 本文保留初始阶段划分。2026-09-12 的下一步执行顺序见 [NEXT-DEVELOPMENT-PLAN](NEXT-DEVELOPMENT-PLAN.md)，当前完成度以 [REFACTOR-STATUS](REFACTOR-STATUS.md) 为准；已落地的壳层、命令与主题不重复迁移。

## Phase 0：基线冻结

- 把当前项目的文件打开、保存、另存为、外部修改冲突和编码处理列为回归清单。
- 将 `design/quiet-workspace` 作为视觉参考，不直接把 demo 的静态状态当成生产实现。
- 记录现有 IPC 通道、设置结构和 Markdown 扩展清单。

## Phase 1：核心模型

- 建立 `Workspace`, `DocumentRef`, `OpenTab`, `DocumentSnapshot` 和统一错误码 DTO。
- 把文件服务拆成打开、读取、保存、另存为、移动、回收站删除和搜索几个边界明确的能力。
- 为 UTF-8、GBK、中文路径、大文件和外部修改补齐单元测试。

## Phase 2：工作区壳层

- 先实现知识库工作区：左侧文件树、搜索、最近文件、收藏和当前标签。
- “打开单个文件”只创建一个当前文件标签，并保留工作区壳层；没有第二套页面状态。
- 用命令面板承载低频操作，顶部只保留当前文件和少量高频动作。

## Phase 3：编辑器适配层

- 为 Milkdown 建立 `EditorAdapter`，由它负责初始化、读取内容、写入内容和命令调用。
- 保存协调器负责 debounce、`expectedMtime`、冲突提示和编码损失提示。
- 验证 Markdown 往返：GFM、表格、任务列表、代码块、公式、Mermaid、脚注和 frontmatter。

## Phase 4：主题和交互

- 将 quiet-workspace 的 CSS 变量映射到正式主题 token。
- 逐个验证浅色、深色和小窗口布局，补充键盘导航、焦点恢复和无障碍名称。
- 再实现设置、导出、最近文件和会话恢复，避免把所有功能一次塞回顶部菜单。

## Phase 5：发布验证

- Windows、macOS、Linux 分别验证启动、打开文件、保存、导出和更新检查。
- 运行 `npm run test`、`npm run build` 和 Electron 冒烟脚本。
- 确认发布产物不包含草稿、用户路径、token 和开发环境文件。

## 完成标准

重构完成的标志不是页面看起来更简洁，而是用户可以从知识库浏览到任意文件，也可以从系统直接打开一个 Markdown 文件，同时始终拥有一致的标签、保存状态、搜索和编辑体验。
