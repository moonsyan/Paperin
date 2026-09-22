# Paperin 项目状态

更新时间：2026-09-22（Asia/Shanghai）
代码核对基线：`fb2f0a3`；本批已完成全部可自动化代码任务（含 P1-03 自动部分、P2-02 显式重定位、P1-04 事件接线、兼容 smoke、导出接收方矩阵骨架）。仍待：隔离安装实测、真人研究、真机 IME/缩放矩阵、接收方软件实测。

产品版本：`0.7.0`

> 本文只记录当前状态，不保存逐批实施日志。历史任务、提交与当时的验证结果由 Git 历史承担。当前战略见[产品战略发展报告](PRODUCT-STRATEGY-REVIEW-2026-09-22.md)，端到端任务见[产品整体工作流](PRODUCT-WORKFLOW.md)，执行顺序见[产品工作流实施计划](superpowers/plans/2026-09-22-product-workflow-implementation.md)。

## 当前结论

Paperin 已有完整的 Electron 本地桌面架构和较密集的自动测试；搜索语料、索引失效、按文档来源基线与显式重定位、支持摘要、兼容夹具 smoke、安装验收脚本与导出接收方矩阵骨架等代码任务已落地。当前最准确的阶段是：

> 工程化程度较高的个人产品候选，处于私有种子验证和发行门禁收敛期。

目前不能称为稳定公开版。Windows **隔离环境实测**安装、两位用户任务记录、真机拼音/缩放矩阵与真实接收方软件仍为 **UNVERIFIED**。

## 产品定位

> Paperin 是面向个人技术写作者和独立开发者的本地 Markdown 项目知识工作台，帮助用户把散落的项目资料写成带来源、可持续维护、可直接交付的文档。

短表达：**把项目资料，写成能交付、能继续维护的文档。**

当前核心任务：

```text
打开自己的资料
  -> 找到相关内容和来源
  -> 写成当前结论
  -> 安全保存并继续维护
  -> 交付 Markdown / HTML / PDF / Word 等成果
```

## 新鲜门禁结果

