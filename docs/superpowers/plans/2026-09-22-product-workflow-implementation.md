# Paperin 产品整体工作流实施计划

> 按任务逐项执行，使用复选框记录实际结果。遵守根目录 AGENTS.md；本计划不要求安装额外插件或启动子代理，不能把工具可用性当作已完成证据。

> 2026-09-23 复审与全量文档同步：本文件保留原任务契约与复选框，**计划勾选不等于当前完成状态**；实际完成/红灯以 [PROJECT-STATUS](../../PROJECT-STATUS.md) 为准。P0-02/P0-07/P1-06/07/08 等能力已落地；新发现 A01–A10（含 A08 路径迁移、A09 可见契约、A10 测试/性能门禁）见[审查证据](../../development/reviews/2026-09-23-product-state-audit.md)，优先于新增功能。资料复用研究门槛不概括全部通用写作/知识整理用户，扩展路线以[最新战略](../../PRODUCT-STRATEGY-REVIEW-2026-09-23.md)为准。

**Goal:** 把 Paperin 从工程化个人产品候选推进为可在 Windows 上可信安装、能让陌生用户独立完成“资料到可维护交付文档”的外部 Alpha，并为个人专业版、团队交付和企业评审建立证据门槛。

**Architecture:** 保持 Renderer -> typed Preload -> Main -> Shared 边界，正文仍由 Milkdown/ProseMirror 和用户 Markdown 文件持有。近期代码集中在 Main 的搜索/索引复用、发行与安装验证、真实故障恢复、兼容夹具和脱敏支持摘要；用户研究结果决定产品增量，团队和企业能力不提前进入单机架构。

**Tech Stack:** Electron 43、React 18.3、TypeScript 5.7 strict、Milkdown 7/ProseMirror、electron-vite/Vite 5、Vitest/Testing Library、electron-builder、GitHub Actions、Node.js 22 LTS 验证基线。

## Global Constraints

- 根目录 `AGENTS.md` 是最高项目门禁；Paperin 提交格式为 `<type>: <简体中文摘要>`，不追加 PM 号。
- 每项代码任务先写失败测试并确认失败，再做最小实现；不得调整测试去迎合实现。
- 用户 Markdown、附件和目录不得作为测试输入；故障、性能和兼容验证使用临时目录与合成夹具。
- Renderer 禁止导入 Electron 和 Node；新增 IPC 必须同步 `channels.ts`、Main handler、Preload、`api.d.ts`、Renderer 和测试。
- 保存、重命名、移动、删除、导出和更新必须保留成功、取消、失败、冲突/编码损失及卸载后的状态说明。
- 性能阈值保持现值；只有固定环境多轮数据和用户体验预算同时支持时，才能单独评审阈值变更。
- 诊断、研究和交付报告不得包含正文、绝对路径、文件名原文、搜索词、token 或明文凭据。
- Windows 是外部 Alpha 首发平台；macOS/Linux 只在各自安装、签名和桌面集成通过后承诺。
- 一个任务只提交一个可独立验收的边界；完成后立即更新 `docs/PROJECT-STATUS.md` 并提交。
- 任何阶段未满足退出条件时停止，不以 AI、同步、插件、移动端或团队功能绕过当前红灯。

---

## 1. 文件地图与执行边界

| 文件/目录 | 本计划职责 |
| --- | --- |
| `docs/PRODUCT-WORKFLOW.md` | 用户端到端任务、失败分支和代码边界的稳定契约 |
| `docs/PROJECT-STATUS.md` | 只记录当前 commit 的新鲜通过、失败和未验证项 |
| `docs/development/performance-baseline.md` | 性能环境、阈值、原始聚合结果和解释 |
| `docs/development/release-validation.md` | 候选、安装、升级、卸载、更新和数据保留证据 |
| `docs/development/strategy-validation.md` | 文件安全、用户研究、商业和阶段指标口径 |
| `src/main/indexing/` | 文件发现、增量索引、搜索语料和 watcher 生命周期 |
| `src/main/ipc/workspace-search-handler.ts` | 查询校验、取消、覆盖语义和搜索执行 |
| `src/main/testing/`、`scripts/` | Electron、安装态、故障和性能验证驱动 |
| `.github/workflows/` | 质量、候选构建、安装验收和正式发布门禁 |
| `src/shared/` | 无副作用 DTO、schema、错误码和纯规则 |
| `src/preload/` | 新能力的唯一 typed bridge |
| `src/renderer/src/app/`、`components/` | 产品编排、用户状态、反馈和可访问交互 |

已在 `0.7.0` 完成且不重复列为待办：真实路径授权、生产搜索夹具授权、生产依赖修复、自动更新开关、SM.MS 凭据加密、许可/隐私/安全材料、核心任务 Electron 冒烟、来源健康、发布配置、交付报告、5 MiB 多结构夹具和稳定性汇总函数。

## 2. 产品工作流与优先顺序

```text
P0 代码与发行可信度
  搜索性能可解释且达标
  -> GitHub 主渠道与发布目标一致
  -> 候选安装/升级/卸载可重复
  -> 真实进程中断不破坏已确认版本

P1 外部 Alpha
  两位用户完成真实任务
  -> 常见来源资料只读打开
  -> 中文输入/缩放/反馈链路可用
  -> 6–8 位外部用户独立完成核心任务

P2 个人专业版
  两设备/8 小时稳定
  -> 来源重定位与交付兼容减少返工
  -> 12 位新用户确认轮（U01/U02）
  -> 两批各至少 20 人 W2/W4 重复使用
  -> 真实付款实验

P3 团队与企业
  3 个团队重复交付问题
  -> 单独规格化一个团队结果
  -> 有预算和维护责任后评审企业架构
```

| 优先级 | 任务 | 进入条件 | 退出证据 |
| --- | --- | --- | --- |
| P0 | P0-01 至 P0-07 | 当前即可执行；P0-07 先固定正确性，P0-02 再优化复用 | 性能、索引新鲜度、发布、安装和恢复无 P0 红灯 |
| P1 | P1-01 至 P1-08 | 外部 Alpha 等待 P0 退出；种子研究及 P1-06/07/08 正确性修复可提前执行 | 来源隔离与缓存边界通过，多数外部样本独立完成，至少 3 人第二次主动使用 |
| P2 | P2-01 至 P2-05 | P1 退出；先确认轮、长期稳定与交付验证，再进入队列 | U01/U02、两批 W2/W4 与付款实验或明确暂停商业化决定 |
| P3 | P3-01 至 P3-02 | 至少 3 个团队重复同类问题 | 团队试点和企业预算分别作出进入/暂缓决定 |

## P0：代码与发行可信度

### Task P0-01: 固化搜索分段指标并复现性能红灯

**Files:**
- Create: `src/main/ipc/workspace-search-metrics.ts`
- Test: `src/main/ipc/workspace-search-metrics.test.ts`
- Modify: `src/main/ipc/workspace-search-handler.ts`
- Modify: `src/main/ipc/workspace-search-watch-production.perf.ts`
- Modify: `scripts/perf-baseline.mjs`, `scripts/perf-regression.mjs`
- Docs: `docs/development/performance-baseline.md`, `docs/PROJECT-STATUS.md`

**Interfaces:**
- Consumes: `runWorkspaceSearch` 的文件发现、stat、读取、扫描和匹配流程。
- Produces: `WorkspaceSearchMetrics`，只含时延、数量、缓存命中和覆盖状态，不含路径、查询词、预览或正文。

