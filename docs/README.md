# Paperin 文档索引

更新时间：2026-09-19（Asia/Shanghai）

`docs/` 只保留还在用的说明。完成度只看 [REFACTOR-STATUS](REFACTOR-STATUS.md)，任务顺序只看 [NEXT-DEVELOPMENT-PLAN](NEXT-DEVELOPMENT-PLAN.md)。不要在这里再抄一份状态表。

## 先读哪一份

| 目的 | 文档 |
| --- | --- |
| 产品取舍 | [PRODUCT-STRATEGY-ROADMAP](PRODUCT-STRATEGY-ROADMAP.md) |
| 下一项工作 | [NEXT-DEVELOPMENT-PLAN](NEXT-DEVELOPMENT-PLAN.md) |
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

## 不能从现有文档推出的结论

不能写成“三平台已发布”“所有设备上 5 MiB 都达标”“用户留存成立”或“商业模式已验证”。这些仍要等 S03、S04、S13、S14、S16 的环境和记录。
