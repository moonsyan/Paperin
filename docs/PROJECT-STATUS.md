# Paperin 项目状态

更新时间：2026-09-23（Asia/Shanghai）
代码核对基线：`e7ed2e9`。逐篇来源、重定位、索引失效、缓存和有界搜索语料等旧任务已有实现；本次复审另发现工作区状态目录越界、来源身份/路径迁移、测试装配和性能红灯，不能再称“全部可自动化代码任务已完成”。

产品版本：`0.7.0`

> 本文只记录当前状态，不保存逐批实施日志。历史任务、提交与当时的验证结果由 Git 历史承担。当前战略见[产品战略发展报告](PRODUCT-STRATEGY-REVIEW-2026-09-23.md)，端到端任务见[产品整体工作流](PRODUCT-WORKFLOW.md)，执行顺序见[产品工作流实施计划](superpowers/plans/2026-09-22-product-workflow-implementation.md)。

## 当前结论

Paperin 已有完整的 Electron 本地桌面架构和较密集的自动测试；搜索语料、索引失效、按文档来源基线与显式重定位、支持摘要、兼容夹具 smoke、安装验收脚本与导出接收方矩阵骨架等能力已落地。新鲜审查同时证明路径、来源身份、测试和性能门禁仍有阻断。当前最准确的阶段是：

> 已有早期公开发行记录、正在打磨 0.7.0 的个人桌面产品；核心功能较齐备，仍处于种子使用与可靠性验证期。

目前不能称为稳定公开版。A01/A02/A03/A08 的路径与来源问题、默认测试和性能门禁需要先收敛；Windows **隔离环境实测**安装、两位用户任务记录、真机拼音/缩放矩阵与真实接收方软件仍为 **UNVERIFIED**。

## 产品定位

> Paperin 是本地优先的 Markdown 写作与知识工作台，让文章、笔记和项目资料在同一个空间中持续积累、相互复用，并形成可维护、可交付的成果。

短表达：**安心写作，让知识持续产生作品。**

当前核心任务：

```text
打开自己的资料
  -> 找到相关内容和来源
  -> 写成当前结论
  -> 安全保存并继续维护
  -> 交付 Markdown / HTML / PDF / Word 等成果
```

## 新鲜门禁结果

本次复验（2026-09-23，Windows / Node 24.19.0，基线 `e7ed2e9`）：lint、typecheck、build、a11y（254 项、37 项基线豁免）、smoke、`smoke --compatibility`、verify:ci-config 退出 0。默认测试与两类性能命令退出 1；详细根因和指标见[审查证据](development/reviews/2026-09-23-product-state-audit.md)。安装循环真人实测、种子用户、8 小时与第二设备、真机 IME/缩放仍为 **UNVERIFIED**。

| 检查 | 当前判断 |
| --- | --- |
| lint / typecheck / build / a11y / smoke / verify:ci-config | 2026-09-23 新鲜通过 |
| `npm run test` | exit 1：238 文件通过、1 文件因可执行脚本 shebang 的 Vite SSR 转换问题收集失败；1705 项已收集测试通过 |
| `smoke --compatibility` | 合成夹具只读 hash 门禁通过；≠ 真实导出兼容 |
| `perf:regression` / `perf:production` | exit 1；watcher 稳定 P95 两次约 9.7–9.9 秒，合成 tree/index/search 三项超阈值 |
| npm audit | 完整树 4 moderate、13 high、2 critical；生产依赖分类的较早重跑为 0，后续确认遇到 registry 504，须按实际分发路径继续分流 |

## 当前阻断和优先级

