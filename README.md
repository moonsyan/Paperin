# LastFileHome

MarkdownSoft 的下一代本地优先 Markdown 工作台。项目基于 Electron、React、TypeScript 和 Milkdown，知识库始终是工作区上下文，当前文件是编辑焦点。

## 当前方向

- 默认进入一个本地知识库，文件树始终可见。
- 双击文件只是打开当前文件，不切换到另一套“单文件模式”。
- 编辑器、文件树、搜索和命令入口围绕当前文件协作，减少顶部菜单层级。
- 文件仍然是用户真实持有的 Markdown 文件，应用状态与正文文件分离保存。

技术评估见 [`docs/TECH-STACK.md`](./docs/TECH-STACK.md)，重构阶段划分见 [`docs/REFACTOR-ROADMAP.md`](./docs/REFACTOR-ROADMAP.md)。

## 开发

```bash
npm install
npm run dev
npm run typecheck
npm run test
npm run build
```

旧项目能力与新项目迁移状态见 [`docs/compatibility-matrix.md`](./docs/compatibility-matrix.md)。
