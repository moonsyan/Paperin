# Paperin 当前完成度

更新时间：2026-09-21（Asia/Shanghai）

## 昨日提交后的当前状态

截至 `b31ace3`（2026-09-20 22:05，当前 `master`）：

- **R00–R11 工程任务已完成对应代码交付**，提交依次为 `bead366`、`971c692`、`d1eeeb7`、`8e85531`、`6dbd297`、`35e5cd8`、`8bf3d25`、`48fa84b`、`ca59809`、`aef5ddb`、`447f0a5`。
- **R10 的候选发布门禁**已完成配置测试，但 `build:win`、真实安装/升级/卸载和三平台签名仍未执行，不能写成已发布。
- **R12 的文档与研究协议**已提交（`b31ace3`）；观察表仍为空，R13–R16 均为条件未满足、未执行。
- **R17 只完成维护文档和门禁账本增量**；根 `LICENSE`、实际安装包验证和超限文件拆分仍是明确缺口。

后续阅读顺序：先看本摘要和下方 R12/R17，工程细节看对应 R00–R11 条目；下一项不是自动开始 R13，必须先补齐 R10 安装证据并完成 R12 观察数据。

## R12 文档结项（feat/strategy-execution）

**任务号：** R12（用户研究，非功能）  
**提交：** `b31ace3`
**交付：** [user-research/_index.md](development/user-research/_index.md)、[seed-study-2026-09.md](development/user-research/seed-study-2026-09.md)；R13–R16 占位说明 **条件未满足，未执行**。  
**数据边界：** 参与者 A/B 任务表与背景字段均为 **未采集**；最大三个阻塞 **未采集**；不报留存率。  
**工程对照：** seed 研究文档 §5 链接 R01–R11 残留 **UNVERIFIED** 边界，**不**代表用户已遇到。  
**计划 §15：** 访谈/观察行未勾选；代码影响对照与文档提交已做。  
**下一项：** 真实两周观察填表后，再评估 R13 条件（仍依赖 R10 安装证据）。

## R17 增量（feat/strategy-execution，本轮文档）

- README 与 [compatibility-matrix](compatibility-matrix.md) 仍将引用插入、写作模板记为**已有实现**；平台安装、用户任务与商业验证 **未** 写成已完成。
- **许可缺口：** 根目录无 `LICENSE`；`package.json` 的 MIT 不足以覆盖全部分发权利；见 [docs/README.md](README.md)「许可与分发材料」。Chromium 相关声明不删除。
- **超限账本：** 见下文「仍超过行数门禁」表（2026-09-20 实数）。

## R10 结项（feat/strategy-execution）

**任务号：** R10  
**提交：** `11b696e`
**工程变更：** `release.yml` 拆为候选链（`gate` → `candidate-acceptance`/`npm run smoke` → 三平台打包 → `candidate-release` draft + `candidate-record.txt`）与 `publish-formal`（`confirm_publish=PUBLISH` + `candidate_sha` 与 draft commit 一致后才 `gh release edit --draft=false`）；`push v*` 不再无条件正式发布。  
**配置测试：** `scripts/ci-config-gates.mjs`、`scripts/verify-ci-config.test.mjs`；缺 smoke 或无条件 `draft: false` 时校验失败。  
**全量门禁：** `npm run lint` 0；`npm run typecheck` 0；`npm run test` 0（**212** 文件 **1549** 项，含 `verify-ci-config.test.mjs`）；`npm run build` 0；`npm run build:win` **未执行**。  
**文档：** `docs/development/release-validation.md`；计划 §13 复选框（安装循环与 `build:win` 未勾选）。  
**安装 / 升级：** **未执行** — 不宣称安装成功；2 环境 × 3 循环及更新场景均为 **UNVERIFIED**。  
**下一项：** R13（用户研究，依赖 R10/R11/R12 条件）

## R11 结项（feat/strategy-execution）