- [ ] **Step 1: 写指标聚合失败测试**

```ts
export interface WorkspaceSearchMetrics {
  discoveryMs: number
  metadataMs: number
  readMs: number
  scanMs: number
  totalMs: number
  discoveredFiles: number
  scannedFiles: number
  cacheHits: number
  cacheMisses: number
}
```

测试用注入时钟断言各阶段只累加到对应字段，并用 `JSON.stringify(metrics)` 断言不包含 `path`、`query`、`preview`、`content` 键。

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx vitest run src/main/ipc/workspace-search-metrics.test.ts`

Expected: FAIL，`workspace-search-metrics.ts` 或 `WorkspaceSearchMetrics` 尚不存在。

- [ ] **Step 3: 实现无隐私内容的可选观测器**

在 `runWorkspaceSearch` 最后增加可选 `instrumentation?: { now(): number; record(metrics: WorkspaceSearchMetrics): void }` 参数。默认生产调用不打印；性能夹具注入 `performance.now` 和记录器。取消、读取失败和命中上限也必须记录完整的数量/阶段时间后再返回或抛出。

- [ ] **Step 4: 固定环境运行三轮**

Run: `node --version`; `npm run perf:regression`; `npm run perf:regression`; `npm run perf:regression`; `npm run perf:production`

Expected: 使用 Node 22 LTS、相同临时目录所在磁盘和相同夹具；失败结果原样保留。记录每轮 discovery/metadata/read/scan/total，确认主要耗时发生在哪一层。

- [ ] **Step 5: 更新证据并提交**

在性能文档记录 commit、Node、OS、CPU、RAM、磁盘、杀毒/索引状态、三轮原始指标、P50/P95 和失败阈值。提交：`git commit -m "test: 增加工作区搜索分段指标"`。

### Task P0-02: 让全文搜索复用 Main 内存索引语料

**Files:**
- Modify: `src/main/indexing/workspace-index-service.ts`
- Test: `src/main/indexing/workspace-index-service.test.ts`
- Modify: `src/main/ipc/workspace-search-handler.ts`
- Test: `src/main/ipc/workspace-search-coverage.test.ts`
- Modify: `src/main/ipc/workspace-handlers.ts`, `src/main/ipc/handlers.ts`
- Test: `src/main/ipc/workspace-search-watch-production.perf.ts`
- Docs: `docs/development/performance-baseline.md`, `docs/compatibility-matrix.md`

**Interfaces:**
- Consumes: `WorkspaceIndexService.refresh` 已读取的 Markdown 正文、mtime、size、coverage 和 watcher 增量刷新。
- Produces: Main-only `WorkspaceSearchSnapshot`；不进入 Shared DTO、不写磁盘缓存、不暴露给 Renderer。

**前置约束（C03/C05/C06）：** 先完成 P0-07 的目标变化回归，再复用语料；索引 service 目前 408 行，新增语料前拆出缓存存储与资源依赖解析边界，旧导出兼容迁移。不得把完整工作区正文复制到 Renderer。

**总内存与新鲜度验收：** 单文件 2 MiB 和 5000 文件上限不能替代总预算。实现前在性能文档冻结单根及进程总语料预算、核算方式、回收策略与 RSS 验证范围；测试用注入的小预算覆盖边界。多窗口打开同根复用语料，最后一个使用者释放后回收；不同根总量受进程预算限制。驱逐或未缓存文件必须走原有安全读盘查询，不能默默从结果中消失；fallback 因预算或读取失败未扫完时沿用 coverage 原因。只按同一 generation 发布完整快照，watcher 失效、切换、取消、读取失败期间不得把旧内容标为已核验。测试新增文件、同大小修改、删除、两根竞争预算、多个窗口关闭与 dispose 后缓存释放；保留冷/暖查询原性能阈值，同时记录 RSS，不以速度换取无界常驻内存。

```ts
export interface WorkspaceSearchDocument {
  path: string
  size: number
  mtimeMs: number
  lines: readonly string[]
}

export interface WorkspaceSearchSnapshot {
  generation: number
  complete: boolean
  documents: readonly WorkspaceSearchDocument[]
}
```

- [ ] **Step 1: 写索引语料复用失败测试**

在两文件夹具中执行首次 `refresh`，断言读取两次；不改文件再次 `refresh`，断言不再读取；修改一篇后刷新只读取一篇；`dispose(root)` 后 `getSearchSnapshot(root)` 返回 `null`。另断言磁盘索引缓存 JSON 不含 `lines` 和正文 marker。

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx vitest run src/main/indexing/workspace-index-service.test.ts src/main/ipc/workspace-search-coverage.test.ts`

Expected: FAIL，`getSearchSnapshot` 尚不存在，全文搜索仍自行遍历并读盘。

- [ ] **Step 3: 实现 Main-only 语料生命周期**

给 `WorkspaceIndexState` 增加 `searchDocuments: Map<string, WorkspaceSearchDocument>`。刷新时对已变化文件从已读取的 `content` 构建 `lines`，未变化文件复用对象；超过 2 MiB、读取失败和预算外文件不进入语料并沿用 coverage。`load` 只恢复结构索引，不从磁盘恢复正文；首次刷新补齐语料。`dispose` 清空语料。

- [ ] **Step 4: 搜索优先使用语料、未就绪时安全回退**

把 `registerWorkspaceSearchHandler` 的依赖改为对象：

```ts
interface WorkspaceSearchHandlerDependencies {
  withinWindow(event: IpcMainInvokeEvent, candidate: string): Promise<boolean>
  getSearchSnapshot(root: string): WorkspaceSearchSnapshot | null
}
```

普通文本和正则查询都从同一 snapshot 扫描；snapshot 不存在、未就绪或包含因内存预算未缓存的文件时，按前述预算契约补充受信任磁盘扫描，合并结果去重并保持同一查询代次。查询取消、`queryId` 陈旧、200 条上限和 coverage 语义保持不变。

- [ ] **Step 5: 验证正确性、内存和性能**

Run: `npx vitest run src/main/indexing/workspace-index-service.test.ts src/main/ipc/workspace-search-coverage.test.ts`; `npm run perf:production`; `npm run perf:regression`; `npm run typecheck`; `npm run test`; `npm run build`; `npm run smoke`

Expected: 尾部 marker 仍能命中；第二次查询不重复 stat/read 5000 文件；语料不写磁盘；主进程峰值 RSS 保持在当前性能协议预算内；现有阈值全部通过。

- [ ] **Step 6: 更新文档并提交**

说明“结构索引可落缓存、搜索正文语料只在内存”的隐私边界。提交：`git commit -m "fix: 复用工作区索引加速全文搜索"`。

### Task P0-03: 收敛搜索性能门禁和用户可见状态

**Files:**
- Modify: `src/main/ipc/workspace-search-watch-production.perf.ts`
- Modify: `src/renderer/src/components/WorkspaceSearchDialog/useWorkspaceSearch.ts`
- Test: `src/renderer/src/components/WorkspaceSearchDialog/useWorkspaceSearch.test.ts`
- Modify: `src/renderer/src/components/WorkspaceSearchDialog/index.tsx`
- Test: `src/renderer/src/components/WorkspaceSearchDialog/index.test.tsx`
- Docs: `docs/development/performance-baseline.md`, `docs/PROJECT-STATUS.md`

