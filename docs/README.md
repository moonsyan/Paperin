# Paperin 文档索引与任务总表

更新时间：2026-09-16（Asia/Shanghai）

本文是 `docs/` 的入口。文档分为四类：战略决策、工程计划、实时证据、维护契约。历史评估和一次性视觉迁移说明不再单独保留，避免多个版本同时表达产品方向或完成度。

## 当前应先阅读

| 目的 | 文档 | 维护规则 |
| --- | --- | --- |
| 了解产品取舍 | [PRODUCT-STRATEGY-ROADMAP](PRODUCT-STRATEGY-ROADMAP.md) | 只记录定位、竞争取舍、增长假设和进入条件 |
| 选择下一项工作 | [NEXT-DEVELOPMENT-PLAN](NEXT-DEVELOPMENT-PLAN.md) | 只记录 S00–S17 的优先级、依赖和量化验收 |
| 判断是否完成 | [REFACTOR-STATUS](REFACTOR-STATUS.md) | 唯一实时证据源；记录 commit、环境、样本和未验证项 |
| 执行质量门禁 | [IMPLEMENTATION-PLAN](IMPLEMENTATION-PLAN.md) | 保留仓库通用开发、测试、文档和回退要求 |
| 查看指标口径 | [strategy-validation](development/strategy-validation.md) | 只定义指标和采样方法，不代替实际结果 |

## 保留文档的职责

- [NEXT-UI-SPEC](NEXT-UI-SPEC.md)、[ACCESSIBILITY-SMOKE](ACCESSIBILITY-SMOKE.md)：视觉、交互、键盘、IME、主题和缩放验收。
- [compatibility-matrix](compatibility-matrix.md)、[TECH-STACK](TECH-STACK.md)：支持范围、平台边界和技术架构决策。
- [command-panels](command-panels.md)、[workspace-shell](workspace-shell.md)：命令入口与工作区壳层契约。
- [system-file-open-and-close](system-file-open-and-close.md)、[document-tab-lifecycle](document-tab-lifecycle.md)、[domain-model](domain-model.md)：打开、保存、关闭、会话和状态模型。
- [file-write-recovery](file-write-recovery.md)：已有桌面文件的恢复写入协议。
- [graph-view-architecture](graph-view-architecture.md)：图谱模块边界。
- [development/performance-baseline](development/performance-baseline.md) 与同目录 JSON：性能脚本使用的阈值和原始合成结果，禁止混用不同夹具。

## 后续任务总表

状态含义：工程自动回归通过不等于平台、用户或商业验证通过。P0 任务未完成前，不扩大真实用户试用或宣称发布就绪。

| 优先级 | 任务 | 当前状态 | 下一步完成条件 |
| --- | --- | --- | --- |
| P0 | S00 证据冻结、CI 与安装基线 | 部分完成 | 核对远端 CI、候选包、安装/升级/卸载证据，更新当前 commit 与分母 |
| P0 | S01 可恢复写入与文件身份 | 工程回归部分完成 | 进程终止、真实磁盘满/权限、符号链接、并发、三平台文件身份和剩余注入点矩阵；每个可控点 20 次 |
| P0 | S02 快照、保存确认与关闭安全 | 工程回归部分完成 | 完成 Q02 普通/阈值/5 MiB、IME、工作区切换、卸载、磁盘结果组合和跨平台时序矩阵 |
| P0/P1 | S03 5 MiB 正确性与体验性能 | P0 固定长段落门禁通过 | 五类节点形态、每类 20 次/至少三批、普通输入/保存、另一台设备和 8 小时稳定性 |
| P0 | S04 候选包与试用信任说明 | 未开始 | Windows/macOS/Linux（实际支持平台）候选包安装、文件关联、保存恢复、卸载保留文件，各至少两个环境、每流程三次 |
| P1 | S05 保存语义与 UI 残项 | 部分完成 | 保存中/冲突/编码/失败文案和旧回执 dirty 保护已接入顶栏与状态栏；真实中文 IME、9 主题、100/125/150% 缩放和焦点矩阵仍需人工验收 |
| P1 | S06 五分钟激活与兼容试开 | 部分完成 | 打开后报告未扫完和缺附件，且不改原文；共存说明见 docs/coexistence.md。用户任务与夹具 hash 未验证 |
| P1 | S07 中文搜索与覆盖解释 | 部分完成 | 文件名和标题优先的可解释排序，范围、相对目录、匹配上限和未扫完分开说明；Hit@5 与 5000 文件时延未验证 |
| P1 | S08 搜索结果到当前文章 | 部分完成 | 搜索和反链可插入带来源锚点的片段快照，搜索插入后回到原位置；用户任务耗时未验证 |
| P1 | S09 跨会话恢复与回访 | 部分完成 | 文档视图恢复阅读位置；记住搜索词和最近引用路径，可清除且不删正文。真实重启未验证 |
| P1 | S10 核心导出与预检 | 部分完成 | 各格式导出前检查见 docs/export-formats.md。多格式平台人工检查未完成 |
| P1 | S11 任务模板与成果引导 | 工程完成 | 技术文章和决策记录模板已可从命令面板创建；5 名用户无需讲解完成起步仍未验证 |
| P1 | S12 研究记录与隐私协议 | 未开始 | 研究材料、同意文本、数据最小化和删除流程冻结 |
| P1 | S13 任务对比与四周队列 | 未开始 | 两批各 6 人、四周观察、激活/周留存/成果/错误率/支持成本完整记录 |
| P0 | S14 全平台安装、升级、回退 | 未开始 | 正式候选在承诺平台安装、升级、回退、关联和用户文件保留全部通过 |
| P2 | S15 可重复获客渠道 | 未开始 | 至少一个渠道连续两批达到获客、激活和回收期门槛 |
| P2 | S16 专业交付商业验证 | 未开始 | 3 个付费试点、交付时长/支持成本/退款和贡献毛利达到协议门槛 |
| P1 | S17 热点拆分与维护账本 | 进行中 | 触及超限模块按职责拆分；不新增超过 450 行生产文件；每次移动同步测试和文档 |

## 当前禁止的结论

当前证据不能推出“三平台发布就绪”“5 MiB 在所有设备上满足体验预算”“真实用户留存成立”或“商业模式已验证”。这些结论必须等对应 S03、S04、S05、S13、S14 和 S16 的分母、环境与原始记录齐全后再写入战略文档。

删除的 `NEXT-PRODUCT-ASSESSMENT.md` 与 `SOFT-WORKBENCH-PLAN.md` 是历史审查/视觉迁移资料；其有效结论已合并到战略路线图、界面规范和实时状态账本，不再作为独立规范引用。