**任务号：** R11  
**提交：** `447f0a5`
**产品变更：** 开始页 / 合成示例树 / README / package 描述统一为「打开资料 → 用来源写一段技术说明」；首屏列出资料、模板与「插入引用」可发现动作；开库时图谱标签出现但**不自动激活**（避免打断首次任务，见 `useGraphView.ts`）。  
**失败测试（修复前）：** `useGraphView` 开库即 `graphTabActive=true`；开始页与 README/package 任务表述不一致；示例树缺少旧笔记 / 技术草稿 / 来源资料合成夹具。  
**修复后结果：** `useGraphView.test.ts` 8/8；`StartScreen/index.test.tsx` 4/4；`r11-core-task-entry.test.ts` 9/9；`r11-fixture-contract.test.ts` 1/1；`demo-files.test.ts` 1/1；全量 **211** 文件 **1546** 项通过（以当次 `npm run test` 为准）。  
**全量门禁：** `npm run lint` 0；`npm run typecheck` 0；`npm run test` 0；`npm run build` 0；`npm run smoke` **0**；  
**文档：** 计划 §14 研发子项；`command-panels.md` 引用入口；README / package description。  
**用户研究边界：** 两位用户无口头提示演示 = **未执行**（不宣称通过）。  
**实际工时：** ~（自动化记录）  
**后续状态：** R10 已于 `11b696e` 完成；本条“下一项”仅保留当时执行顺序，不代表当前待办。

## R09 结项（feat/strategy-execution）

**任务号：** R09  
**提交：** `aef5ddb`
**失败测试（修复前）：** Electron 冒烟 React **#301**（`AppComposition` 渲染期调用 `syncFromSettings` → 无限重渲染）；`SMOKE_FAIL 系统关联文件未进入外部标签`（#301 的连带症状）；`perf:electron` 资源包导出 `INVALID_PATH`（性能工作区未 `allowExportDirectory`）。  
**修复后结果：** `useSessionPersistReady.test.tsx` 2/2；`fixtures.test.ts` 4/4；`document-collection.test.ts` R09 导出 1/1；全量 **209** 文件 **1536+** 项通过（以当次 `npm run test` 为准）。  
**全量门禁：** `npm run lint` 0；`npm run typecheck` 0；`npm run test` 0；`npm run build` 0；`npm run smoke` **0**（#301 已修复）；`npm run perf:electron` **0**（`ELECTRON_PERF_METRICS` 见 `performance-baseline.md`）；`npm run perf:production` **1/2**（索引门禁通过；`workspace-search-watch-production.perf.ts` 仍 `INVALID_TARGET`，与 R05 同 harness 缺口，非夹具回归）。  
**文档：** 计划 §12 复选框；`development/performance-baseline.md` R09 体验预算对照；`compatibility-matrix.md` 夹具行。  
**人工边界：** M01 多结构 5 MiB ×20 次 Electron、普通输入 P95、第二台 16GB 设备、8 小时稳定性、磁盘满/进程 kill — **UNVERIFIED**（未改体验目标）。  
**实际工时：** ~2h（自动化记录）  
**后续状态：** R11 已于 `447f0a5` 完成；本条“下一项”仅保留当时执行顺序，不代表当前待办。

## R08 结项（feat/strategy-execution）

**任务号：** R08  
**提交：** `ca59809`
**失败测试（修复前）：** A07——工作区搜索/发布弹窗缺少 dialog 语义、Tab 约束与一致焦点恢复；Escape 在 IME 组合态可能误关；发布 busy 时 Escape 策略未与导出取消对齐。  
**修复后结果：** `useModalDialogKeyboard.test.tsx` 9/9；`WorkspaceSearchDialog/index.test.tsx` 4/4；`PublishDialog/index.test.tsx` 8/8（含 R04）；全量 **208** 文件 **1530** 项通过。  
**全量门禁：** `npm run lint` 0；`npm run typecheck` 0；`npm run test` 0（1530 passed）；`npm run build` 0；`npm run a11y` 0；`npm run smoke` **未重跑**（React **#301** + 系统关联标签，非 R08 回归）。  
**文档：** 计划 §11 复选框；`docs/ACCESSIBILITY-SMOKE.md` R08 节与主题豁免复核。  
**人工边界：** 九主题×100/125/150%×窄窗口矩阵与真机中文 IME 仍待 Electron 手测；37 项主题基线豁免未机械删除。  
**实际工时：** ~1h（自动化记录）  
**下一项：** R09（本任务未启动）