**Interfaces:**
- Consumes: P0-01 分段指标和 P0-02 的 index/fallback 两条搜索来源。
- Produces: 冷索引、首次查询、暖查询、取消和 watcher 风暴的独立门禁；用户界面区分“正在建立索引”“结果不完整”“查询已取消”。

- [ ] **Step 1: 写状态与门禁失败测试**

覆盖索引未完成时不显示确定性“没有结果”、新查询取消旧查询、取消不显示错误 toast、命中 200 条与扫描未完成分开显示。性能测试分别采集 `coldIndexMs`、`coldSearchP95Ms`、`warmSearchP95Ms`。

- [ ] **Step 2: 运行失败测试**

Run: `npx vitest run src/renderer/src/components/WorkspaceSearchDialog/useWorkspaceSearch.test.ts src/renderer/src/components/WorkspaceSearchDialog/index.test.tsx`; `npm run perf:workspace-search-watch`

Expected: 新增的冷/暖来源断言或 UI 文案断言失败。

- [ ] **Step 3: 实现状态映射**

保持 `WorkspaceCoverage` 为唯一完整性来源，不增加第二套布尔状态。`CANCELLED` 只结束旧请求；`coverage.complete=false` 时显示实际跳过原因；暖查询在 snapshot generation 变化后自动使用新语料。

- [ ] **Step 4: 连续验证稳定性**

Run: 连续三次 `npm run perf:production`; 连续三次 `npm run perf:regression`; `npm run smoke`

Expected: 六次性能命令均退出 0；单轮失败就保持红灯并回到 P0-01 指标，不取最好一次冒充通过。

- [ ] **Step 5: 提交**

提交：`git commit -m "test: 收敛工作区搜索性能门禁"`。

### Task P0-04: 对齐 GitHub 主仓、Gitee 镜像和发布目标

**Files:**
- Modify: `package.json`
- Delete or replace: `scripts/sync-gitee.js`
- Modify: `scripts/ci-config-gates.mjs`, `scripts/verify-ci-config.test.mjs`
- Modify: `.github/workflows/release.yml`
- Docs: `README.md`, `docs/development/release-validation.md`, `docs/PROJECT-STATUS.md`

**Interfaces:**
- Consumes: GitHub 主仓 `moonsyan/Paperin`、`build.publish` 和 `electron-updater` 更新源。
- Produces: 单一 GitHub 发布身份；Gitee 若保留，仅作为显式镜像且仓库名不得沿用旧 `mk-editormkEditor`。

- [ ] **Step 1: 写发布身份失败测试**

```js
expect(validateReleaseIdentity({
  repository: 'https://github.com/moonsyan/Paperin.git',
  publish: { owner: 'moonsyan', repo: 'Paperin' },
})).toEqual([])
```

另覆盖 repository 缺失、owner/repo 不一致、Gitee 脚本含旧仓库名时返回错误。

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx vitest run scripts/verify-ci-config.test.mjs`

Expected: `repository` 当前缺失，旧 Gitee 仓库名被门禁发现。

- [ ] **Step 3: 统一仓库元数据与镜像策略**

给 `package.json` 增加 GitHub `repository`、`homepage`、`bugs`；GitHub 保持自动更新主源。若本轮不维护 Gitee Release，删除未接入 npm/CI 且指向旧仓库的 `sync-gitee.js`；若维护镜像，则把仓库名作为显式参数并禁止源码内硬编码 token/旧项目名。

- [ ] **Step 4: 配置真实远端并验证 Draft**

GitHub 仓库创建完成后运行：

```powershell
git remote rename origin gitee
git remote add origin https://github.com/moonsyan/Paperin.git
git push -u origin master
git push origin v0.7.0
gh release view v0.7.0 --json isDraft,targetCommitish,assets
```

Expected: `origin` 是 GitHub，`gitee` 是可选镜像；tag 只生成 Draft；`targetCommitish` 与候选 commit 一致。若 GitHub 仓库或权限不可用，记录阻断并停止，不改为正式发布。

- [ ] **Step 5: 运行门禁并提交**

Run: `npm run verify:ci-config`; `git diff --check`

Expected: 发布身份、候选门禁和材料检查全部通过。提交：`git commit -m "chore: 对齐 GitHub 发布目标"`。

### Task P0-05: 增加 Windows 安装态候选验收

**Files:**
- Modify: `scripts/smoke-electron.mjs`
- Test: `src/main/testing/electron-smoke.test.ts` or create `scripts/installed-smoke.test.mjs`
- Create: `scripts/verify-windows-install.mjs`
- Test: `scripts/verify-windows-install.test.mjs`
- Modify: `.github/workflows/release.yml`, `scripts/ci-config-gates.mjs`, `scripts/verify-ci-config.test.mjs`
- Docs: `docs/development/release-validation.md`, `docs/system-file-open-and-close.md`, `PRIVACY.md`

**Interfaces:**
- Consumes: `Paperin-Setup-0.6.0.exe` 作为升级起点、当前候选安装包和现有 `--smoke` 核心任务。
- Produces: `WindowsInstallEvidence` 聚合结果，不包含用户名、安装绝对路径或临时工作区内容。

```ts
interface WindowsInstallEvidence {
  fromVersion: string
  toVersion: string
  install: 'pass' | 'fail'
  association: 'pass' | 'fail'
  upgrade: 'pass' | 'fail'
  smoke: 'pass' | 'fail'
  uninstall: 'pass' | 'fail'
  userFilesRetained: boolean
}
```

- [ ] **Step 1: 写命令构造与脱敏失败测试**

测试 NSIS 安静安装/卸载参数、候选 exe 发现、超时和退出码；序列化证据不得包含 `C:\Users\`、工作区路径、文件名或正文 marker。

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx vitest run scripts/verify-windows-install.test.mjs`

Expected: 安装验证脚本尚不存在。

- [ ] **Step 3: 实现隔离安装循环**

脚本只允许在 `--confirm-isolated-environment` 存在时运行；在 Windows Sandbox/临时 CI 用户中依次执行 0.6.0 安装、启动核心 smoke、0.7.x 覆盖升级、`.md`/`.markdown` 关联检查、卸载和独立测试知识库 hash 检查。所有目标路径在运行前解析并确认位于临时目录或标准 Paperin 安装目录。

- [ ] **Step 4: 接入候选工作流**

`build-win` 之后新增 `installed-acceptance-win` job，下载 Windows artifact 并运行安装态 smoke；`candidate-release` 必须依赖该 job。第二个隔离环境由本地 Windows Sandbox 执行相同脚本，结果只写脱敏汇总。

- [ ] **Step 5: 验证并提交**

Run: `npm run verify:ci-config`; `npx vitest run scripts/verify-windows-install.test.mjs`; 在两个隔离环境运行 `node scripts/verify-windows-install.mjs --confirm-isolated-environment --from release/0.6.0/Paperin-Setup-0.6.0.exe --to <候选安装包>`

Expected: 两个环境均通过；卸载后测试知识库 hash 不变；未执行时文档继续标 `UNVERIFIED`。提交：`test: 建立 Windows 安装态候选门禁`。

### Task P0-06: 验证进程中断后的保存恢复

**Files:**
- Create: `src/main/testing/write-recovery-child.ts`
- Create: `src/main/testing/write-recovery-process.test.ts`
- Modify: `src/main/ipc/file-write-recovery.ts` only if the test exposes a contract violation
- Docs: `docs/file-write-recovery.md`, `docs/development/strategy-validation.md`, `docs/PROJECT-STATUS.md`

