# 文档维护与全量核对

核对日期：2026-09-23（Asia/Shanghai）。代码基线以 [PROJECT-STATUS](../PROJECT-STATUS.md) 为准。本文件说明文档事实来源与核对范围：对齐战略、审查证据与四类事实（已实现 / 存在风险 / 尚未验证 / 未来设想）；入口文档与欢迎正文须反映当前代码，不以冻结审查反例冒充未修复。

**不做：** 修改产品业务逻辑（欢迎文案与设置说明除外）、性能阈值、历史冻结审阅正文、性能/主题原始 JSON、用户 `.paperin`。兼容夹具生成物不在本清单。

历史批次：2026-09-22 曾以 `60cc417` 完成 37 份核对；其细则保留在 Git，不再当作当前完成状态。

## 单一事实来源

| 内容 | 来源 | 同步要求 |
| --- | --- | --- |
| 当前功能、schema、默认键 | 生产代码、Shared DTO、`data/shortcuts.ts` 与直接测试 | README、入门、命令、领域模型、兼容表不得超前承诺 |
| 当前通过/失败/未验证 | [PROJECT-STATUS](../PROJECT-STATUS.md) | 写明版本、日期、命令和环境；其他页面引用，不把历史结果冒充重跑 |
| 阶段与产品取舍 | [战略报告](../PRODUCT-STRATEGY-REVIEW-2026-09-23.md) | 研究门槛按验收协议；工作任务按实施计划；审查证据与状态页分开引用 |
| 定向缺陷与门禁数字 | [状态审查证据](reviews/2026-09-23-product-state-audit.md) | A01–A10 与本机命令结果；不回写为通过 |
| 文件、失败测试、依赖、退出 | [实施计划](../superpowers/plans/2026-09-22-product-workflow-implementation.md) | 计划勾选 ≠ 完成；以状态页为准 |
| 研究指标与分母 | [战略验收协议](strategy-validation.md) | 种子、6–8 人发现轮、12 人确认轮、两批 W2/W4 分开报告 |
| 历史证据 | `reviews/2026-09-22-*.md` 与性能原始 JSON | 保留当时事实；当前处理写索引/状态页 |
| 安装与平台支持 | [发行验证](release-validation.md) | 配置、Draft、安装成功、正式发布分别验收 |
| 应用内入门 | `src/shared/product/getting-started.ts` | 与 `docs/getting-started.md` 全文一致 |

## 全量覆盖清单（2026-09-23）

路径相对仓库根。本清单须与 `git ls-files '*.md'`（排除夹具）对齐。