## R07 结项（feat/strategy-execution）

**任务号：** R07  
**提交：** `48fa84b`
**失败测试（修复前）：** A07——fresh 窗口共享 drafts 竞态；草稿写失败被静默吞掉；状态栏不区分落盘与草稿备份；多窗口同路径可互相覆盖；重启后外部改盘缺少可验证边界。  
**修复后结果：** `draft-storage.test.ts` 6/6；`settings-store.draft.test.ts` 2/2；`useDraftPersistence.test.ts` 4/4；`useDocumentRestore.test.ts` 3/3；`version-store.test.ts` 8/8；`document-save-status.test.ts` 3/3；全量 **206** 文件 **1512** 项通过。  
**全量门禁：** `npm run lint` 0；`npm run typecheck` 0；`npm run test` 0（1512 passed）；`npm run build` 0；`npm run smoke` **未重跑**（React **#301** + 系统关联标签，真实双窗口双重启仍阻塞，非 R07 回归）。  
**文档：** 计划 §10 复选框；`docs/file-write-recovery.md` 草稿/历史边界。  
**人工边界：** 真实双 Electron 窗口连续重启端到端仍受 React #301 冒烟阻塞；Main `draftSessionId` + `DRAFT_SESSION_CONFLICT` 与状态栏「草稿已备份」已固化。  
**实际工时：** ~1.5h（自动化记录）  
**下一项：** R08（已完成，见上）

## R06 结项（feat/strategy-execution）

**任务号：** R06  
**提交：** `8bf3d25`
**失败测试（修复前）：** A06——根/目录/无名 watch 事件被 Markdown 过滤器丢弃（探针 0 回调）；单篇读取失败可拖垮整库；watcher 无法区分增量路径与目录级 rescan。  
**修复后结果：** `workspace-file-watcher.test.ts` 12/12；`workspace-index-service.test.ts` 11/11；`workspace-search-coverage.test.ts` 9/9（沿用 R05）；`workspace-coverage.test.ts` 2/2；全量 **203** 文件 **1496** 项通过。  
**全量门禁：** `npm run lint` 0；`npm run typecheck` 0；`npm run test` 0（1496 passed）；`npm run build` 0；`npm run perf:workspace-search-watch` **1/2**（20k watcher 合并通过；5000 篇搜索 IPC 仍 `INVALID_TARGET`，与 R05 同 harness 缺口，非 watcher 回归）；`npm run smoke` **未重跑**（React **#301** + 系统关联标签，非 R06 回归）。  
**文档：** 计划 §9 复选框；`DiagnosticCode.READ_ERROR`；watcher `WorkspaceChange` 契约。  
**人工边界：** 真实 OS 目录 watch 分布仍依赖平台；冒烟仍被 React #301 阻塞端到端。  
**实际工时：** ~1h（自动化记录）  
**下一项：** R07（本任务未启动）

## R05 结项（feat/strategy-execution）