本批收尾复验（2026-09-22，Windows / Node 24.19.0，基线 `fb2f0a3`）：lint、typecheck、**239** 文件/**1717** 测试、build、a11y（254/37）、smoke、`smoke --compatibility`、verify:ci-config 均退出 0。安装循环真人实测、种子用户、8 小时与第二设备、真机 IME/缩放仍为 **UNVERIFIED**。

| 检查 | 当前判断 |
| --- | --- |
| lint / typecheck / test / build / a11y / smoke / verify:ci-config | 本批收尾新鲜通过（1717 测试） |
| `smoke --compatibility` | 合成夹具只读 hash 门禁通过；≠ 真实导出兼容 |
| perf:regression / perf:production | 本机近期曾连续通过；不替代固定 Node 22 / 安装态 |
| npm audit | 本批未强制重跑 |

## 当前阻断和优先级

| 优先级 | 状态 | 完成定义 |
| --- | --- | --- |
| P0 | 修复工作区规范路径比较 | **已完成**：不存在目标使用最近存在父目录的真实路径比较；短路径/长路径、junction 换靶和多窗口越权有回归；`npm run smoke` 退出 0 |
| P0 | 修正生产搜索性能夹具授权 | **已完成**：夹具调用真实 `trustDirectory` 与 `isPathTrusted`，搜索 IPC 不再因测试装配返回 `INVALID_TARGET` |
| P0 | 诊断 5000 篇性能退化 | **代码侧已收敛（P0-01/02/03）**：分段指标、语料复用与冷/暖门禁已落地；本机最新连续 perf 退出 0。隔离/固定 Node22 环境与安装态性能仍待复核，不得用本机单次结果宣称全平台达标 |
| P0 | 升级易受攻击的间接依赖 | **已完成**：生产依赖审计无 moderate 及以上漏洞；`js-yaml` 由 4.3.1 升至 4.3.2，锁文件门禁拒绝回退 |
| P0 | 清理失效 `demo:soft*` 脚本 | **已完成**：`package.json` 不再引用不存在的 `design/soft-workbench` |
| P0 | 收紧联网与外部服务凭据 | **已完成**：生产环境默认检查/下载/退出安装，设置中有可见开关，关闭后下次启动不联网也不安装已下载包。开发环境永不检查。SM.MS token 经 `safeStorage` 加密；渲染进程只有 `configured`/`credentialState`；明文迁移失败与安全存储不可用均禁用远程上传并回退本地附件 |
| P0 | 补齐许可、隐私与 Windows 候选材料 | **材料已提交**：`LICENSE`、`THIRD-PARTY-NOTICES.md`、`PRIVACY.md`、`SECURITY.md` 与四类 Issue 模板；`validateReleaseMaterials` 拒绝缺文件。`scripts/verify-windows-install.mjs` 与单测已建立（dry-run/脱敏门禁）；Windows 两套隔离环境真实安装/升级/卸载循环仍为 **UNVERIFIED** |
| P1 | 验证 15 分钟首次核心闭环 | **自动链路已完成**：`runCoreTaskSmoke` 按真实 UI 覆盖来源查找、插入引用、保存重开、资源包导出，`npm run smoke` 退出 0。无口头帮助的真人 15 分钟样本为 **UNVERIFIED** |
| P1 | 完成两位现有用户任务记录 | 两周内每人至少 3 次真实任务，记录阻塞、成果和再次使用理由，不计算虚假留存率 |
| P2 | 来源健康与变化提示 | **P1-07 + P2-02 代码已落地**：按文档基线、复核、显式重定位（默认不改正文，可选可撤销链接更新）。真人重定位任务与两设备 8 小时仍为 **UNVERIFIED** |
| P2 | 发布配置与交付报告 | **代码已完成**：工作区可保存最多 20 条发布配置；HTML 资源包含 `reports/paperin-delivery-report.json`，不含正文、绝对路径或搜索词。接收方阅读与真人专业交付验证仍为后续门槛 |
| P2 | 长期稳定性门禁 | **代码已完成**：五结构 5 MiB 夹具与 `summarizeStability`（30 分钟基线窗口 vs 末两小时，增长须 ≤15% 且 ≤100 MiB，watcher 不得增多）。`--stability-hours 8` 可启动采样；两设备 8 小时实测为 **UNVERIFIED** |

完整依赖、文件、失败测试和验证命令见[产品工作流实施计划](superpowers/plans/2026-09-22-product-workflow-implementation.md)。

## 已有能力与证据边界

2026-09-22 代码/功能补充审阅（基线 `7c3dd53`）待办：**P0-02 Main 搜索语料**与 **P1-08 索引释放/缓存边界**已落地；**P1-06 来源异步生命周期**与 **P1-07 按文档来源基线/复核**已落地（本提交）。**P0-07 引用目标变化后的索引失效**已在 Main 索引服务与 watcher 测试覆盖。具体静态证据见[审阅记录](development/reviews/2026-09-22-code-function-review.md)。

| 能力 | 当前代码状态 | 仍未证明 |
| --- | --- | --- |
| Markdown 写作 | GFM、表格、任务列表、代码、公式、Mermaid、脚注、frontmatter、查找替换和粘贴转换 | 真实中文 IME、复杂 5 MiB 文档和长期编辑 |
| 工作区 | 文件树、外部文件、多标签、最近、收藏、路径条和窄窗口抽屉 | 安装态文件关联未验证 |
| 知识复用 | 全文/结构搜索、标签、Wiki 链接、反链、图谱、搜索/反链插入来源；插入后来源 mtime 可在质量面板提示变化或缺失 | 外部用户是否更快完成真实任务；移动文件后的人工重定位 |
| 文件安全 | 编码校验、冲突检测、保存队列、恢复日志、回收站删除、草稿和关闭保护 | 真实磁盘满、进程终止、多窗口和跨平台完整故障矩阵 |
| 导出交付 | Markdown、HTML、PDF、DOCX、Pandoc、集合资源包、可复用发布配置和脱敏交付报告；[export-recipient-matrix](development/export-recipient-matrix.md) 已列出写出侧保证/不保证 | 接收方软件打开、打印、字体和安装态完整矩阵仍为 **UNVERIFIED** |
| 发行 | 三平台构建配置、Draft 候选、显式正式发布门禁；更新可关闭；许可/隐私/安全入口已提供 | Windows 安装循环、macOS 签名/公证、Linux 桌面集成均为 UNVERIFIED |
| 团队/企业 | 标准文件可经 Git、共享目录或现有知识平台传递 | 身份、权限、审计、评论、审批、实时协作和运维控制面均不存在 |

## 文件规模债务

2026-09-22 审查沿用的生产文件统计中，以下文件超过 450 行门禁。它们不是立即整仓重构的理由，但触及对应职责时必须先拆分并补直接测试：

| 文件 | 行数 | 主要职责 |
| --- | ---: | --- |
| `src/renderer/src/lib/docx.ts` | 599 | OOXML、关系、图片、样式与转换 |
| `src/renderer/src/data/demo-files.ts` | 551 | 内置示例文档正文 |
| `src/renderer/src/app/useAppSettings.ts` | 538 | 设置加载、状态与持久化装配 |
| `src/renderer/src/components/Editor/overlays/useEditorOverlays.ts` | 486 | 编辑器浮层与交互生命周期 |
| `src/renderer/src/components/Editor/plugins/mermaidCodeBlock.ts` | 484 | Mermaid 代码块渲染与源码回退 |
| `src/renderer/src/app/AppComposition.tsx` | 478 | 页面编排与对话框装配 |
| `src/renderer/src/components/Editor/instance/useMilkdownInstance.ts` | 462 | Milkdown 插件注册和实例生命周期 |

## 明确未验证

- Windows 安装包在两个隔离环境中的安装、升级、卸载、文件关联和用户文件保留。
- macOS 签名/公证、Finder 关联；Linux MIME、字体和桌面集成。
- 真实磁盘满、权限拒绝、进程终止、硬件掉电；硬件故障不在零丢失承诺范围。
- 复杂结构 5 MiB 文档的重复测量、第二台 16 GB/SSD 设备和 8 小时稳定性（夹具与汇总函数已具备，实测为 UNVERIFIED）。
- 九主题 × 100/125/150% 缩放 × 窄窗口，以及真实系统中文输入法。
- 两位现有用户的有效观察、6–8 位 Alpha 发现轮、12 人 U01/U02 确认轮、两批 W2/W4 留存、真实付款和团队需求。

## 执行顺序

1. 先为搜索建立分段指标，复现并修复 5000 篇合成索引/搜索和生产搜索红灯；不得用历史绿灯或放宽阈值替代。
2. ~~对齐 GitHub 发布元数据与 Gitee `origin`~~ **P0-04 本地已完成**：`repository`/`homepage`/`bugs`/`build.publish` 与 `validateReleaseIdentity` 门禁；已删除旧 `sync-gitee.js`。GitHub Draft 可达性与远端 push 仍为 **UNVERIFIED**（未改 `origin`、未 push tag）。
3. 完成 Windows 两个隔离环境的安装、升级、文件关联、保存、卸载和用户文件保留循环；材料齐全不等于已发布。
4. 来源异步隔离、逐篇基线、索引失效与缓存校验可以提前推进；同步完成两位现有用户两周观察，研究驱动增量只选最大阻塞。P0、补充正确性任务及种子阻塞解决后才进入外部 Alpha。
5. Alpha 发现轮成功后进入 P2-05 确认轮、长期稳定与接收方验证，再做两批 W2/W4 队列和有条件付款实验；至少 3 个团队连续两个周期重复同类需求后才进入团队方案。

本状态页每次只接受新鲜证据更新。已完成工程任务的旧编号、逐批日志和旧计划不再复制到这里。

### P0-06 进程中断保存恢复（2026-09-22）

- **范围**：`src/main/testing/write-recovery-child.ts`、`write-recovery-process.test.ts`；生产 `file-write-recovery.ts` 未改。
- **证据**：Windows / Node 24.19.0 下 `npx vitest run src/main/testing/write-recovery-process.test.ts` 通过；五阶段（`preparing`/`prepared`/`target-copy`/`target-synced`/`committed`）各 20 次真进程 `SIGKILL` 后 `recoverInterruptedFileWrite` 符合契约，二次恢复幂等。
- **未覆盖**：磁盘满/权限、安装态、双窗口竞争、硬件掉电；见 [file-write-recovery.md](file-write-recovery.md) 与 Q01 其余项。
