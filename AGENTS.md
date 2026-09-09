# LastFileHome 开发门禁与代码规范

本文件适用于 LastFileHome 的所有功能开发、缺陷修复、重构、测试、构建和发布。它是强制约束；具体功能若有更严格的设计文档，以功能文档为准，但不得降低本文件的安全、测试和可维护性要求。

## 项目目标

LastFileHome 是本地优先的桌面 Markdown 知识库。默认打开知识库，当前文件只是工作区中的焦点。直接打开外部 Markdown 文件时，仍然使用同一套工作区、标签、搜索、保存和编辑体验。

## 架构边界

```text
Renderer (React UI)
  -> window.desktopAPI
Preload (typed narrow bridge)
  -> IPC channels
Main (files, workspace, index, window, settings, export)
Shared (side-effect-free DTOs, state, constants)
```

- `src/main/` 只使用 Electron 主进程 API、Node 内置模块和文件系统能力。
- `src/preload/` 是唯一的 Electron 能力出口；禁止暴露 `ipcRenderer`、`invoke`、`fs`、`path` 或 Node 全局对象。
- `src/renderer/` 不得导入 `electron`、Node 内置模块或直接读写用户文件。
- `src/shared/` 不得导入 Electron、Node、DOM 或 React。
- IPC 通道只能来自 `src/shared/ipc/channels.ts`；新增通道必须同步 Main、Preload、`api.d.ts`、Renderer 和测试。
- 设置只能由主进程 settings store 读写；渲染进程只能调用 typed API。

## 目录职责

- `src/main/ipc/`：按业务边界组织 handler，不把所有逻辑堆到一个 `handlers.ts`。
- `src/main/indexing/`：扫描、监听、索引和取消，不处理 React 状态。
- `src/main/history/`：版本历史和快照。
- `src/renderer/src/app/`：页面编排、工作区控制器、命令和 overlay 状态。
- `src/renderer/src/components/`：单一视图职责；复杂组件拆成目录入口、子组件和专属样式。
- `src/renderer/src/hooks/`：React 生命周期和可复用状态逻辑。
- `src/renderer/src/lib/`：无 React 副作用的纯函数、解析、转换和规则。
- `src/renderer/src/styles/`：变量、主题、全局、排版和组件样式分层。
- `docs/`：用户文档、维护文档、实施计划、兼容矩阵和架构决策记录。

目录可以按职责重新组织。移动文件时必须同步更新 import、测试、文档和构建配置，并在同一变更中完成全量验证。

## 文件拆分规则

- `.ts/.tsx` 超过 300 行必须评估拆分；超过 450 行禁止继续新增功能。
- React 组件超过 250 行、包含超过 3 个异步流程或超过 8 个不相关状态时必须拆分。
- 单文件只承担一个主要职责；类型、视图、纯函数、IPC handler 和副作用不得长期混放。
- 按业务职责拆分，不按“代码看起来长”机械拆分。
- 禁止使用 `utils2.ts`、`helpers-new.ts`、`misc.ts` 等无语义文件名。
- 拆分后旧测试必须继续运行，并为新边界补直接测试。
- 复杂算法、跨进程协议、迁移逻辑和安全边界必须有简短原因注释；不写复述代码的注释。

## TypeScript 与 React

- 开启并保持 `strict`；禁止 `any`、`@ts-ignore`、无理由的宽泛断言。
- 组件使用函数组件；事件处理函数以 `handle` 开头。
- Props、DTO、错误码和联合状态必须显式建模；互斥状态优先用联合类型。
- 导入顺序：第三方、项目绝对路径、相对路径、类型导入；类型仅使用 `import type`。
- 异步操作必须处理加载、防重复提交、取消、失败和卸载后的状态更新。
- 最新状态供异步回调读取时，使用 ref 镜像或现有 controller 模式，避免陈旧闭包。
- 不把编辑器正文复制成第二套可独立修改的状态；Milkdown/ProseMirror 是正文状态源。

## 文件、数据和安全

- 用户 Markdown 是高价值数据；保存、另存为、重命名、移动、删除、图片导入和导出都必须有成功、取消、失败分支。
- 保存必须传 `expectedMtime`；`CONFLICT` 时禁止静默覆盖。
- `ENCODING_LOSS` 时禁止丢弃字符；必须让用户选择处理方式。
- 删除优先进入系统回收站；永久删除需要明确产品确认。
- 草稿、会话、最近文件和统计与正文文件分离存储。
- 不把 token、绝对路径、草稿正文和用户隐私写入仓库、日志或错误上报。
- Markdown、HTML、CSS、图片 Data URL、网络响应进入 DOM、打印窗口或文件系统前，必须走白名单、转义和大小限制。
- 自定义协议和信任路径必须复用现有安全校验，不为新功能复制旁路。

## UI 和交互

- 知识库是持续可见的工作区上下文；单文件打开不是第二套模式。
- 顶栏只保留高频上下文和动作；低频能力接入命令注册表、上下文菜单或面板插槽。
- 图标按钮必须有 `aria-label` 或可访问名称；熟悉的图标优先使用现有图标库。
- 支持键盘导航、Escape 关闭、焦点恢复、中文输入法组合态和可见焦点。
- 当前文件必须在标签、文件树、面包屑和正文标题中保持一致。
- 未保存状态不能只放在状态栏；标签、关闭确认和窗口状态都要反映 dirty。
- 所有内置主题检查文本、边框、禁用、悬停、焦点、弹窗和系统标题栏对比度。

## 测试门禁

每个功能必须同时提交实现、测试和文档变更。最低要求：

- 纯函数、DTO、解析器、状态迁移：单元测试。
- React 组件、快捷键、焦点、输入法、命令面板：Testing Library 测试。
- IPC handler、文件安全、冲突、编码、监听和索引：主进程测试。
- 打开、保存、切换标签、搜索、导出、主题和关闭确认：开发环境人工冒烟；关键流程使用 Electron smoke 或 Playwright 固化。
- 公式、Mermaid、代码块、脚注、frontmatter、表格和任务列表至少覆盖正常、中文和异常/不完整输入。

## 文档同步门禁

以下变化必须同步文档：

- 用户功能、快捷键、设置、导出格式：更新 README 或 `docs/` 使用说明。
- IPC、错误码、状态 schema、目录职责：更新维护文档和迁移说明。
- 视觉布局、主题 token、交互规则：更新设计文档或 demo 说明。
- 新增命令：更新快捷键清单、命令面板说明和冲突处理记录。

## 开发流程

1. 阅读 `docs/IMPLEMENTATION-PLAN.md`、相关审查文档和当前模块测试。
2. 先写失败测试，确认测试确实覆盖用户行为或契约。
3. 实现最小变更，保持进程边界和目录职责。
4. 达到文件阈值立即拆分，不把大文件增长留到“以后”。
5. 更新文档、错误码、快捷键和兼容矩阵。
6. 执行相关测试，再执行 `npm run typecheck`、`npm run test`、`npm run build`。
7. UI、IPC、文件、编辑器和打包变更执行 `npm run dev` 或 `npm run smoke` 人工验证。
8. 查看 `git diff` 和 `git status`，确认没有构建产物、密钥、用户数据或无关改动。

## 完成定义

只有同时满足以下条件才能宣称完成：

- 代码位于正确的进程和目录边界。
- 相关测试通过，且新增行为有测试覆盖。
- 文档、快捷键、错误码和 schema 迁移已同步。
- `npm run typecheck`、`npm run test`、`npm run build` 通过；适用时 smoke 和平台验证通过。
- 没有遗留的大文件膨胀、重复状态、未处理取消分支或隐藏的用户数据风险。