**任务号：** R05  
**提交：** `35e5cd8`
**失败测试（修复前）：** A05——超大/超深/超预算漏扫仍可能呈现「完整无结果」；搜索与索引覆盖口径分散；旧查询响应可覆盖 UI。  
**修复后结果：** `workspace-search-coverage.test.ts` 9/9；`useWorkspaceSearch.test.ts` 3/3；`workspace-index-service.test.ts` 9/9；`workspace-coverage.test.ts` 2/2；全量 **203** 文件 **1488** 项通过。  
**全量门禁：** `npm run lint` 0；`npm run typecheck` 0；`npm run test` 0（1488 passed）；`npm run build` 0；`npm run smoke` **未重跑**（与 R00–R04 相同：React **#301** + `SMOKE_FAIL 系统关联文件未进入外部标签`，非 R05 回归）。  
**文档：** `docs/compatibility-matrix.md` 扫描预算表；计划 §8 复选框。  
**人工边界：** 冒烟仍被 React #301 阻塞端到端；5000 篇搜索尾部命中已在 `workspace-search-coverage.test.ts` 固化（约 2.2s）。跳过计数仅本地诊断，不进遥测。  
**实际工时：** ~1.5h（自动化记录）  
## R04 结项（feat/strategy-execution）

**任务号：** R04  
**提交：** `6dbd297`  
**失败测试（修复前）：** A04——内联 `failed>0` 仍 toast 成功；空标签静默回退 `kind:document`；集合模式仍可点富文本复制；不完整索引可集合导出。  
**修复后结果：** `PublishDialog/index.test.tsx` 3/3；`usePublishFlow.test.ts` 4/4；`resolve-collection-entries.test.ts` 5/5；`export-bundle.test.ts` +2；全量 **200** 文件 **1474** 项通过。  
**全量门禁：** `npm run lint` 0；`npm run typecheck` 0；`npm run test` 0（1474 passed）；`npm run build` 0；`npm run smoke` **exit 1**（与 R00–R03 相同：React #301 + `SMOKE_FAIL 系统关联文件未进入外部标签`，非 R04 回归）。  
**文档：** `docs/export-formats.md` 发布范围/完整性/缺图；计划 §7 复选框。  
**人工边界：** 冒烟仍被 React #301 阻塞端到端；标题/目录排序回归仍由 `document-collection.test.ts` 覆盖。  
**实际工时：** ~1h（自动化记录）  
**下一项：** R05  

## R03 结项（feat/strategy-execution）

**任务号：** R03  
**提交：** `8e85531`  
**失败测试（修复前）：** A03 四类——闭合 frontmatter 泄漏为 `<hr>/<h2>`；脚注读错 AST 字段；引用式链接/图片未解析 `definition`；列表子节点走行内渲染导致嵌套列表失真。  
**修复后结果：** `document-collection.test.ts` 19/19；`collection-markdown-renderer.test.ts` 17/17；全量 **198** 文件 **1461** 项通过。  
**全量门禁：** `npm run lint` 0；`npm run typecheck` 0；`npm run test` 0（1461 passed）；`npm run build` 0；`npm run smoke` **exit 1**（与 R00–R02 相同：React #301 + `SMOKE_FAIL 系统关联文件未进入外部标签`，非 R03 回归）。  
**文档：** `docs/export-formats.md` 集合 HTML 子集说明、计划 §6 复选框。  
**人工边界：** 单篇 DOM 导出与集合 mdast 路径语义仍分表验收；PDF/DOCX 未因 HTML 保真自动宣称通过。集合导出不改磁盘 `.md` hash。  
**实际工时：** ~1.5h（自动化记录）  
**下一项：** R04  

## R02 结项（feat/strategy-execution）

**任务号：** R02  
**提交：** `d1eeeb7`  
**失败测试（修复前）：** A02 探针 `expectedMtime=1000` / 磁盘·全局 `1200` 在 ≤500ms 容差下被放行；请求旧 hash 未与磁盘新 hash 比较；进程全局 known 可冒充本编辑器基线。  
**修复后结果：** `document-version-check` 6/6；`document-save-handler` 双读取者集成（mtime 差值 0/1/200/499/500/501ms 等长）均 CONFLICT；`forceOverwrite` 仅显式确认后写入；全量 **197** 文件 **1440** 项通过。  
**全量门禁：** `npm run lint` 0；`npm run typecheck` 0；`npm run test` 0（1440 passed）；`npm run build` 0；`npm run smoke` **exit 1**（与 R00/R01 相同：React #301 + `SMOKE_FAIL 系统关联文件未进入外部标签`，非 R02 回归；版本绑定保存路径已写入 smoke 脚本）。  
**文档：** `domain-model.md`、`document-tab-lifecycle.md`、`system-file-open-and-close.md`、`file-write-recovery.md`、计划 §5 复选框。  
**人工边界：** 双真实 Electron 窗口端到端被 React #301 冒烟首步阻塞；Main 隔离双读取者契约 + smoke 脚本版本绑定保存步骤已固化。hash 不进日志/遥测。  
**实际工时：** ~2.5h（自动化记录）  
**下一项：** R03  

