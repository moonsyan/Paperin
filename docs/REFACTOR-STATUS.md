# LastFileHome 重构进度

更新时间：2026-09-10

本文记录当前 `LastFileHome` 分支的实际重构状态。状态以代码、测试和提交记录为准；规划文档中的目标不会自动视为已完成。

## 总体状态

项目已经从空壳进入可运行的 Electron 重构基线。旧项目 `mkEditor` 的主要能力已迁入，新工作区上下文、当前文件状态、命令上下文和面板扩展边界已经开始接入。当前仍处于“增量迁移”阶段，尚未完成完整 UI 替换和所有功能的统一会话模型迁移。

## 已完成

### 基线与工程结构

- 从 `D:\project\mkEditor` 迁入 `src/`、`resources/`、`scripts/`、Electron/Vite/TypeScript/Vitest 配置和锁文件。
- 未迁入 `out/`、`release/`、用户数据或日志；`.gitignore` 已忽略构建产物和 Superpowers 工作目录。
- 保留 Electron 三进程边界：Renderer → `window.desktopAPI` → Preload → IPC → Main。
- 建立旧能力、测试依据和后续验证入口的[兼容矩阵](./compatibility-matrix.md)。

### 共享领域模型

- 新增 `src/shared/document-session.ts`，定义 `DocumentRef`、`DocumentSession`、工作区/外部文件来源和文件编码联合类型。
- 支持 UTF-8、UTF-8 BOM、UTF-16LE、UTF-16BE、GBK。
- 已覆盖文档创建、dirty 计算、保存基线、mtime、路径迁移、中文路径和外部文件测试。
- 已修复异步保存竞态：保存完成时保留保存开始后产生的新编辑，不用旧快照覆盖正文。
- `useDocumentState` 已改用单一 `DocumentRecord` store；`contents`、`savedMap`、mtime 和 encoding 仅作为兼容投影，不再分别持有 React 状态。
- 已补充 `docs/domain-model.md` 和 `docs/session-refactor.md`。

### 文档会话与编辑器边界

- 新增 `document-session-controller.ts`，为会话更新、保存确认和路径迁移提供窄化控制器测试边界。
- 真实 Milkdown 组件已实现 `EditorAdapter`：通过稳定语义命令、Markdown 读写、聚焦和订阅提供窄化入口；卸载时会清理全部订阅。
- Milkdown 专属命令键只保留在扩展 `EditorHandle` 内，应用通用命令不再直接依赖 Milkdown 命令对象。
- 现有 Milkdown/ProseMirror 仍然是正文真实状态源。

### 工作区壳层

- 新增 `WorkspaceShell`：始终呈现知识库名称、路径和空工作区状态。
- 新增 `CurrentFileBanner`：呈现当前文件标题、路径、工作区/外部来源和已保存/未保存状态。
- 已接入 `App.tsx`、主样式和无障碍属性；外部文件不会被误标为工作区文件。
- 已补充 Testing Library 测试和 `docs/workspace-shell.md`。

### 命令中心与面板插槽

- 新增 `CommandContext`，区分应用、工作区和当前文档作用域。
- 扩展 `AppCommand`/注册表，支持 scope、keywords 和统一可用性判断。
- 新增 `PanelRegistry`，支持 `sidebar.primary`、`sidebar.secondary`、`editor.margin`、`statusbar.end` 四类 slot。
- `CommandPalette` 的 `>` 模式已优先消费注册表，并保留旧静态动作作为兼容回退。
- 已补充命令、面板和命令面板组件测试；详见 `docs/command-panels.md`。

### 当前验证结果

- `npm run typecheck`：通过。
- `npm test`：通过，102 个测试文件、893 个测试。
- `npm run build`：通过，Main、Preload、Renderer 均成功构建。
- `npm run smoke`：通过；覆盖真实 Renderer → Preload → Main IPC → 磁盘链路，包含中文路径、保存冲突、重读、重命名、搜索和工作区状态读取。
- 新增壳层、命令、面板和会话相关聚焦测试均通过。

## 未完成

### 高优先级

- 新的 `WorkspaceShell` 已包裹现有页面，但顶栏、Sidebar、TabBar 和 ContextDock 仍保留旧布局组织方式，尚未完成完整 quiet-workspace UI 迁移。
- `PanelRegistry` 已建立扩展协议，但现有 Sidebar/ContextDock 面板尚未全部由注册表驱动。
- 系统关联打开、外部临时文件、多窗口重复路径和关闭外部文件规则仍需 Electron smoke/Playwright 固化。

### 中优先级

- 搜索、图谱、反向链接、标签和质量检查之间的工作区往返状态尚未统一到新的工作区视图模型。
- 索引、监听和搜索的 5,000 文件、5 MB 单文件、20 标签性能基线尚未在本分支完成并记录。
- 主题、窄窗口抽屉、焦点恢复、中文输入法和可见焦点仍需按新壳层做完整人工冒烟。
- 最近文件、收藏、导出、历史、草稿、图片、发布等既有能力尚未逐项完成“命令 + 面板 + 新文档模型”的迁移登记。

### 发布门禁

- Windows Electron 开发构建的自动 smoke 已通过；为无 GPU 的 CI/桌面环境增加了启动兼容参数，并在 smoke 模式下于 `app.ready` 前禁用硬件加速。
- 三平台安装包启动、文件关联和目标平台人工验证尚未执行。
- 发布前的完整兼容矩阵、错误码/schema 迁移说明和所有用户文档同步仍需继续完善。

## 提交记录

| 提交 | 内容 |
|---|---|
| `db198d4` | 从 mkEditor 建立 LastFileHome 可运行基线、兼容矩阵和重构设计 |
| `ea7a9f9` | 新增文档会话领域模型 |
| `a2c7ea3` | 强化文档会话与编辑器边界、补充领域文档 |
| `1d80df0` | 修复 EditorAdapter 在当前 TypeScript target 下的构建兼容性 |
| `f6f123c` | 新增命令上下文和面板注册表，接入 CommandPalette |
| `5a61074` | 新增 WorkspaceShell、CurrentFileBanner 并接入 App |
| `4e41aff` | 补充命令面板注册表组件测试 |

## 下一阶段顺序

1. 将文档会话控制器接入真实 `useDocumentSession`，并保留 Milkdown 作为唯一正文源。
2. 固化外部文件、多窗口、关闭确认和系统关联打开规则。
3. 将 ContextDock、Sidebar 次级面板和 StatusBar 逐步接入 `PanelRegistry`。
4. 收敛顶栏和工作区视图，完成窄窗口、焦点、输入法和标签行为迁移。
5. 建立索引/监听性能基线，完成搜索、图谱、导出、历史和发布的迁移登记。
6. 修复或替换当前 Electron smoke 环境，完成 `npm run smoke`、三平台构建和发布门禁。

## 当前工作区注意事项

当前工作区还存在用户修改的 `AGENTS.md`。它不属于产品实现，不应在功能提交中覆盖或夹带。
