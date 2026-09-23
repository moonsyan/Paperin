# Paperin 文档索引

更新时间：2026-09-23（Asia/Shanghai）

`docs/` 只保留当前说明、稳定规范和有日期的审计证据。当前战略、状态和执行计划各自只有一个入口；被替代的战略正文由 Git 历史承担，树内仅保留兼容 stub。

## 先读哪一份

| 目的 | 文档 |
| --- | --- |
| 产品定位、竞品、路线和商业/团队进入条件 | [2026-09-23 产品战略发展报告](PRODUCT-STRATEGY-REVIEW-2026-09-23.md) |
| 从安装到持续维护的产品与代码工作流 | [PRODUCT-WORKFLOW](PRODUCT-WORKFLOW.md) |
| 当前代码、门禁、阻断和未验证项 | [PROJECT-STATUS](PROJECT-STATUS.md) |
| P0-P3 完整执行任务（计划≠完成） | [产品工作流实施计划](superpowers/plans/2026-09-22-product-workflow-implementation.md) |
| 每次开发必须遵守的入口约束 | [IMPLEMENTATION-PLAN](IMPLEMENTATION-PLAN.md) 与仓库根目录 `AGENTS.md` |
| 质量、研究和商业指标口径 | [strategy-validation](development/strategy-validation.md) |
| 本次代码、界面、定向缺陷复现和工程检查 | [2026-09-23 状态审查证据](development/reviews/2026-09-23-product-state-audit.md) |
| 全量文档覆盖、事实来源与同步规则 | [文档维护与全量核对](development/documentation-maintenance.md) |
| 旧战略 URL 兼容 | [2026-09-22 stub](PRODUCT-STRATEGY-REVIEW-2026-09-22.md)（正文已迁出） |

## 用户与产品说明

2026-09-23 完成全量文档同步：战略与审查入库，并按后续可编码收口持续校正入口事实（以 [PROJECT-STATUS](PROJECT-STATUS.md) 为准）。历史审查正文保留原反例，不回写为当时已通过。性能/主题原始 JSON 与用户 `.paperin` 未改。

- [入门](getting-started.md)：首次打开时看到的分模块说明，与应用内「欢迎使用.md」同一正文。
- [coexistence](coexistence.md)：和 Typora、Obsidian，以及 Notion、语雀、思源导出副本如何共存。
- [export-formats](export-formats.md)：各导出格式实际检查什么、不保证什么。
- [command-panels](command-panels.md)：命令、快捷键、模板和插入引用。
- [UI-INTERACTION-SPEC](UI-INTERACTION-SPEC.md)、[ACCESSIBILITY-SMOKE](ACCESSIBILITY-SMOKE.md)：界面规则和仍需人工验证的输入法、焦点、缩放。

## 维护契约

- [compatibility-matrix](compatibility-matrix.md)、[TECH-STACK](TECH-STACK.md)：支持范围和技术选择。
- [workspace-shell](workspace-shell.md)、[system-file-open-and-close](system-file-open-and-close.md)、[document-tab-lifecycle](document-tab-lifecycle.md)、[domain-model](domain-model.md)：壳层、打开关闭、标签和状态。
- [file-write-recovery](file-write-recovery.md)：已有文件的恢复写入协议和验证边界。
- [graph-view-architecture](graph-view-architecture.md)：图谱模块边界。
- [development/](development/)：性能基线、发行验证、[导出接收方矩阵](development/export-recipient-matrix.md)、主题对比度基线和验收协议；原始 JSON 是绑定日期和环境的测量，不代表当前全部通过。
- [development/reviews/](development/reviews/_index.md)：战略与代码审阅索引；历史发现保留原基线，不改写为已修复。
- [development/user-research/](development/user-research/_index.md)：用户研究协议与脱敏记录入口，不含个人资料。

## 当前发行边界

阶段口径以最新战略为准：先两人真实任务、再外部发现与确认、之后验证重复价值和商业。U01/U02 的来源与交付任务只确认资料复用主张；三类场景分别记录成功，安全/安装门禁保持独立。未采集继续标未知，文档更新不代表已发布、已研究或已修复代码缺陷。

根目录已有 `LICENSE`（MIT，版权所有者与 `package.json` `author` 一致为 ming）、`THIRD-PARTY-NOTICES.md`、`PRIVACY.md`、`SECURITY.md`、`CHANGELOG.md` 和 `CONTRIBUTING.md`。隐私说明覆盖三类联网：生产环境默认的更新检查/自动下载/退出安装；用户启用的 SM.MS；以及拼写检查打开后可能的词典下载。安全问题走 GitHub 私密公告，不要求公开用户文件。`0.7.0` 是候选版本，变更说明只记录已经发生的事实。

GitHub 已有公开 v0.6.0；当前 0.7.0 的搜索语料、来源基线、索引失效、缓存和支持摘要已有实现。本次复现新的状态目录、来源身份/路径及测试/性能门禁问题，当前不能宣称稳定全平台发行、用户留存或商业模式成立。Windows 两个隔离环境的安装/升级/卸载、两设备八小时稳定性仍为 **UNVERIFIED**。

常规提交至少运行 `npm run lint`、`npm run typecheck`、`npm run test` 和 `npm run build`；涉及 UI 追加 `npm run a11y`，涉及 UI、IPC、文件和打包追加 `npm run smoke`，性能变更运行相应性能门禁。历史通过记录不能替代当前提交的新鲜结果；默认 `npm run test` 当前已知因 A10 为红。