## R01 结项（feat/strategy-execution）

**任务号：** R01  
**提交：** `971c692`  
**失败测试（修复前）：** `decodeTextBuffer` 对带 BOM 残缺 UTF-8、UTF-16 奇数字节、孤立代理项未抛错（6 项失败）；宽松 `toString` 产生 `\uFFFD` 正文。  
**修复后结果：** `npx vitest run src/main/ipc/file-io.test.ts src/main/ipc/text-decoding.test.ts` 30/30；全量 **195** 文件 **1422** 项通过。  
**全量门禁：** `npm run lint` 0；`npm run typecheck` 0；`npm run test` 0（1422 passed）；`npm run build` 0；`npm run smoke` **exit 1**（与 R00 相同：React #301 + `SMOKE_FAIL 系统关联文件未进入外部标签`，非编码变更引入）。  
**文档：** `compatibility-matrix.md`、`file-write-recovery.md`、计划 §4 复选框。  
**人工边界：** 打开/索引经 `readTextAutoEncoding` → `UNSUPPORTED_ENCODING`；历史快照 `decodeTextBuffer` 失败仍跳过该次快照（不写入损坏正文）。  
**实际工时：** ~1.5h（自动化记录）  
**下一项：** R02  

## R00 结项（feat/strategy-execution）

**任务号：** R00  
**提交：** `bead366`  
**失败测试（修复前）：** HelpDialog 未使用 `fireEvent`（lint error）；`useWorkspaceFiles` hooks 依赖警告 3 条；Electron 缺失时 3 套件无法加载。  
**修复后结果：** 针对性 vitest 26/26 通过；全量 **194** 文件 **1408** 项通过（exit 0）；lint 0 error 0 warning；typecheck/build exit 0。  
**全量门禁：** `npm run lint` 0；`npm run typecheck` 0；`npm run test` 0（1408 passed）；`npm run build` 0；`npm run smoke` **exit 1**（Electron 二进制已存在，首步 `SMOKE_FAIL 系统关联文件未进入外部标签`，渲染层 React #301，待 R00 后单独归因，不阻塞 lint/单测基线）。  
**文档：** 本文件、`docs/superpowers/plans/2026-09-20-product-strategy-execution.md` §3 复选框。  
**人工边界：** 本地 Node **v24.19.0** / npm **11.17.0**（CI 仍用 Node 22）；`node_modules/electron/dist/electron.exe` 存在；smoke 未绿。  
**实际工时：** ~2h（自动化记录）  
**下一项：** R01  

**环境证据：** Node v24.19.0、npm 11.17.0、Electron 可执行文件 present、`useWorkspaceFiles.ts` 356 行（已拆 `workspace-file-pre-save.ts`、`workspace-move-file.ts`）。

## 2026-09-20 审查增量

基线 `b6ad9a5` 本轮类型检查和生产构建通过；lint 有 1 个 error、3 个 warning；主题/焦点静态门禁通过但有 37 项主题基线豁免。全量测试为 190 文件通过、3 文件因 Electron 二进制缺失加载失败，执行到的 1,374 项通过；smoke 同样被运行时缺失阻塞。官方二进制下载超时，本轮没有新的桌面运行或性能通过记录。

