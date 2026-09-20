# Paperin 开发执行说明

更新时间：2026-09-20（Asia/Shanghai）

强制门禁在根目录 [AGENTS.md](../AGENTS.md)。下一轮按 [R00–R17 实施任务](superpowers/plans/2026-09-20-product-strategy-execution.md) 推进，原 [NEXT-DEVELOPMENT-PLAN](NEXT-DEVELOPMENT-PLAN.md) 保留 S00–S17 验收与追溯。做到哪一步看 [REFACTOR-STATUS](REFACTOR-STATUS.md)。验收数字的口径看 [strategy-validation](development/strategy-validation.md)。

旧的阶段 0–N 勾选清单已删除。那些步骤要么已经做完，要么会被空勾选误导成“还没开始”。T01–T21 的追溯只留在下一阶段计划里。

开始一项改动时：

1. 先读本文件、相关维护文档和现有测试，确认对应本轮 R00–R17 任务及原 S00–S17 验收范围。
2. 先写会失败的测试，再写最小实现。测试要覆盖用户能观察到的行为或跨进程契约。
3. 保持进程边界：Renderer 不导入 Electron 或 Node；IPC 通道只来自 `src/shared/ipc/channels.ts`；设置只由主进程读写。
4. 保存必须带 `expectedMtime`。`CONFLICT` 不能静默覆盖，`ENCODING_LOSS` 不能丢字符。等锁期间写入授权失效必须拒绝，不能当成放行。删除优先进回收站。
5. 改完同步 README 或 `docs/` 里受影响的说明，再跑相关测试和 `npm run typecheck`。涉及文件、界面或打包时，还要按 AGENTS.md 做对应冒烟。
6. 单个生产文件超过 450 行就不要继续往里加功能。组件超过 250 行并继续加界面时，先按职责拆开。

不要把下面这些写成“已完成”：另一台电脑、8 小时稳定性、真实中文输入法手测、安装包安装/升级/卸载、用户试用和商业验证。
