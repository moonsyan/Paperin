# Paperin 开发执行入口

更新时间：2026-09-22（Asia/Shanghai）

完整优先级、任务依赖、精确文件、失败测试、验证命令和提交格式见：

- [产品整体工作流](PRODUCT-WORKFLOW.md)
- [2026-09-22 产品工作流实施计划](superpowers/plans/2026-09-22-product-workflow-implementation.md)
- [当前项目状态](PROJECT-STATUS.md)
- [产品战略发展报告](PRODUCT-STRATEGY-REVIEW-2026-09-22.md)
- [代码与功能完整性审阅](development/reviews/2026-09-22-code-function-review.md)：来源归属、异步生命周期、索引失效、缓存和搜索内存预算。
- [文档维护与全量核对](development/documentation-maintenance.md)：事实来源、同步范围和历史证据边界。

根目录 [AGENTS.md](../AGENTS.md) 是强制门禁。执行任何任务时：

阶段依赖统一为：P0 可信候选 → P1-05 Alpha 发现轮 → P2-05 U01/U02 确认轮；确认轮与 P2-01/03 通过后进入 P2-04 两批 W2/W4 队列及有条件付款实验。P1-06/07/08 的已有能力正确性修复和种子观察可提前执行；不要将 P1 退出同时设为 Alpha 进入条件。

1. 先确认 `PROJECT-STATUS.md` 的当前红灯和任务进入条件，不从历史提交推断当前通过。
2. 先写会失败的测试，再写最小实现；测试覆盖用户可观察行为、跨进程协议或安全边界。
3. 保持 Main、Preload、Renderer、Shared 边界；新增 IPC 必须同步通道、handler、typed API、消费者和测试。
4. 文件操作必须保留成功、取消、失败、冲突和编码损失分支；不得降低真实路径和信任根校验来让测试通过。
5. 同步 README 或 `docs/` 中受影响的功能、错误码、快捷键、schema、兼容和验证说明。
6. 运行相关测试后，再运行 `npm run lint`、`npm run typecheck`、`npm run test`、`npm run build`；涉及 UI、IPC、文件或打包时运行 `npm run smoke`，涉及 UI 时运行 `npm run a11y`。
7. 性能任务保留原阈值和失败结果，只有多轮代表性证据与用户体验预算共同支持时才能评审修改阈值。
8. 使用 `git diff`、`git diff --check` 和 `git status --short` 检查无生成物、密钥、用户数据或无关改动。
9. Paperin 不使用 PM 号；提交信息使用 `<type>: <摘要>`，每个边界完整的变更通过相应门禁后立即主动提交。

上一轮的路径安全、核心任务冒烟、来源健康初版、发布配置与交付报告、稳定性夹具与汇总已在 `master`。本轮计划中的搜索优化、索引依赖失效、来源异步隔离与文档归属、缓存生命周期及支持摘要仍待实现或验证；安装循环、真人样本、8 小时与第二台设备、GitHub Draft Release 也尚未完成。代码任务按主计划及其“代码与功能补充任务”执行，已有正确性缺口可以立即写失败测试，不必等待新增功能的研究门槛。公开发布、收费、团队与企业仍须满足对应进入条件。当前事实以 [PROJECT-STATUS](PROJECT-STATUS.md) 为准。