代码定向复现发现带 BOM 异常编码可被宽松转换、保存旧基线 500ms 容差契约缺口（双窗口端到端仍待验证）、集合输出内容失真与目录事件过滤问题；另有搜索覆盖、输出反馈和恢复边界问题。**本轮仅审查并交付文档，没有修复这些实现。** 细节和复现见 [审查证据](development/product-audit-2026-09-20.md)，后续顺序见 [R00–R17 实施任务](superpowers/plans/2026-09-20-product-strategy-execution.md)。

下方保留 9 月 19 日的工程记录；它不代表新发现已经处理，也不替代本轮验证结果。

以下为 9 月 19 日保留记录；更晚的证据以上方审查增量为准。旧 M0–M2 批次可查 Git 历史。下一轮顺序见 [R00–R17 实施任务](superpowers/plans/2026-09-20-product-strategy-execution.md)，验收口径见 [strategy-validation](development/strategy-validation.md)。自动测试通过不等于平台、用户或商业验收通过。

## 这次核对跑过什么

2026-09-19 夜间再次执行 `npm run typecheck` 和 `npm run test`（193 个测试文件、1400 项通过）。同日较早一次 `npm run build` 已通过；这一轮没有重跑 `build`、`lint`、`a11y`、`smoke` 或 `perf:electron`。

## 已经落地、且有自动测试的行为

- **保存身份**：大文档保存和关闭绑定文件、会话和编辑器实例。超时、切换或晚到的旧回执不会把新输入标成已保存，也不会放行关闭。关窗超时会作废这次关闭许可，但已经启动的保存继续跑完，并等它结束才允许下一次关窗。切离、新建、打开和重命名/删除/移动大文档时会等待 listener 快照，超时则取消操作。覆盖写入若已把新内容校验进目标、只差 committed journal，下次打开会保留新版本而不是回滚 backup。顶栏和状态栏会显示保存中、冲突、编码无法保存和保存失败。无磁盘路径的示例和未命名文档不会显示“已保存”。
- **可恢复写入**：已有文件经同目录 journal/backup 覆盖。可控注入点（临时写入拒绝、备份复制失败、覆盖中断、目标同步失败、prepared 恢复、committed 清理、外部修改保留、活动 journal 并发拒绝）各有 20 次隔离目录回归。进程终止、真实磁盘满/权限、符号链接换靶的完整矩阵和三平台文件身份还没有做。
- **5 MiB 硬门禁**：2026-09-15 起，固定长段落夹具在这台 Windows 开发机上有三次独立 Electron 通过记录；2026-09-18 另有一次生产构建记录（打开 2673.2 ms、保存 300.05 ms、资源包导出 121.94 ms，20 标签循环 P95 82.5 ms）。这不能外推到多结构夹具、另一台电脑或 8 小时运行。
- **资料复用**：工作区搜索按文件名和标题优先排序，并分开说明“匹配达到 200 条”和“没有扫完”。搜索和反链可插入当时的片段快照；标题行带普通 Markdown 锚点；搜索插入后回到打开搜索时的位置；换成另一篇后拒绝旧结果。搜索词和最近引用的库内路径会记住，可以清除，不存正文。
- **打开与导出**：打开知识库后只报告未扫完、缺附件、断链和残缺脚注，不改原文。Markdown、HTML、PDF、Word 和 Pandoc 导出前检查空图片、不安全链接和缺失本地目标；取消不写文件。按标签或目录做集合导出时，已经打开的笔记用编辑器实时正文，未打开的才读磁盘。导出内联本地图片按文件句柄读取，路径被换成链接后不把目标写进导出文件。保存对话框选定路径后，写出前再核对目标真实身份。资源包只写刚刚选定的导出目录，不把知识库当成写出目标。导出代码块时去掉格式化按钮和折叠标记，被折叠的文字仍在结果里。技术文章和决策记录模板可从命令面板创建。说明见 [coexistence](coexistence.md) 与 [export-formats](export-formats.md)。
- **粘贴、代码块和图表**：剪贴板里的 Markdown 原文按标题、列表和强调排版，不因附带 HTML 变成纯文本；网页 HTML 用 DOMParser 转换，不执行脚本、不加载图片。JSON/YAML 可格式化或压成一行，有缩进的代码可折叠一段且不改文件。Mermaid 渲染前去掉共同缩进、零宽字符、误带围栏和 init；主题样式里的 `.error-icon` 以及节点中的 Syntax error 文字不算画失败。
- **写入授权**：跨进程保存锁等待期间，若该路径已经不在信任范围内，保存拒绝写入，不会把缺失的授权函数当成放行。信任根在首次解析后钉住真实路径，之后 junction 换靶不会扩大范围；钉住结果写入主进程私有清单，重启后继续使用。图片读取白名单同样记下并恢复真实目录。工作区新建、重命名、移动和删除使用同一钉住根，并在真正调用系统函数前再核对一次。打开对话框和另存为只授权这一篇，不把父目录升级为可写工作区。拖入文件只授图片读取，不能用该白名单保存或删除图片。自定义 CSS 导入只读普通文件句柄。读取路径的 journal 恢复若授权失败则跳过，不会把 backup 写到未授权目标。打开、索引、搜索、版本快照和 `mdimg` 图片都拒绝符号链接，并只读取与打开前 inode 一致的普通文件；单篇身份变化不会拖垮整库索引。
- **外部冲突**：保存除 mtime 和尺寸外，还会比较上次读取/写入的内容哈希，等长且保留 mtime 的外部替换也会 `CONFLICT`。冲突哈希只读普通文件句柄；保存成功后记下的哈希是刚刚写出的字节。重命名和移动在尺寸不变时把这份哈希带到新路径。重启恢复草稿时，若记下了起草时正文的哈希，磁盘正文已经不同就放弃草稿。编辑器撤销回已保存基线会消耗 pending dirty。活动预览仍有未落账输入时会固定而不是拆掉。命令面板是模态对话框，Escape 在捕获阶段关闭。
- **界面基线**：顶栏、路径条、同名消歧、窄窗口抽屉、轻大纲、九主题对比度门禁、收藏重启恢复和低频命令登记已经实现。真实中文输入法、九主题加 100/125/150% 缩放的人工矩阵还没有做。输入法组合态下的 Escape 已有自动保护，不能代替真机输入法。