**Interfaces:**
- Consumes: 现有 preparing/prepared/committed journal、backup 和启动恢复函数。
- Produces: 真进程在准备、备份完成、目标写入、同步和提交标记阶段被终止后的恢复证据。

- [ ] **Step 1: 写子进程中断测试**

父测试为每个阶段创建合成旧版本和新版本，启动 child，等待阶段 marker 后终止进程，再调用生产恢复入口。每阶段至少重复 20 次。

```ts
expect(await readFile(target, 'utf8')).toBe(oldConfirmedContent)
expect(await recoverAgain()).toEqual({ recovered: 0, failed: 0 })
```

- [ ] **Step 2: 运行测试并确认覆盖真实进程**

Run: `npx vitest run src/main/testing/write-recovery-process.test.ts`

Expected: 首次运行至少因 child/阶段协议不存在而失败；测试不得只 mock `copyFile` 或 `rename`。

- [ ] **Step 3: 最小修复恢复协议**

如果某阶段破坏最后确认版本，只修改 `file-write-recovery.ts` 的阶段顺序或幂等清理。恢复不能删除唯一 backup，不能覆盖中断后出现的外部新版本，第二次恢复必须无副作用。

- [ ] **Step 4: 运行文件安全和全量门禁**

Run: `npx vitest run src/main/ipc/file-write-recovery.test.ts src/main/testing/write-recovery-process.test.ts src/main/ipc/file-io.test.ts`; `npm run typecheck`; `npm run test`; `npm run build`; `npm run smoke`

Expected: 所有中断阶段 20/20 通过；当前目标或恢复材料中至少保留最后确认版本。

- [ ] **Step 5: 提交**

提交：`test: 补齐进程中断写入恢复门禁`；若生产代码修复则使用 `fix: 修复进程中断后的文件恢复`。

## P1：外部 Alpha 工作流

### Task P1-01: 完成两位现有用户核心任务观察

**Files:**
- Modify: `docs/development/user-research/seed-study-2026-09.md`
- Modify: `docs/development/user-research/_index.md`, `docs/PROJECT-STATUS.md`
- Reference: `docs/PRODUCT-WORKFLOW.md`, `docs/development/strategy-validation.md`

**Interfaces:**
- Consumes: 两位现有用户各 3 次真实任务；不得使用示例任务冒充真实成果。
- Produces: 6 条脱敏会话、逐人再次使用原因和唯一最高优先阻塞。

- [ ] **Step 1: 检查进入条件**

Run: `rg -n "smoke.*退出 0|Windows.*安装|性能" docs/PROJECT-STATUS.md`

Expected: 测试期间遇到性能或安装红灯要记录其影响；不把工程失败归咎于用户。

- [ ] **Step 2: 执行无口头教学任务**

每次记录 `participantId`、日期、commit/版本、任务类型、库规模区间、真实成果类型、原工具、找到来源、插入来源、保存重开、交付结果、耗时、求助、阻塞和再次使用。合成示例仅作练习；正式六次均为真实任务的可恢复副本。限时 15 分钟，超时/求助/放弃保留原结果；开发者不计陌生首次用户样本。

- [ ] **Step 3: 选出一个最大阻塞**

按“影响人数 -> 是否阻断成果 -> 发生频率 -> 修复成本”排序。只有第一项进入独立规格和实施计划；不能从 6 次观察同时生成多个功能。

- [ ] **Step 4: 复核并提交**

Run: `git diff --check`; 手工确认无正文、路径或身份信息。

Expected: 每位 3 次记录完整，失败样本未被删除。提交：`docs: 完成种子用户核心任务观察`。

### Task P1-02: 建立常见来源工具的非破坏兼容夹具

**Files:**
- Create: `src/main/testing/fixtures/compatibility/manifest.ts`
- Create: `src/main/testing/fixtures/compatibility/compatibility-fixtures.test.ts`
- Create: `src/main/testing/fixtures/compatibility/generated/`（只含合成 Markdown、CSV 和小型图片）
- Modify: `src/main/testing/electron-smoke.ts`, `scripts/smoke-electron.mjs`
- Docs: `docs/compatibility-matrix.md`, `docs/coexistence.md`

**Interfaces:**
- Consumes: Typora/标准 Markdown、Obsidian 标准文件子集、Notion Markdown/CSV 导出、思源 Markdown 导出、语雀导出的合成样本。
- Produces: 每类至少 10 篇的 manifest、打开前后 hash、诊断和不支持语法记录；不宣称兼容未取得的真实导出格式。

- [ ] **Step 1: 写 manifest 契约失败测试**

```ts
interface CompatibilityFixtureManifest {
  source: 'markdown' | 'obsidian' | 'notion' | 'siyuan' | 'yuque'
  sourceVersion: string
  exportMethod: string
  documents: string[]
  expectedUnsupported: string[]
}
```