| 优先级 | 状态 | 完成定义 |
| --- | --- | --- |
| P0 | 修复工作区规范路径比较 | **已完成**：不存在目标使用最近存在父目录的真实路径比较；短路径/长路径、junction 换靶和多窗口越权有回归；`npm run smoke` 退出 0 |
| P0 | 修正生产搜索性能夹具授权 | **已完成**：夹具调用真实 `trustDirectory` 与 `isPathTrusted`，搜索 IPC 不再因测试装配返回 `INVALID_TARGET` |
| P0 | 修复工作区状态目录越界 A01 | **已完成**：`WorkspaceStateStore` 对 `.paperin`/目标/临时文件做 realpath 边界校验；库外 junction 时读回退默认、写抛 `INVALID_PATH`；永久回归覆盖 |
| P0 | 诊断 5000 篇性能退化 | 分段指标、语料复用与冷/暖门禁已落地；2026-09-23 watcher 稳定 P95 两次超过阈值，合成 tree/index/search 也为红。先 profiling，再修复；不得用历史绿灯或放宽阈值替代 |
| P0 | 升级易受攻击的间接依赖 | **已完成**：生产依赖审计无 moderate 及以上漏洞；`js-yaml` 由 4.3.1 升至 4.3.2，锁文件门禁拒绝回退 |
| P0 | 清理失效 `demo:soft*` 脚本 | **已完成**：`package.json` 不再引用不存在的 `design/soft-workbench` |
| P0 | 收紧联网与外部服务凭据 | **已完成**：生产环境默认检查/下载/退出安装，设置中有可见开关，关闭后下次启动不联网也不安装已下载包。开发环境永不检查。SM.MS token 经 `safeStorage` 加密；渲染进程只有 `configured`/`credentialState`；明文迁移失败与安全存储不可用均禁用远程上传并回退本地附件 |
| P0 | 补齐许可、隐私与 Windows 候选材料 | **材料已提交**：`LICENSE`、`THIRD-PARTY-NOTICES.md`、`PRIVACY.md`、`SECURITY.md` 与四类 Issue 模板；`validateReleaseMaterials` 拒绝缺文件。`scripts/verify-windows-install.mjs` 与单测已建立（dry-run/脱敏门禁）；Windows 两套隔离环境真实安装/升级/卸载循环仍为 **UNVERIFIED** |
| P1 | 验证 15 分钟首次核心闭环 | **自动链路已完成**：`runCoreTaskSmoke` 按真实 UI 覆盖来源查找、插入引用、保存重开、资源包导出，`npm run smoke` 退出 0。无口头帮助的真人 15 分钟样本为 **UNVERIFIED** |
| P1 | 完成两位现有用户任务记录 | 两周内每人至少 3 次真实任务，记录阻塞、成果和再次使用理由，不计算虚假留存率 |
| P1 | 修复来源身份与路径迁移 A02/A03/A08 | **已完成**：显式保存身份映射（禁止切标签猜测迁移）；晚到 stat 经映射归属；rename/move 接线 `remapSourceTrackingPath`（含目录前缀）；永久回归覆盖 |
| P1 | 恢复默认测试门禁 A10 | 安装验收测试的可执行 `.mjs` 经 Vite SSR 转换后 shebang 落在模块中间；修复测试装配并执行全量回归 |
| P1 | 日志脱敏与安装验收闭环 A05 | 主进程异常日志可能含路径；安装脚本 live 分支仍为骨架，正式发布未绑定安装证据 |
| P1 | 监听故障可见降级 A04 | watcher 启动失败静默、语料命中分支缺新鲜度校验；需故障注入后再定用户可见行为 |
| P2 | 来源健康与变化提示 | 按文档基线、复核、显式重定位已落地，但 A02/A03/A08 修复前不能视为可靠闭环；真人重定位任务与两设备 8 小时仍为 **UNVERIFIED** |
| P2 | 可见契约收敛 A09 | 拼写检查设置对正文无效；部分弹窗无统一焦点闭环；首次体验暴露 `R11_SYNTH_*` 测试标记 |
| P2 | 发布配置与交付报告 | **代码已完成**：工作区可保存最多 20 条发布配置；HTML 资源包含 `reports/paperin-delivery-report.json`，不含正文、绝对路径或搜索词。接收方阅读与真人专业交付验证仍为后续门槛 |
| P2 | 长期稳定性门禁 | **代码已完成**：五结构 5 MiB 夹具与 `summarizeStability`（30 分钟基线窗口 vs 末两小时，增长须 ≤15% 且 ≤100 MiB，watcher 不得增多）。`--stability-hours 8` 可启动采样；两设备 8 小时实测为 **UNVERIFIED** |

完整依赖、文件、失败测试和验证命令见[产品工作流实施计划](superpowers/plans/2026-09-22-product-workflow-implementation.md)。

## 已有能力与证据边界

2026-09-22 代码/功能补充审阅（基线 `7c3dd53`）项对照：**P0-02 Main 搜索语料**与 **P1-08 索引释放/缓存边界**已落地；**P1-06 来源异步生命周期**与 **P1-07 按文档来源基线/复核**已落地；**P0-07 引用目标变化后的索引失效**已在 Main 索引服务与 watcher 测试覆盖。历史静态证据见[冻结审阅](development/reviews/2026-09-22-code-function-review.md)；当前缺口以 A01–A10 为准。