## 明确还没验证

- 安装、升级、卸载、文件关联，以及 macOS / Linux。2026-09-18 只生成过未签名的 Windows 安装包，没有在隔离环境安装。
- Q01 里尚未注入的故障：进程终止、真实磁盘满、真实权限拒绝、硬件掉电。
- Q02 的完整时序矩阵：真实中文输入法、跨平台、每类规模的全量重复。
- M01 的多结构 5 MiB、另一台 16 GB / SSD 设备、8 小时内存趋势。
- 用户任务成功率、试用回访、研究记录、获客和收费。

## 仍超过行数门禁的生产 `.ts/.tsx`

2026-09-20 实数（`Measure-Object -Line`）。触及时再拆，不把账本当成已经拆完。测试文件超限不列入本表。

| 文件 | 行数 | 备注 |
| --- | --- | --- |
| `src/renderer/src/lib/docx.ts` | 545 | 导出 Word 路径 |
| `src/renderer/src/app/useAppSettings.ts` | 489 | 设置与主题 |
| `src/renderer/src/components/Editor/overlays/useEditorOverlays.ts` | 460 | 编辑器浮层 |
| `src/renderer/src/components/Editor/instance/useMilkdownInstance.ts` | 456 | Milkdown 实例 |

**R00–R10 已拆分或降至 450 以下（触及时勿引用旧行数）：** `useWorkspaceFiles.ts`（355，`workspace-file-pre-save.ts` / `workspace-move-file.ts`）；`file-handlers.ts`（346，`document-save-handler.ts` 等）；`AppComposition.tsx`（424）；`mermaidCodeBlock.ts`（449，贴线未增功能）。

`AppComposition.tsx` 与 `mermaidCodeBlock.ts` 当前 ≤450，新增功能前仍须评估拆分。