测试每类数量、相对图片、中文路径、frontmatter、Wiki 链接、未知语法和缺附件覆盖；所有路径必须在夹具根内。

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx vitest run src/main/testing/fixtures/compatibility/compatibility-fixtures.test.ts`

Expected: manifest 和夹具尚不存在。

- [ ] **Step 3: 创建合成导出并接入只读 smoke**

使用各产品真实导出动作生成空白/合成内容，不收集用户库；无法取得的格式明确标 `not-verified`。Electron smoke 只打开、索引、搜索和关闭，前后比较全部 Markdown/附件 hash；应用 `.paperin` 状态另行排除。

- [ ] **Step 4: 运行兼容验证**

Run: `npx vitest run src/main/testing/fixtures/compatibility/compatibility-fixtures.test.ts`; `node scripts/smoke-electron.mjs --compatibility`

Expected: 原文件 hash 100% 不变；未知语法保留原文或给出提示；没有把合成样本写成真实用户兼容结论。

- [ ] **Step 5: 提交**

提交：`test: 建立主流 Markdown 工具兼容夹具`。

### Task P1-03: 完成中文输入、缩放和警告降噪门禁

**Files:**
- Modify as indicated by failure: `src/renderer/src/components/Editor/plugins/footnote.ts`, `mathEditable.ts`, related tests
- Modify: `src/renderer/src/a11y-smoke.test.tsx`, `scripts/focus-outline.mjs`
- Docs: `docs/ACCESSIBILITY-SMOKE.md`, `docs/UI-INTERACTION-SPEC.md`

**Interfaces:**
- Consumes: Windows 系统拼音、100/125/150% 缩放、1280x800/820px/640x600、9 个主题。
- Produces: 组合输入不误触发快捷键、弹层无重叠、焦点可见、测试输出不再含已知 `TextSelection` 噪声的证据。

- [ ] **Step 1: 写组合态和焦点失败测试**

覆盖 `compositionstart -> input -> compositionend` 期间 Enter/Escape/快捷键不提交或关闭错误对象；弹层关闭后焦点回到触发控件；长中文标签在 640px 不溢出。

- [ ] **Step 2: 运行测试并保留当前警告**

Run: `npx vitest run src/renderer/src/components/Editor/plugins/footnote.test.ts src/renderer/src/components/Editor/plugins/mathEditable.test.ts src/renderer/src/a11y-smoke.test.tsx`

Expected: 新增行为测试先失败；现有 ProseMirror/KaTeX 警告单独记录，不通过静默拦截 `console.error` 解决。

- [ ] **Step 3: 修复真实行为和测试选区**

只在 `event.isComposing` 或 editor composition 状态下抑制提交型动作；修正测试构造的无效 `TextSelection`。KaTeX 中文警告保留为明确预期或改用 `\text{}` 合法夹具，不屏蔽未知警告。

- [ ] **Step 4: 执行人工矩阵与自动门禁**

Run: `npm run a11y`; `npm run smoke`; `npm run test`

Expected: 自动门禁退出 0；Windows 系统拼音和三档缩放人工记录无误提交、无遮挡和焦点丢失。未执行的主题/平台组合继续标 `UNVERIFIED`。

- [ ] **Step 5: 提交**

提交：`fix: 收敛中文输入与焦点交互`。

### Task P1-04: 增加用户可预览的脱敏支持摘要

**Files:**
- Create: `src/shared/support-summary.ts`, `src/shared/support-summary.test.ts`
- Modify: `src/shared/ipc/channels.ts`
- Create: `src/main/ipc/support-handlers.ts`, `src/main/ipc/support-handlers.test.ts`
- Modify: `src/main/ipc/handlers.ts`, `src/preload/index.ts`, `src/preload/api.d.ts`
- Create: `src/renderer/src/components/SupportSummaryDialog/index.tsx`, `index.test.tsx`
- Modify: command registry/menu integration files under `src/renderer/src/app/actions/`
- Docs: `PRIVACY.md`, `SECURITY.md`, `docs/command-panels.md`

**Interfaces:**
- Consumes: 应用版本、OS/arch、Electron 版本、更新开关、索引覆盖和诊断计数。
- Produces: 用户先预览、再显式保存的 `SupportSummaryV1` JSON；不读取日志正文。

```ts
interface SupportSummaryV1 {
  schemaVersion: 1
  appVersion: string
  platform: string
  arch: string
  electronVersion: string
  autoUpdateEnabled: boolean
  workspace: { documentCount: number; indexComplete: boolean; diagnosticsByCode: Record<string, number> }
  recentErrorCodes: string[]
}
```

- [ ] **Step 1: 写 DTO 白名单和 IPC 失败测试**

断言额外键被丢弃，字符串字段拒绝斜杠路径、换行和控制字符；Renderer 拿不到 token、日志、正文、搜索词或绝对路径；取消保存不写文件。

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx vitest run src/shared/support-summary.test.ts src/main/ipc/support-handlers.test.ts src/renderer/src/components/SupportSummaryDialog/index.test.tsx`

Expected: DTO、通道和对话框尚不存在。

- [ ] **Step 3: 实现预览后导出**

Main 只提供运行环境字段和原生保存；Renderer 合并当前索引的聚合计数。对话框显示完整 JSON，用户可取消；不自动上传、不复制到剪贴板、不读取 `main.log`。

- [ ] **Step 4: 运行跨边界门禁**

Run: `npm run lint`; `npm run typecheck`; `npm run test`; `npm run build`; `npm run smoke`

Expected: typed bridge 完整；取消无文件；导出 JSON 通过禁词扫描。

- [ ] **Step 5: 提交**

提交：`feat: 增加脱敏支持摘要`。

### Task P1-05: 发布外部 Alpha 并完成 6–8 位任务对照

**新增前置条件：** P0-07、P1-06、P1-07、P1-08 的正确性回归及相应门禁通过；这些是已有能力可信度任务，不受新增功能用户研究门槛限制。

**Files:**
- Create after P0 exit: `docs/development/user-research/external-alpha-study-2026-<month>.md`
- Modify: `docs/development/user-research/_index.md`, `docs/development/release-validation.md`, `docs/PROJECT-STATUS.md`
- Modify for actual release: `CHANGELOG.md`, `README.md`

**Interfaces:**
- Consumes: P0 全部退出、P1-01 最大阻塞已经独立解决、可安装 Draft 候选。
- Produces: 6–8 位外部样本（至少一半非熟人）的交叉工具任务、第二次主动使用证据和 Alpha 继续/暂停决定。

- [ ] **Step 1: 核对发布门槛**

Run: `npm run lint`; `npm run typecheck`; `npm run test`; `npm run build`; `npm run a11y`; `npm run smoke`; `npm run perf:production`; `npm run perf:regression`; `npm audit --omit=dev --audit-level=moderate`

Expected: 全部退出 0，Windows 两环境安装记录存在；任一失败则不发布正式版。

- [ ] **Step 2: 发布 Draft 候选并人工确认**

Run: `gh release view <tag> --json isDraft,targetCommitish,assets`

Expected: `isDraft=true`，commit 与已验证 commit 相同，Windows 安装包和候选记录齐全。

- [ ] **Step 3: 执行外部对照任务**

每人使用 Paperin 和自己的常用工具完成等价任务；A/B 顺序交叉，记录完成、用时分桶、求助、保存重开、成果可读、第二次使用和最大阻塞。用户可保留竞品正常插件和配置。

- [ ] **Step 4: 作出 Alpha 决策**

Expected: 多数样本无需口头教学完成，至少 3 人在第二个真实任务主动使用，且没有内容损坏；否则保留 Draft，选择唯一最大阻塞回到独立规格。连续两轮针对该阻塞修复仍无改善时，记录收缩画像、暂停扩张或停止的决定。通过只代表发现轮退出；U01/U02 的 12 人确认交由 P2-05。

- [ ] **Step 5: 提交记录**

提交：`docs: 记录外部 Alpha 任务验证`。

## P2：个人专业版与重复价值

### Task P2-01: 完成两设备与 8 小时稳定性验证

**Files:**
- Modify only when failures require: `src/main/testing/electron-performance-smoke.ts`, `scripts/smoke-electron.mjs`
- Test: `src/main/testing/electron-performance-smoke.test.ts`
- Docs: `docs/development/performance-baseline.md`, `docs/PROJECT-STATUS.md`

**Interfaces:**
- Consumes: 已有五类 5 MiB 夹具、`summarizeStability`、20 标签切换和 `--stability-hours 8`。
- Produces: 参考机与第二台 16 GB RAM/SSD 设备的原始聚合结果。

- [ ] **Step 1: 核对稳定性汇总单测**

Run: `npx vitest run src/main/testing/electron-performance-smoke.test.ts src/main/testing/fixtures/fixtures.test.ts`

Expected: 30 分钟基线窗口、末两小时、增长 `<=15%` 且 `<=100 MiB`、watcher 不增加的断言通过。

- [ ] **Step 2: 两设备分别运行 8 小时**

Run: `node scripts/smoke-electron.mjs --performance --stability-hours 8`

Expected: 两台设备均运行完整时长；中断、睡眠或环境更新导致的样本不能记为通过。

- [ ] **Step 3: 复核结果**

记录设备、commit、Electron、缩放、样本数、P50/P95/最大值、RSS 增长、watcher 和失败。任一设备失败则创建具体回归测试，不改阈值。

- [ ] **Step 4: 提交**

提交：`test: 记录个人版长期稳定性验证`。

### Task P2-02: 完成来源重新定位而不静默改正文

**Entry condition:** P1 外部样本中至少 3 次出现来源移动/改名导致的维护阻塞，且 P1-07 的文档归属模型已完成。已有来源串库或基线互相覆盖的修复不等待此条件。

