# LastFileHome 重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在保留 mkEditor 能力的前提下，将 LastFileHome 重构为以知识库为默认上下文的本地优先 Markdown 工作台。

**Architecture:** 沿用 Electron 三进程边界，先建立可运行基线，再以 Shared 领域模型统一工作区与文档会话，最后迁移工作区壳层、命令和面板插槽。索引、保存、导出和安全能力沿用旧实现并逐项收敛边界。

**Tech Stack:** Electron 43、React 18、TypeScript strict、electron-vite、Milkdown、Vitest、Testing Library。

**Spec:** `docs/superpowers/specs/2026-09-09-lastfilehome-refactor-design.md`

## 全局约束

- Renderer 不得导入 Electron、Node 内置模块或通用 IPC。
- 文件写入必须携带 `expectedMtime`；冲突和编码损失不得静默覆盖或丢弃。
- 每批变更同步测试和文档，并运行 typecheck、test、build。
- 不提交 `out/`、`release/`、用户路径、草稿正文或密钥。

### Task 1: 基线与兼容矩阵

**Files:** `src/`、`resources/`、`scripts/`、根配置、`docs/compatibility-matrix.md`

- [x] 复制旧项目可运行源码与配置。
- [x] 建立旧能力、测试依据和后续冒烟入口矩阵。
- [x] 运行 `npm run typecheck`、`npm run test`、`npm run build`。

### Task 2: Shared 文档会话模型

**Files:** `src/shared/document-session.ts`、`src/shared/document-session.test.ts`

- [x] 建立 `DocumentRef`、`DocumentSession`、来源和编码联合类型。
- [x] 实现创建、编辑 dirty、保存基线和路径迁移纯函数。
- [x] 覆盖中文路径、外部文件、mtime、编码和未保存内容测试。

### Task 3: 文档会话控制器

**Files:** `src/renderer/src/app/document-session/document-session-controller.ts`、对应测试；复用保存队列和草稿 hook

- [ ] 以 `DocumentSession` 聚合内容、savedContent、mtime、编码和草稿状态。
- [ ] 将保存、冲突、编码损失、取消和卸载清理收敛到控制器外观。
- [ ] 用行为测试覆盖切换标签不串内容、冲突不覆盖和草稿 mtime 校验。

### Task 4: 工作区壳层与面板

**Files:** `src/renderer/src/components/WorkspaceShell/`、`CurrentFileBanner/`、`App.tsx`、布局样式与测试

- [ ] 知识库始终可见，外部文件作为临时项进入当前标签。
- [ ] 统一文件树、标签、面包屑和正文标题上下文。
- [ ] 接入现有 ContextDock，覆盖收缩、隐藏、焦点恢复和窄窗口降级。

### Task 5: 命令、搜索和性能回归

**Files:** `app/commands/command-context.ts`、`app/panels/panel-registry.ts`、索引/监听测试与维护文档

- [ ] 统一命令上下文和面板注册入口。
- [ ] 固化搜索、图谱、关系面板往返行为。
- [ ] 记录 5000 文件、5 MB 文件和 20 标签性能基线。

### Task 6: 功能迁移与发布门禁

- [ ] 按路线迁移最近文件、收藏、标签、链接、导出、历史、主题和低频能力。
- [ ] 每项同步兼容矩阵、用户文档和回归测试。
- [ ] 运行 typecheck、test、build、smoke 与目标平台启动验证。
