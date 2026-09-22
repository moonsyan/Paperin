# Paperin 开发执行入口

更新时间：2026-09-21（Asia/Shanghai）

完整优先级、任务依赖、精确文件、失败测试、验证命令和提交格式见：

- [2026-09-21 产品战略实施计划](superpowers/plans/2026-09-21-product-strategy-implementation.md)
- [当前项目状态](PROJECT-STATUS.md)
- [产品战略发展报告](PRODUCT-STRATEGY-REVIEW-2026-09-22.md)

根目录 [AGENTS.md](../AGENTS.md) 是强制门禁。执行任何任务时：

1. 先确认 `PROJECT-STATUS.md` 的当前红灯和任务进入条件，不从历史提交推断当前通过。
2. 先写会失败的测试，再写最小实现；测试覆盖用户可观察行为、跨进程协议或安全边界。
3. 保持 Main、Preload、Renderer、Shared 边界；新增 IPC 必须同步通道、handler、typed API、消费者和测试。
4. 文件操作必须保留成功、取消、失败、冲突和编码损失分支；不得降低真实路径和信任根校验来让测试通过。
5. 同步 README 或 `docs/` 中受影响的功能、错误码、快捷键、schema、兼容和验证说明。
6. 运行相关测试后，再运行 `npm run lint`、`npm run typecheck`、`npm run test`、`npm run build`；涉及 UI、IPC、文件或打包时运行 `npm run smoke`，涉及 UI 时运行 `npm run a11y`。
7. 性能任务保留原阈值和失败结果，只有多轮代表性证据与用户体验预算共同支持时才能评审修改阈值。
8. 使用 `git diff`、`git diff --check` 和 `git status --short` 检查无生成物、密钥、用户数据或无关改动。
9. Paperin 不使用 PM 号；提交信息使用 `<type>: <摘要>`，每个边界完整的变更通过相应门禁后立即主动提交。

实施计划中的产品代码（P0 工程项、核心任务冒烟、来源健康、发布配置与交付报告、稳定性夹具与汇总）已在 `master`。当前未完成的是安装循环、真人样本、8 小时与第二台设备，以及 GitHub Draft Release。这些不是空文档能代替的验证。P0 代码落地后仍不进入公开发布、收费系统、团队协作或企业架构实现，直到对应进入条件满足。当前事实以 [PROJECT-STATUS](PROJECT-STATUS.md) 为准。