**Files:**
- Modify: `src/shared/workspace-state.ts`, `src/shared/workspace-state.test.ts`
- Create: `src/renderer/src/lib/source-relocation.ts`, `source-relocation.test.ts`
- Modify: `src/renderer/src/components/QualityPanel/index.tsx`, `index.test.tsx`
- Create: `src/renderer/src/components/SourceRelocationDialog/index.tsx`, `index.test.tsx`
- Modify: `src/renderer/src/app/AppComposition.tsx`
- Docs: `docs/compatibility-matrix.md`, `docs/command-panels.md`

**Interfaces:**
- Consumes: 缺失 `SourceSnapshot`、用户从工作区搜索中明确选择的新文件。
- Produces: 更新所选引用文档内来源健康快照的显式动作，不覆盖其他文档基线；正文链接修改必须是另一个可预览、可撤销命令。选择模型还须携带 P1-07 定义的引用文档身份与工作区生命周期标识。

```ts
interface SourceRelocationChoice {
  previousPath: string
  selectedPath: string
  selectedModifiedTime: number
  updateMarkdownLink: boolean
}
```

- [ ] **Step 1: 写失败测试**

覆盖同名多候选必须由用户选择、取消不改状态、仅更新快照不改正文、选择“更新链接”先展示替换前后且只改当前文档普通 Markdown 链接。

- [ ] **Step 2: 运行失败测试**

Run: `npx vitest run src/renderer/src/lib/source-relocation.test.ts src/renderer/src/components/SourceRelocationDialog/index.test.tsx`

Expected: 重新定位选择模型尚不存在。

- [ ] **Step 3: 实现显式重定位**

QualityPanel 打开搜索并绑定 `previousPath`；选中结果后弹出确认。默认只更新 mtime 快照；正文更新必须单独勾选、显示影响数量并走编辑器 transaction，保留撤销历史。

- [ ] **Step 4: 运行全量门禁并提交**

Run: `npm run typecheck`; `npm run test`; `npm run build`; `npm run smoke`

Expected: 取消和失败不改快照或正文；来源文件 hash 不变。提交：`feat: 增加来源显式重新定位`。

### Task P2-03: 验证接收方格式并收敛专业交付

**Files:**
- Create: `docs/development/export-recipient-matrix.md`
- Modify as failures require: `src/renderer/src/lib/export-*`, `src/main/ipc/export-*`, related tests
- Modify: `docs/export-formats.md`, `docs/PROJECT-STATUS.md`

**Interfaces:**
- Consumes: 中文/英文、公式、Mermaid、表格、任务、脚注、frontmatter、相对图片和缺附件的固定夹具。
- Produces: 浏览器、Word/LibreOffice、PDF 阅读器和 Pandoc 的打开结果，以及每种格式明确保证/不保证的范围。

- [ ] **Step 1: 冻结交付夹具与期望**

给每种结构定义可见文本、图片数、链接数和不支持项；产物不包含测试机绝对路径。

- [ ] **Step 2: 运行当前导出**

Run: `npm run smoke`; 使用 PublishDialog 导出 Markdown、HTML 资源包、PDF、DOCX 和 Pandoc 路径。

Expected: 取消不写文件，预检分支按文档执行；所有失败记录到矩阵。

- [ ] **Step 3: 对每个真实缺陷做红绿修复**

每个格式缺陷单独增加最小测试和提交，不把多个转换器混在一个变更中。接收方差异无法可靠修复时，更新“不保证”范围而不是伪造兼容。

- [ ] **Step 4: 提交验证记录**

提交：`docs: 建立导出接收方兼容矩阵`。

### Task P2-04: 建立四周队列和真实付款实验

**Entry condition:** P2-05 确认轮、P2-01 稳定性和 P2-03 接收方验证通过；P2-02 按来源移动的独立进入条件执行。

**Files:**
- Create after P1 exit: `docs/development/user-research/retention-cohort-2026-<month>.md`
- Create after retention exit: `docs/development/user-research/paid-value-study-2026-<month>.md`
- Modify: `docs/development/user-research/_index.md`, `docs/PROJECT-STATUS.md`, `docs/PRODUCT-STRATEGY-REVIEW-2026-09-23.md`

**Interfaces:**
- Consumes: 两批各至少 20 位激活用户；固定 day 7–13（W2）与 day 21–27（W4）窗口、有效成果和资料复用定义。
- Produces: 整数分子/分母、失访、W4 使用和复用结果；达到门槛后至少 5 位非关联用户的实际付款/退款/30 天使用/支持时间。

- [ ] **Step 1: 冻结队列字段与分母**

```text
participantId | activatedAt | validActionDatesAndKinds | usefulOutcomeDate |
w2ValidDays | w4ValidDays | w4ReuseCount | followUpStatus | evidence
```

`followUpStatus` 区分 active、lost、stopped-retain、withdraw-delete。失访及允许留存数据的停止参与者保留原分母；撤回删除按同意协议执行并披露分母变化，补招者必须等各自窗口成熟。研究北极星要求有效复用进入真实成果；不上传正文或路径。W2/W4 有效留存均须两个不同日，不能用无日期布尔值替代。

- [ ] **Step 2: 执行两批队列**

每批至少 20 人，分别报告 W4 有效使用、资料复用、成果率和支持时间；不把两批合并掩盖失败。

- [ ] **Step 3: 达标后进行人工付款实验**

比较 99–199 元创始支持包和年度维护表达；不开发账号或授权系统。记录实际付款、退款、30 天活跃和支持分钟，问卷意愿不计付款。

- [ ] **Step 4: 作出商业决定并提交**

明确继续个人 Pro、暂停收费或回到任务价值。提交：`docs: 记录个人版留存与付款验证`。

### Task P2-05: 完成公开 Beta 前的首次任务与效率确认

**Entry condition:** P1 发现轮退出、主要阻塞已修复；该任务不等待 P2-04 留存结果，避免循环依赖。

**Files:** 满足条件后创建 `docs/development/user-research/beta-confirmation-study-<实际日期>.md`；同步研究索引、PROJECT-STATUS、战略报告和发行验证。

**Interfaces:** 使用战略验收协议 U01/U02；12 位符合首轮画像的新用户，发现轮/开发者样本不拼入。任务、版本、题组与限时先冻结，提供统一静态入门材料，竞品正常配置保留。

- [ ] **Step 1：冻结协议。** 记录筛选、同意、版本、任务顺序、A/B 交叉与失败定义；不得在计时前演示同一道题。
- [ ] **Step 2：执行 U01。** 12 人中至少 10 人在 15 分钟内独立完成，受助/超时/不可读成果计失败。
- [ ] **Step 3：执行 U02。** 每人两工具各 3 项等价任务；Paperin 至少 10/12 人三项均成功，失败人数不高于原工具；两工具均成功者总耗时中位改善至少 30%，完整报告失败与成功者数量。
- [ ] **Step 4：作出决定。** U01/U02、P2-01/P2-03 及发行门禁通过才评估公开 Beta 和 P2-04；未通过保留候选，连续两轮无改善按协议收缩或暂停。
- [ ] **Step 5：提交脱敏记录。** `docs: 记录首次任务与效率确认结果`；此任务不自动发布、招募或收费。

## P3：团队与企业的条件任务

### Task P3-01: 先验证团队交付桥梁，再单独写功能规格

**Entry condition:** 至少 3 个真实小团队连续两个周期重复提出同一交付、评审或维护问题。