| 文档 | 本轮处理 |
| --- | --- |
| `AGENT.md` | 保留短入口，指向 `AGENTS.md` |
| `AGENTS.md` | 当前/计划/历史与欢迎同步规则不变 |
| `README.md` | 定位对齐战略；门禁与拼写当前行为；文档导航 |
| `CONTRIBUTING.md` | 门禁与本地数据边界；指向最新状态/战略 |
| `CHANGELOG.md` | 增加 2026-09-23 复审与全量同步条目 |
| `PRIVACY.md` | 日志路径风险；拼写打开后可能下载词典 |
| `SECURITY.md` | 指向 09-23 审查；区分 backup/journal |
| `THIRD-PARTY-NOTICES.md` | 拼写词典下载随设置开关 |
| `docs/README.md` | 导航含战略、审查、接收方矩阵、旧战略 stub |
| `docs/IMPLEMENTATION-PLAN.md` | 执行入口与 A01–A10 优先项 |
| `docs/PRODUCT-STRATEGY-REVIEW-2026-09-23.md` | **当前战略** |
| `docs/PRODUCT-STRATEGY-REVIEW-2026-09-22.md` | **兼容 stub，保留不删** |
| `docs/PRODUCT-WORKFLOW.md` | 已落地 vs 仍 UNVERIFIED 项 |
| `docs/PROJECT-STATUS.md` | 新鲜门禁、阻断表、行数 |
| `docs/TECH-STACK.md` | 依赖与 Node 口径 |
| `docs/UI-INTERACTION-SPEC.md` | 来源反馈、首次使用与拼写当前行为 |
| `docs/ACCESSIBILITY-SMOKE.md` | 静态数量；真人未测 |
| `docs/getting-started.md` | 与 `getting-started.ts` 全文一致 |
| `docs/command-panels.md` | 现有命令与来源清理 |
| `docs/coexistence.md` | 逐篇基线 + A02/A03/A08 |
| `docs/compatibility-matrix.md` | 已落地行与当前门禁注记 |
| `docs/export-formats.md` | 报告边界与 A07/A08 |
| `docs/workspace-shell.md` | 已知缺口标题 |
| `docs/system-file-open-and-close.md` | P1-06/08 已落地；A01/A04 |
| `docs/document-tab-lifecycle.md` | 来源生命周期现状 |
| `docs/domain-model.md` | 已落地表 + A08 |
| `docs/file-write-recovery.md` | backup/journal 边界 |
| `docs/graph-view-architecture.md` | 索引新鲜度依赖 |
| `docs/development/_index.md` | 维护/性能/发行/接收方入口 |
| `docs/development/documentation-maintenance.md` | 本文 |
| `docs/development/performance-baseline.md` | 09-23 红灯指针；原始 JSON 不改 |
| `docs/development/release-validation.md` | 已落地能力与 A05/安装 UNVERIFIED |
| `docs/development/strategy-validation.md` | 回归矩阵 ≠ 待实现；三类任务分报 |
| `docs/development/export-recipient-matrix.md` | P2-03 骨架；接收方 UNVERIFIED |
| `docs/development/user-research/_index.md` | 确认轮与分母 |
| `docs/development/user-research/seed-study-2026-09.md` | 协议字段；样本未采集 |
| `docs/development/reviews/_index.md` | 09-23 优先；冻结 09-22 |
| `docs/development/reviews/2026-09-23-product-state-audit.md` | **本次审查证据** |
| `docs/development/reviews/2026-09-22-strategy-review.md` | **冻结，不改写** |
| `docs/development/reviews/2026-09-22-code-function-review.md` | **冻结，不改写** |
| `docs/superpowers/plans/2026-09-22-product-workflow-implementation.md` | 计划≠完成；文首强化 |

附带同步（非独立产品文档，但与入门/隐私一致）：

| 文件 | 本轮处理 |
| --- | --- |
| `src/shared/product/getting-started.ts` | 与 `docs/getting-started.md` 同句 |
| `src/renderer/.../SettingsDialog/EditorPanel.tsx` | 拼写提示对齐当前生效行为 |

`.gitignore` 已忽略 `**/.paperin/`。LICENSE 与性能/主题原始 JSON 保留。

## 删除与保留决策

| 候选 | 决策 |
| --- | --- |
| `PRODUCT-STRATEGY-REVIEW-2026-09-22.md` | **保留**为兼容 stub |
| `reviews/2026-09-22-*.md` | **保留**冻结历史 |
| `IMPLEMENTATION-PLAN.md` + 长计划 | **保留**双入口，不合并删 |
| `export-recipient-matrix.md` | **保留**骨架，待实测填充 |
| 空占位 / 重复战略正文 | **无**可删项 |

## 校验规则

- 对照 `git ls-files '*.md'` 与上表；相对链接必须存在。
- 状态用「已实现 / 存在风险 / 未验证 / 历史结果 / 未来设想」；未知研究样本继续未知。
- 「本轮 / 新鲜」标明命令与日期；不得把未重跑结果写进通过表。
- 不因文档更新改性能阈值或锁文件。
- 改欢迎正文后须跑入门一致性测试。

## 本轮验证预期

文档与欢迎文案变更后：入门一致性测试；适用时 `npm run typecheck`。默认 `npm run test` 以 [PROJECT-STATUS](../PROJECT-STATUS.md) 新鲜结果为准。合成 `perf:regression` 仍可能因 I/O 波动红灯，**不因文档同步放宽阈值或声称全绿**。

返回 [文档索引](../README.md) · [开发资料](_index.md) · [项目状态](../PROJECT-STATUS.md)。
