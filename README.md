# LastFileHome

MarkdownSoft 的下一代本地优先 Markdown 工作台。项目基于 Electron、React、TypeScript 和 Milkdown，知识库始终是工作区上下文，当前文件是编辑焦点。

## 当前方向

- 默认进入一个本地知识库，文件树始终可见。
- 双击文件只是打开当前文件，不切换到另一套“单文件模式”。
- 编辑器、文件树、搜索和命令入口围绕当前文件协作，减少顶部菜单层级。
- 文件仍然是用户真实持有的 Markdown 文件，应用状态与正文文件分离保存。

技术评估见 [`docs/TECH-STACK.md`](./docs/TECH-STACK.md)，重构阶段划分见 [`docs/REFACTOR-ROADMAP.md`](./docs/REFACTOR-ROADMAP.md)。
当前实际完成度见 [`docs/REFACTOR-STATUS.md`](./docs/REFACTOR-STATUS.md)。

## 下一阶段发展计划

2026-09-13 新增 [柔和工作台与个人知识复用规划](./docs/SOFT-WORKBENCH-PLAN.md) 和 [可交互 demo](./design/soft-workbench/README.md)。按最新讨论，当前保持免费，优先本地写作、资料复用与可核对来源的 AI，暂缓同步。运行 `npm run demo:soft` 预览；原型不会修改真实知识库，也尚未接入模型。

2026-09-12 基于当前代码、界面截图和本地复测形成的评估与计划：

- [项目评估与产品方向](./docs/NEXT-PRODUCT-ASSESSMENT.md)：重构成果、已确认问题、验证边界和产品定位。
- [下一版界面与交互规范](./docs/NEXT-UI-SPEC.md)：布局草图、状态、搜索、大纲、主题和窄窗口验收。
- [下一阶段实施计划](./docs/NEXT-DEVELOPMENT-PLAN.md)：M0–M4、21 项任务、依赖、估算、测试及发布门禁。

上面的 9 月 12 日文档保留当时的评估快照；M0/M2 多项任务已落地，实际进度以 REFACTOR-STATUS 为准。9 月 13 日规划补充下一轮产品优先级与设计原型，不代表生产迁移完成。

## 开发

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
npm run smoke
npm run perf:regression
```

旧项目能力与新项目迁移状态见 [`docs/compatibility-matrix.md`](./docs/compatibility-matrix.md)。
合成性能场景、实测基线和脚本阈值说明见 [`docs/development/performance-baseline.md`](./docs/development/performance-baseline.md)。