**Files:**
- Create after entry: `docs/development/user-research/team-handoff-study-2026-<month>.md`
- Modify: `docs/development/user-research/_index.md`, `docs/coexistence.md`, `docs/PROJECT-STATUS.md`
- Create after study approval: `docs/superpowers/specs/<date>-team-handoff-design.md`

**Interfaces:**
- Consumes: Git、共享目录、语雀、飞书或 Confluence 的真实交接过程。
- Produces: 唯一一个团队结果的规格；不直接产生账号、权限或实时协作代码。

- [ ] **Step 1: 检查进入证据**

Run: `rg -n "teamId|cycle|repeatedNeed|budget" docs/development/user-research`

Expected: 少于 3 个团队或不足两个周期时停止并记录“未达到进入条件”。

- [ ] **Step 2: 观察现有渠道交接**

记录责任人、渠道、返工分钟、缺失信息、来源检查和重复问题；共享目录的并发冲突必须如实记录。

- [ ] **Step 3: 只规格化一个重复结果**

可选结果限于责任人/评审状态/更新时间/变更摘要/健康报告/交付清单之一或紧密组合。完成 brainstorming 审批后再生成独立实施计划。

- [ ] **Step 4: 提交研究**

提交：`docs: 记录团队文档交付验证`。

### Task P3-02: 企业知识库架构进入评审

**Entry condition:** 团队试点有真实预算/采购意向，并有明确的维护、安全和支持责任人。

**Files:**
- Create after entry: `docs/enterprise-architecture-proposal.md`
- Reference: `docs/domain-model.md`, `src/shared/ipc/channels.ts`, `src/preload/api.d.ts`, `PRIVACY.md`, `SECURITY.md`

**Interfaces:**
- Consumes: SSO、RBAC、审计、数据保留、备份、私有部署、监控、升级和 SLA 的真实需求。
- Produces: `enter | defer | stop` 决策以及是否需要独立服务端/同步架构；不把本地单机产品直接改名为企业知识库。

- [ ] **Step 1: 核对预算与责任**

缺少预算、部署边界、安全责任人或支持责任人时，结论固定为 `defer`。

- [ ] **Step 2: 比较共存与自建成本**

对比继续使用 Markdown + Git/语雀/飞书/Confluence 与建设服务端治理的开发、迁移、运维、安全和支持成本。

- [ ] **Step 3: 形成架构决策记录**

明确身份、权限、审计、部署、数据驻留、备份、同步冲突和升级责任；只有 `enter` 才进入新的 brainstorm -> spec -> implementation plan 周期。

- [ ] **Step 4: 提交评审**

提交：`docs: 评审企业知识库进入条件`。

## 3. 代码与功能补充任务（2026-09-22）

依据：[代码与功能完整性审阅](../../development/reviews/2026-09-22-code-function-review.md)，基线 `7c3dd53`。以下均为未完成任务，静态发现先转为失败测试；测试若不能复现，记录证据并修订任务，不按猜测改代码。任务编号用于本计划内部引用，不进入 Git 提交摘要。

依赖顺序：P0-01 测量 → P0-07 正确性 → P0-02 有界语料 → P0-03 性能与覆盖；P1-06 异步隔离 → P1-07 文档来源归属 → P2-02 有条件重定位。P1-08 与索引任务顺序提交，共用缓存拆分，不重复实现；四项补充任务完成后才进入 P1-05 外部 Alpha。发行与真人任务的原门槛继续生效。

### Task P0-07: 保证链接和附件变化后的增量索引新鲜度

**用户结果：** 不改引用文章正文，增删或移动来源/图片后仍能看到正确的反链、缺失提示和预检结果。

**Files:**
- Modify/Test: `src/main/indexing/workspace-index-service.ts`、`workspace-index-service.test.ts`
- Create/Test: `src/main/indexing/workspace-index-resources.ts`、`workspace-index-resources.test.ts`
- Modify/Test: `src/main/indexing/workspace-file-watcher.ts`、`workspace-file-watcher.test.ts`
- Integration: `src/main/ipc/handlers.ts` 的 watcher 装配与 `src/main/ipc/workspace-search-watch-production.perf.ts`
- Docs: `docs/compatibility-matrix.md`、`docs/graph-view-architecture.md`、`docs/development/performance-baseline.md`

**契约：** 正文解析结果和资源解析结果分别失效；复用解析不能复用已失效的目标身份。复用现有真实路径/信任校验，不新增访问旁路；同一 generation 的派生关系一起发布。

- [x] **Step 1：失败测试。** A 引用 B/P，A mtime/size 不变；删除、补回、重命名 B/P 及其父目录后刷新，断言 link/image `resolvedPath`、诊断和反链变化，A 正文读取次数不增加。增加附件事件、目录事件、事件风暴、取消、符号链接换靶测试；旧索引快照不能被原地修改。
- [x] **Step 2：确认红灯。** Run: `npx vitest run src/main/indexing/workspace-index-service.test.ts src/main/indexing/workspace-file-watcher.test.ts src/main/indexing/workspace-index-resources.test.ts`。预期旧实现保留目标解析或忽略附件变化；记录实际失败断言。
- [x] **Step 3：最小实现。** 按职责提取资源解析；先保证受控重验正确，再按测量选择依赖映射优化。watcher 只合并相关资源变化并限制积压，无名/目录事件回退重扫，过期任务不能提交结果。
- [ ] **Step 4：验收与提交。** 相关测试、统一代码门禁、smoke、两项性能门禁；桌面合成夹具复现“删图 → 提示缺图 → 补图 → 提示消失”。性能仍失败则保留红灯，不能宣称 P0 完成。提交：`fix: 修复引用目标变化后的索引失效`。

### Task P1-06: 隔离来源登记的异步生命周期

**用户结果：** 快速切库、清除记录、关闭界面或插入失败，都不会把旧来源登记到当前状态。

**Files:**
- Modify/Test: `src/renderer/src/lib/remember-source-snapshot.ts`、`remember-source-snapshot.test.ts`、`insert-citation.ts`、`insert-citation.test.ts`
- Create/Test: `src/renderer/src/app/useSourceTracking.ts`、`useSourceTracking.test.ts`
- Modify: `src/renderer/src/app/AppComposition.tsx`、`AppDialogs.tsx`、`AppWorkspace.tsx`
- Docs: `docs/PRODUCT-WORKFLOW.md`、`docs/command-panels.md`

**契约：** 请求捕获工作区 epoch 和记录版本，提交时二者都有效；比较路径本身不足以覆盖 A → B → A。所有入口只在正文插入成功后登记，失败/取消/卸载有明确结果，已成功正文插入与元数据失败分开处理。

- [ ] **Step 1：失败测试。** 用 deferred `stat` 覆盖 A → B、A → B → A、清除记录、卸载、reject、连续乱序请求。断言当前设置和持久化未受旧回包影响，无未处理 rejection；编辑器未就绪时不登记来源。
- [ ] **Step 2：确认红灯。** Run: `npx vitest run src/renderer/src/lib/remember-source-snapshot.test.ts src/renderer/src/lib/insert-citation.test.ts src/renderer/src/app/useSourceTracking.test.ts`，保留旧实现的失败断言。
- [ ] **Step 3：最小实现。** 将异步登记移到带 cleanup 的 hook/controller，纯路径转换留在 lib；复用现有最新请求机制或增加必要 epoch。`AppComposition` 已超过 450 行，先移出来源编排；`AppDialogs` 已超过组件阈值，涉及搜索时提取搜索对话框编排并补直接测试。
- [ ] **Step 4：验收与提交。** 相关测试、统一门禁、smoke、a11y；验证搜索/反链两个入口及失败提示。提交：`fix: 隔离来源记录的异步工作区状态`。

