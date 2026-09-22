# 文档维护与全量核对

核对日期：2026-09-22。基线 `60cc417`。首轮对全部 37 份既有 Markdown 核对代码、任务依赖与证据口径，更新 35 份当前文档，保留两份冻结审阅，新增本文。第二遍交叉审计修正战略报告「本轮/新鲜」与未重跑 audit/perf 的混用、状态表来源健康防误读、SECURITY 对 journal/backup 的区分、示例文件行数，并忽略任意路径下的 `.paperin/`。同步应用欢迎正文和一处内置示例快捷键，没有实现来源/索引/缓存待办，也没有改变产品版本或发布。

## 单一事实来源

| 内容 | 来源 | 同步要求 |
| --- | --- | --- |
| 当前功能、schema、默认键 | 生产代码、Shared DTO、`data/shortcuts.ts` 与直接测试 | README、入门、命令、领域模型、兼容表不得超前承诺 |
| 当前通过/失败/未验证 | [PROJECT-STATUS](../PROJECT-STATUS.md) | 写明版本、日期、命令和环境；其他页面引用，不把历史结果冒充重跑 |
| 阶段与产品取舍 | [战略报告](../PRODUCT-STRATEGY-REVIEW-2026-09-22.md) | 研究门槛按验收协议，工作任务按实施计划；审查日快照与文档同步复验分开表述 |
| 文件、失败测试、依赖、退出 | [实施计划](../superpowers/plans/2026-09-22-product-workflow-implementation.md) | 计划不等于实现；完成前保留未勾选 |
| 研究指标与分母 | [战略验收协议](strategy-validation.md) | 种子、6–8 人发现轮、12 人确认轮、两批 W2/W4 分开报告 |
| 历史证据 | reviews/ 与性能原始 JSON | 保留当时事实；当前处理状态写索引/状态页，不改历史结论 |
| 安装与平台支持 | [发行验证](release-validation.md) | 配置、Draft 产物、安装成功、正式发布分别验收 |
| 应用内入门 | `src/shared/product/getting-started.ts` | `docs/getting-started.md` 与其全文一致，由现有测试校验 |

## 全量覆盖清单

表中路径均相对仓库根目录。更新范围是实际语义同步，历史证据的保留也是核对结果。`documentation-maintenance.md` 为本清单的一部分，须随本轮一并入库，避免已跟踪文档链向未跟踪文件。

| 文档 | 本轮处理 |
| --- | --- |
| `AGENT.md` | 指向唯一规范、执行入口与本页 |
| `AGENTS.md` | 明确当前/计划/历史及欢迎文案同步，不降低原门禁 |
| `README.md` | 候选定位、来源限制、私有状态、开发命令、阶段与文档导航；战略报告引用区分审查日/复验 |
| `CONTRIBUTING.md` | 提交门禁、工作分支、文档和本地数据边界 |
| `CHANGELOG.md` | 未发布文档同步条目；0.7.0 历史事实保留 |
| `PRIVACY.md` | `.paperin`、缓存、草稿/历史、含正文的恢复材料与相对路径报告 |
| `SECURITY.md` | 私密渠道可达性边界；backup 含正文、journal 仅元数据；待办范围 |
| `THIRD-PARTY-NOTICES.md` | 区分项目署名与第三方权利人，明确未完成包级审计 |
| `.gitignore` | 忽略任意路径 `**/.paperin/`，防止工作区私有状态入库 |
| `docs/README.md` | 全量导航、阶段口径、审阅索引与覆盖范围 |
| `docs/IMPLEMENTATION-PLAN.md` | 无循环的进入条件与事实来源 |
| `docs/PRODUCT-STRATEGY-REVIEW-2026-09-22.md` | 画像、发现/确认、W2/W4、停止条件；审查日证据与文档同步复验拆分 |
| `docs/PRODUCT-WORKFLOW.md` | 当前共享来源限制与目标契约、阶段依赖 |
| `docs/PROJECT-STATUS.md` | 复验与未重跑项分开；来源健康标明共享初版非逐篇；行数与代码对齐 |
| `docs/TECH-STACK.md` | 当前依赖与候选依赖区分，Node 22 基准与本机版本分报 |
| `docs/UI-INTERACTION-SPEC.md` | 建议/候选不算已实现，补来源范围与复核目标 |
| `docs/ACCESSIBILITY-SMOKE.md` | 新鲜静态数量、历史表标签、默认键、真实人工未测 |
| `docs/getting-started.md` | 当前限制、数据归属、系统打开、其他工具冲突边界 |
| `docs/command-panels.md` | 现有命令/键位与待开发动作分开，来源清理语义 |
| `docs/coexistence.md` | 正常试开与中断恢复区分，不替其他工具承诺冲突保护 |
| `docs/compatibility-matrix.md` | 修复断裂表格、扫描口径与新增正确性门禁 |
| `docs/export-formats.md` | 交付报告范围、相对路径敏感性与未完成接收方验证 |
| `docs/workspace-shell.md` | 上下文显示与保存状态边界、来源/索引待办 |
| `docs/system-file-open-and-close.md` | 代码与安装态证据、多窗口索引旁路生命周期 |
| `docs/document-tab-lifecycle.md` | 已有会话保护与待实现来源隔离不混同 |
| `docs/domain-model.md` | 当前 schema、Shared/Renderer 身份差异与计划迁移 |
| `docs/file-write-recovery.md` | 更正 backup 含正文，明确注入测试与真机边界 |
| `docs/graph-view-architecture.md` | 图数据依赖新鲜度、目标变化与释放验收 |
| `docs/development/_index.md` | 补齐维护、性能、发行和指标入口 |
| `docs/development/performance-baseline.md` | 原始测量保留，补语料预算和当前/历史解释 |
| `docs/development/release-validation.md` | Alpha/Beta 与新增代码门禁，保留未安装状态 |
| `docs/development/strategy-validation.md` | 协议 2.2、确认轮、成果北极星、W2/W4、撤回与停止 |
| `docs/development/user-research/_index.md` | 移除阶段循环，加入确认轮与分母口径 |
| `docs/development/user-research/seed-study-2026-09.md` | 正式真实任务、日期/版本/耗时/求助及样本资格 |
| `docs/development/reviews/_index.md` | 记录文档层修订，代码层仍待实施 |
| `docs/development/reviews/2026-09-22-strategy-review.md` | 已核对，保留 `4d2f791` 发现快照，不改写历史 |
| `docs/development/reviews/2026-09-22-code-function-review.md` | 已核对，保留 `7c3dd53` 发现及上一轮验证，不冒充已修复 |
| `docs/superpowers/plans/2026-09-22-product-workflow-implementation.md` | 新增 P2-05、统一研究依赖与分母，移除不可用技能硬依赖 |

