# Paperin 文档索引

更新时间：2026-09-21（Asia/Shanghai）

`docs/` 保留当前说明与有日期的审查证据。持续完成度看 [REFACTOR-STATUS](REFACTOR-STATUS.md)；9 月 20 日的审查结果固定在证据附录中。R00–R12 的昨天提交状态已经记录，R13–R16 仍受前置条件约束，R17 只保留维护缺口；不要把旧战略和任务计划重新当成待实施清单。

## 先读哪一份

| 目的 | 文档 |
| --- | --- |
| 本轮产品取舍与竞品比较 | [2026-09-20 战略审查报告](PRODUCT-STRATEGY-REVIEW-2026-09-20.md) |
| 后续条件与完整实施任务 | [R00–R17 优先级实施计划](superpowers/plans/2026-09-20-product-strategy-execution.md) |
| 本轮代码与验证证据 | [product-audit-2026-09-20](development/product-audit-2026-09-20.md) |
| 历史审查与任务依据 | [代码与验证证据](development/product-audit-2026-09-20.md)、Git 提交历史 |
| 现在做到哪 | [REFACTOR-STATUS](REFACTOR-STATUS.md) |
| 怎么改代码 | [IMPLEMENTATION-PLAN](IMPLEMENTATION-PLAN.md) 与仓库根目录 `AGENTS.md` |
| 指标口径 | [strategy-validation](development/strategy-validation.md) |

## 使用说明

- [coexistence](coexistence.md)：和 Typora、Obsidian，以及 Notion / 语雀 / 思源导出副本怎么一起用。
- [export-formats](export-formats.md)：各导出格式实际检查什么、不保证什么。
- [command-panels](command-panels.md)：命令、快捷键、模板和插入引用。
- [NEXT-UI-SPEC](NEXT-UI-SPEC.md)、[ACCESSIBILITY-SMOKE](ACCESSIBILITY-SMOKE.md)：界面规则和仍需人工看的输入法、焦点、缩放。

## 维护契约

- [compatibility-matrix](compatibility-matrix.md)、[TECH-STACK](TECH-STACK.md)：支持范围和技术选择。
- [workspace-shell](workspace-shell.md)、[system-file-open-and-close](system-file-open-and-close.md)、[document-tab-lifecycle](document-tab-lifecycle.md)、[domain-model](domain-model.md)：壳层、打开关闭、标签和状态。
- [file-write-recovery](file-write-recovery.md)：已有文件的恢复写入。
- [graph-view-architecture](graph-view-architecture.md)：图谱模块边界。
- [development/](development/)：性能基线、主题对比度基线和验收协议。原始 JSON 是当时的测量，不要拿去覆盖后来的 Electron 记录。
- [development/user-research/](development/user-research/_index.md)：用户研究协议与脱敏记录入口（不含个人资料）。

## 许可与分发材料（R17）

仓库根目录 **尚无** 经权利依据补齐的 `LICENSE` 文件；`package.json` 的 `MIT` 字段 alone 不能作为全部权利与第三方分发结论。Chromium/Electron 等必需声明须保留；发布安装包前需单独核对 `resources/` 与各依赖许可证。**不**在缺少依据时新建声称版权的 LICENSE。

## 不能从现有文档推出的结论

不能写成“三平台已发布”“所有设备上 5 MiB 都达标”“用户留存成立”或“商业模式已验证”。这些仍要等 R09、R10、R13、R14、R15 的环境和记录。
