# Paperin 文档索引

更新时间：2026-09-21（Asia/Shanghai）

`docs/` 只保留当前说明、稳定规范和有日期的审计证据。当前战略、状态和执行计划各自只有一个入口；被替代的战略与空占位计划由 Git 历史承担，不在当前树重复归档。

## 先读哪一份

| 目的 | 文档 |
| --- | --- |
| 产品定位、竞品、路线和商业/团队进入条件 | [2026-09-21 全量战略发展报告](PRODUCT-STRATEGY-REVIEW-2026-09-21.md) |
| 当前代码、门禁、阻断和未验证项 | [PROJECT-STATUS](PROJECT-STATUS.md) |
| P0–P3 完整执行任务 | [产品战略实施计划](superpowers/plans/2026-09-21-product-strategy-implementation.md) |
| 每次开发必须遵守的入口约束 | [IMPLEMENTATION-PLAN](IMPLEMENTATION-PLAN.md) 与仓库根目录 `AGENTS.md` |
| 质量、研究和商业指标口径 | [strategy-validation](development/strategy-validation.md) |
| 上一轮代码与验证证据 | [product-audit-2026-09-20](development/product-audit-2026-09-20.md)，仅作历史快照 |

## 用户与产品说明

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
- [development/](development/)：性能基线、发行验证、主题对比度基线和验收协议；原始 JSON 是绑定日期和环境的测量，不代表当前全部通过。
- [development/user-research/](development/user-research/_index.md)：用户研究协议与脱敏记录入口，不含个人资料。

## 当前发行边界

根目录已有 `LICENSE`（MIT，版权所有者与 `package.json` `author` 一致为 ming）、`THIRD-PARTY-NOTICES.md`、`PRIVACY.md`、`SECURITY.md`、`CHANGELOG.md` 和 `CONTRIBUTING.md`。隐私说明覆盖三类联网：生产环境默认的更新检查/自动下载/退出安装；用户启用的 SM.MS；用户打开拼写检查后可能的词典下载。安全问题走 GitHub 私密公告，不要求公开用户文件。`0.7.0` 是候选版本，变更说明只记录已经发生的事实。

当前不能宣称“三平台已发布”“所有设备上 5 MiB 都达标”“用户留存成立”或“商业模式已验证”。计划内的产品代码已在 `master`；Windows 两个隔离环境的安装 → 启动 → 文件关联 → 保存 → 升级 → 卸载循环，以及 8 小时和第二台设备稳定性，仍为 **UNVERIFIED**。

常规提交至少运行 `npm run lint`、`npm run typecheck`、`npm run test` 和 `npm run build`；涉及 UI 追加 `npm run a11y`，涉及 UI、IPC、文件和打包追加 `npm run smoke`，性能变更运行相应性能门禁。历史通过记录不能替代当前提交的新鲜结果。
