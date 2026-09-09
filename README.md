# LastFileHome

MarkdownSoft 的下一代重构项目目录。

当前目录先承载新的界面方向和技术决策，原项目继续作为稳定参考。设计 Demo 位于 [`design/quiet-workspace`](./design/quiet-workspace/)，直接打开 `index.html` 即可预览，也可以运行 `node build.mjs` 重新生成演示页面。

## 当前方向

- 默认进入一个本地知识库，文件树始终可见。
- 双击文件只是打开当前文件，不切换到另一套“单文件模式”。
- 编辑器、文件树、搜索和命令入口围绕当前文件协作，减少顶部菜单层级。
- 文件仍然是用户真实持有的 Markdown 文件，应用状态与正文文件分离保存。

技术评估见 [`docs/TECH-STACK.md`](./docs/TECH-STACK.md)，重构阶段划分见 [`docs/REFACTOR-ROADMAP.md`](./docs/REFACTOR-ROADMAP.md)。