LICENSE 保留许可原文；原始性能/主题 JSON 保留数据，不重新生成。`.paperin` 是用户本地状态，不属于项目文档，不读取内容、不提交。外部竞品资料、私密报告入口和发布服务本轮不作联网可达性或最新能力验证，文档仍要求发布前核对。

额外核对 `.github/ISSUE_TEMPLATE/` 四份反馈文案：bug 更新候选版本示例，data-safety 说明恢复备份含正文，compatibility 要求合成材料与工具版本，feature 对齐产品范围；没有新增表单字段或改变发布工作流。YAML 解析及发行材料检查验证这些文案可读取。

## 第二遍交叉审计（同日）

对照首轮结论再次扫描后，仍需修正或确认的项：

| 项 | 结论 |
| --- | --- |
| Alpha 进入条件循环 | 已对齐；发现轮成功才退出 P1，不以 P1 退出作为进入条件 |
| W1/W2 混用 | 已统一为 W2（day 7–13）/W4（day 21–27） |
| 来源健康「逐篇已实现」 | 主流文档正确；状态阻断表补「共享初版非逐篇」防误读 |
| 隐私/恢复备份 | `.paperin`、backup 含正文已对齐；SECURITY 区分 journal |
| 命令面板默认键 | `Ctrl+P`；`Ctrl+K` 仅插入链接 |
| a11y 218 vs 254/37 | 历史表已标注，未混计 |
| 战略报告「本轮通过」含 audit | **已修正**：审查日快照 vs 文档同步复验拆分 |
| 维护页未入库导致断链 | 本文件须随文档同步提交 |
| 远端表述 | `origin`=Gitee，另有 `github` 远端；Draft/Release 仍无可达证据 |
| 大文件行数 | `demo-files.ts` 现为 551；其余与状态页一致 |

## 校验与维护规则

- 对照 `git ls-files '*.md'` 检查清单覆盖，所有本地 Markdown 链接指向实际文件/目录；不为计划中的文件创建空占位。
- 状态用“已实现 / 待实施 / 未验证 / 历史结果”明确表达。新增任务不能仅在战略正文出现而缺实施依赖；未知研究样本继续未知。
- 「本轮 / 新鲜」必须标明是哪一次命令输出：战略审查日、文档同步复验，或其它日期；不得把未重跑的 audit/perf 写进复验通过表。
- 文档内调用命令以 package.json 和实际源码为准；默认快捷键优先引用同源映射。不因文档更新增加网络请求、安装依赖或修改性能阈值。
- 计划中超过门禁的文件先按职责拆分；当前约 551 行示例文件本轮只纠正已有说明，没有新增功能或继续扩张职责。
- 提交前检查 diff、本地链接、入门一致性及统一门禁；文档附带的应用正文修改也运行 Electron smoke。排除 `.paperin`、草稿与生成产物。

本轮实际验证：入门一致性测试通过；lint、typecheck、223 文件/1603 测试、build、smoke、a11y、verify:ci-config 均退出 0（含第二遍修正后复验）。环境为 Windows / Node 24.19.0，不冒充 Node 22 发行验收。主题 254 项检查、37 项存量豁免，焦点扫描无违规；真实 IME/缩放矩阵仍未执行。性能、审计、安装、长期稳定和真人样本未重跑/未采集，不将它们改为绿灯。

返回 [文档索引](../README.md) · [开发资料](_index.md)。