### Task P1-07: 建立按文档归属的来源基线与复核动作

**用户结果：** 文章 A 使用旧来源、文章 B 使用新来源时，A 的变化提醒不会被 B 清除；用户能明确复核当前文章的来源。

**Files:**
- Create/Test: `src/shared/source-tracking.ts`、`source-tracking.test.ts`（纯 DTO、解析与迁移）
- Modify/Test: `src/shared/workspace-state.ts`、`workspace-state.test.ts`、`src/main/settings/workspace-state-store.ts`、`workspace-state-store.test.ts`
- Modify/Test: `src/renderer/src/lib/source-health.ts`、`source-health.test.ts`、P1-06 的 hook
- Modify/Test: `src/renderer/src/components/QualityPanel/index.tsx`、`index.test.tsx`、工作区重命名/移动相关测试
- Docs: `docs/domain-model.md`、`docs/command-panels.md`、`docs/compatibility-matrix.md`、`docs/PRODUCT-WORKFLOW.md`

**契约：** 来源记录至少包含引用文档相对身份、来源相对路径、引用时基线；工作区身份由可信状态存储范围承载，不落绝对路径/正文。当前文档和工作区汇总是明确的不同范围；来源 mtime 与人工复核状态不同。最多保留多少文档、每文档多少来源和总量如何裁剪，必须在 Shared 常量和文档中一致定义，不能静默把被裁剪项判为健康。

- [ ] **Step 1：失败测试。** A 引用 S@10、B 引用 S@20 后 A 仍 changed；切换当前文档只看其来源。覆盖保存重开、引用文档重命名/移动、同名路径、插入撤销/重做与删除引用。没有引用的旧登记不能作为当前文章已核验的依据。
- [ ] **Step 2：迁移失败测试。** 旧 50 条全局快照保持“旧工作区记录/归属未知”，不批量复制给文章；未知未来 schema 不覆盖保存。定义未保存文档在内存里的身份和另存为后的绑定；未保存正文不进入状态文件。定义来源移出工作区后的 unavailable 行为。
- [ ] **Step 3：实现最小关系模型。** Main settings store 独占持久化，Shared 解析版本和配额；按当前编辑器文档中的链接核对活动关系，不能维护第二份可独立编辑的正文。复核只更新所选文档基线；清除最近导航与删除来源关系拆开。Windows 路径大小写比较沿用平台规则。原 P2-02 重定位消费此模型，不另建一套来源关系。
- [ ] **Step 4：验证。** Run: `npx vitest run src/shared/source-tracking.test.ts src/shared/workspace-state.test.ts src/main/settings/workspace-state-store.test.ts src/renderer/src/lib/source-health.test.ts src/renderer/src/components/QualityPanel/index.test.tsx`，加 hook、移动/重命名回归；完成统一门禁、smoke、a11y，来源 Markdown hash 不变。
- [ ] **Step 5：提交。** 用户说明标注 mtime 的证据边界，schema 迁移同提交；提交：`feat: 按文档维护来源基线与复核状态`。不包含批量正文替换。

### Task P1-08: 收敛索引队列释放与磁盘缓存边界

**用户结果：** 关闭/重新打开工作区后旧刷新不会覆盖新状态；损坏或过大的缓存可安全丢弃并重建。

**Files:**
- Modify/Test: `src/main/indexing/workspace-index-service.ts`、`workspace-index-service.test.ts`
- Create/Test: `src/main/indexing/workspace-index-cache.ts`、`workspace-index-cache.test.ts`（与 P0-02 共用一次拆分）
- Modify/Test: `src/main/ipc/workspace-index-handlers.ts`、`workspace-index-handlers.test.ts`，引用计数/释放装配按实际调用链更新
- Docs: `docs/domain-model.md`、`docs/development/performance-baseline.md`、`docs/compatibility-matrix.md`

**契约：** 生命周期 epoch 独立于刷新 generation；已释放 state 的排队任务、订阅和 cache writer 都失效。只关闭一个同根窗口不能释放另一窗口正在使用的语料。缓存可重建、不授予信任、不存正文；载入缓存不等于磁盘现状已核验。

- [ ] **Step 1：失败测试。** R1 挂起、R2 排队、dispose、同根重开，再放行旧任务；新订阅/内存/cache 都不接受旧结果。补 save/clear 交错、写失败清理临时文件、同根多窗口关闭测试；正常 cancel 后的新请求仍能成功。
- [ ] **Step 2：缓存失败测试。** 中文 UTF-8 超 8 MiB、截断 JSON、错误根、未知 schema、畸形 documents/links/coverage、加载时被替换；断言回退重建、无越界读取和崩溃。预读大小检查配合实际读取字节限制，不能只检查 JS 字符数。
- [ ] **Step 3：最小实现。** 提取缓存存储和校验，不把 IO 放进 Shared；按根串行保存/清理或等价 epoch 隔离，所有写入前校验所属生命周期。使用有限读取、显式 schema 和根绑定，旧缓存可删除重建；暂存不含正文、完整性需重新刷新确认。
- [ ] **Step 4：验收与提交。** Run: `npx vitest run src/main/indexing/workspace-index-service.test.ts src/main/indexing/workspace-index-cache.test.ts src/main/ipc/workspace-index-handlers.test.ts`；统一代码门禁、smoke 及性能回归。提交：`fix: 收敛索引释放与缓存校验`。

## 4. 每个代码任务的统一验收

- [ ] 相关测试先红后绿，保留能复现原问题的断言。
- [ ] `npm run lint` 退出 0。
- [ ] `npm run typecheck` 退出 0。
- [ ] `npm run test` 退出 0。
- [ ] `npm run build` 退出 0。
- [ ] UI 任务运行 `npm run a11y`；UI/IPC/文件/打包任务运行 `npm run smoke`。
- [ ] 性能任务运行 `npm run perf:regression` 和 `npm run perf:production`，不挑最好样本。
- [ ] `git diff --check`、`git status --short` 和 `git diff --stat` 无生成物、用户数据、token 或无关改动。
- [ ] 受影响的 README、状态、兼容、隐私、发行和工作流文档在同一提交更新。
- [ ] 提交信息使用 `feat|fix|docs|style|refactor|test|chore: 简体中文摘要`，不追加 PM 号。

## 5. 计划完成定义

本计划不是以“所有任务都写了代码”为完成，而是按阶段退出：

- P0 完成：搜索性能及总语料预算、目标变化后的索引正确性、GitHub 发布身份、Windows 安装循环和进程中断恢复均有新鲜绿灯。
- P1 完成：来源异步隔离、逐篇基线及迁移、索引释放/缓存回归通过；外部 Alpha 多数用户独立完成核心任务，至少 3 人第二次主动使用，无内容损坏。
- P2 完成：U01/U02 确认轮、两设备长期稳定、专业交付通过，两批 W2/W4 队列完成；达标后有至少 5 位真实付款样本及 30 天结果，或明确暂停/停止商业化的决定。暂停不等于已证明商业可行。
- P3 完成：只代表团队/企业是否进入已由证据决定；企业代码需要新的独立规格和计划。