| 能力 | 当前代码状态 | 仍未证明 |
| --- | --- | --- |
| Markdown 写作 | GFM、表格、任务列表、代码、公式、Mermaid、脚注、frontmatter、查找替换和粘贴转换 | 真实中文 IME、复杂 5 MiB 文档和长期编辑 |
| 工作区 | 文件树、外部文件、多标签、最近、收藏、路径条和窄窗口抽屉 | 安装态文件关联未验证 |
| 知识复用 | 全文/结构搜索、标签、Wiki 链接、反链、图谱、搜索/反链插入来源；插入后来源 mtime 可在质量面板提示变化或缺失 | A02/A03/A08 的身份和路径正确性；外部用户是否更快完成真实任务 |
| 文件安全 | 编码校验、冲突检测、保存队列、恢复日志、回收站删除、草稿和关闭保护 | 真实磁盘满、进程终止、多窗口和跨平台完整故障矩阵 |
| 导出交付 | Markdown、HTML、PDF、DOCX、Pandoc、集合资源包、可复用发布配置和脱敏交付报告；[export-recipient-matrix](development/export-recipient-matrix.md) 已列出写出侧保证/不保证 | 接收方软件打开、打印、字体和安装态完整矩阵仍为 **UNVERIFIED** |
| 发行 | 三平台构建配置、Draft 候选、显式正式发布门禁；更新可关闭；许可/隐私/安全入口已提供 | Windows 安装循环、macOS 签名/公证、Linux 桌面集成均为 UNVERIFIED |
| 团队/企业 | 标准文件可经 Git、共享目录或现有知识平台传递 | 身份、权限、审计、评论、审批、实时协作和运维控制面均不存在 |

## 文件规模债务

2026-09-23 对 `src/` 非测试/性能 TS/TSX 的复核中，以下 8 个生产文件超过 450 行门禁。它们不是立即整仓重构的理由，但触及对应职责时必须按职责拆分并补直接测试：

| 文件 | 行数 | 主要职责 |
| --- | ---: | --- |
| `src/renderer/src/app/AppComposition.tsx` | 771 | 页面编排、来源重定位状态和异步处理 |
| `src/renderer/src/lib/docx.ts` | 613 | OOXML、关系、图片、样式与转换 |
| `src/renderer/src/data/demo-files.ts` | 552 | 内置示例文档正文 |
| `src/renderer/src/app/useAppSettings.ts` | 538 | 设置加载、状态与持久化装配 |
| `src/renderer/src/components/Editor/overlays/useEditorOverlays.ts` | 486 | 编辑器浮层与交互生命周期 |
| `src/renderer/src/components/Editor/plugins/mermaidCodeBlock.ts` | 484 | Mermaid 代码块渲染与源码回退 |
| `src/renderer/src/app/AppDialogs.tsx` | 470 | 对话框装配与参数传递 |
| `src/renderer/src/components/Editor/instance/useMilkdownInstance.ts` | 462 | Milkdown 插件注册和实例生命周期 |

## 明确未验证

- Windows 安装包在两个隔离环境中的安装、升级、卸载、文件关联和用户文件保留。
- macOS 签名/公证、Finder 关联；Linux MIME、字体和桌面集成。
- 真实磁盘满、权限拒绝、进程终止、硬件掉电；硬件故障不在零丢失承诺范围。
- 复杂结构 5 MiB 文档的重复测量、第二台 16 GB/SSD 设备和 8 小时稳定性（夹具与汇总函数已具备，实测为 UNVERIFIED）。
- 九主题 × 100/125/150% 缩放 × 窄窗口，以及真实系统中文输入法。
- 正文拼写检查开关、部分弹窗的焦点闭环和测试化首次体验的修复与真人确认。
- 两位现有用户的有效观察、6–8 位 Alpha 发现轮、12 人 U01/U02 确认轮、两批 W2/W4 留存、真实付款和团队需求。

## 执行顺序

1. 先修复 A01 路径越界和 A02/A03/A08 来源身份/路径问题，永久回归覆盖实际用户行为。
2. 恢复默认测试门禁，对重复性能红灯完成 profiling 和修复；不得用历史绿灯或放宽阈值替代。
3. 补齐监听故障、日志脱敏和 Windows 安装/升级/关联/保存/卸载/数据保留闭环；材料齐全不等于已发布。
4. 收敛拼写检查、弹窗焦点、首次体验及导出预检等用户可见契约；同步完成两位用户三类真实任务观察。
5. 外部 Alpha 发现成功后再进入确认、长期稳定、接收方验证和付款实验；至少 3 个团队连续两个周期重复同类需求后才评审团队方案。

本状态页每次只接受新鲜证据更新。已完成工程任务的旧编号、逐批日志和旧计划不再复制到这里。

### P0-06 进程中断保存恢复（2026-09-22）

- **范围**：`src/main/testing/write-recovery-child.ts`、`write-recovery-process.test.ts`；生产 `file-write-recovery.ts` 未改。
- **证据**：Windows / Node 24.19.0 下 `npx vitest run src/main/testing/write-recovery-process.test.ts` 通过；五阶段（`preparing`/`prepared`/`target-copy`/`target-synced`/`committed`）各 20 次真进程 `SIGKILL` 后 `recoverInterruptedFileWrite` 符合契约，二次恢复幂等。
- **未覆盖**：磁盘满/权限、安装态、双窗口竞争、硬件掉电；见 [file-write-recovery.md](file-write-recovery.md) 与 Q01 其余项。
