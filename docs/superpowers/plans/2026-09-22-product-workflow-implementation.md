# Paperin 产品整体工作流实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

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
  -> 20 人四周重复使用
  -> 真实付款实验

P3 团队与企业
  3 个团队重复交付问题
  -> 单独规格化一个团队结果
  -> 有预算和维护责任后评审企业架构
```

| 优先级 | 任务 | 进入条件 | 退出证据 |
| --- | --- | --- | --- |
| P0 | P0-01 至 P0-06 | 当前即可执行 | 性能、发布、安装和恢复无 P0 红灯 |
| P1 | P1-01 至 P1-05 | P0 退出；种子研究可与 P0 并行 | 多数外部样本独立完成，至少 3 人第二次主动使用 |
| P2 | P2-01 至 P2-04 | P1 退出 | 两批四周队列与至少 5 位真实付款样本 |
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

普通文本和正则查询都从同一 snapshot 扫描；snapshot 不存在时保留当前受信任磁盘扫描。查询取消、`queryId` 陈旧、200 条上限和 coverage 语义保持不变。

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

每次记录 `participantId`、真实成果、原工具、找到来源、插入来源、保存重开、交付结果、求助、阻塞和再次使用。限时 15 分钟，超时/求助/放弃保留原结果。

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

Expected: 多数样本无需口头教学完成，至少 3 人在第二个真实任务主动使用，且没有内容损坏；否则保留 Draft，选择唯一最大阻塞回到独立规格。

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

**Entry condition:** P1 外部样本中至少 3 次出现来源移动/改名导致的维护阻塞。

**Files:**
- Modify: `src/shared/workspace-state.ts`, `src/shared/workspace-state.test.ts`
- Create: `src/renderer/src/lib/source-relocation.ts`, `source-relocation.test.ts`
- Modify: `src/renderer/src/components/QualityPanel/index.tsx`, `index.test.tsx`
- Create: `src/renderer/src/components/SourceRelocationDialog/index.tsx`, `index.test.tsx`
- Modify: `src/renderer/src/app/AppComposition.tsx`
- Docs: `docs/compatibility-matrix.md`, `docs/command-panels.md`

**Interfaces:**
- Consumes: 缺失 `SourceSnapshot`、用户从工作区搜索中明确选择的新文件。
- Produces: 更新来源健康快照的显式动作；正文链接修改必须是另一个可预览、可撤销命令。

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

**Files:**
- Create after P1 exit: `docs/development/user-research/retention-cohort-2026-<month>.md`
- Create after retention exit: `docs/development/user-research/paid-value-study-2026-<month>.md`
- Modify: `docs/development/user-research/_index.md`, `docs/PROJECT-STATUS.md`, `docs/PRODUCT-STRATEGY-REVIEW-2026-09-22.md`

**Interfaces:**
- Consumes: 至少 20 位激活用户；固定 W1/W4 窗口、有效成果和资料复用定义。
- Produces: 整数分子/分母、失访、W4 使用和复用结果；达到门槛后至少 5 位非关联用户的实际付款/退款/30 天使用/支持时间。

- [ ] **Step 1: 冻结队列字段与分母**

```text
participantId | activatedAt | w1ValidUse | w4ValidUse | w4Reuse |
usefulOutcome | lostOrWithdrawn | evidence
```

退出和失访保留在原分母；不上传正文或路径。

- [ ] **Step 2: 执行两批队列**

每批至少 20 人，分别报告 W4 有效使用、资料复用、成果率和支持时间；不把两批合并掩盖失败。

- [ ] **Step 3: 达标后进行人工付款实验**

比较 99–199 元创始支持包和年度维护表达；不开发账号或授权系统。记录实际付款、退款、30 天活跃和支持分钟，问卷意愿不计付款。

- [ ] **Step 4: 作出商业决定并提交**

明确继续个人 Pro、暂停收费或回到任务价值。提交：`docs: 记录个人版留存与付款验证`。

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

## 3. 每个代码任务的统一验收

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

## 4. 计划完成定义

本计划不是以“所有任务都写了代码”为完成，而是按阶段退出：

- P0 完成：搜索性能、GitHub 发布身份、Windows 安装循环和进程中断恢复均有新鲜绿灯。
- P1 完成：外部 Alpha 多数用户独立完成核心任务，至少 3 人第二次主动使用，无内容损坏。
- P2 完成：两设备长期稳定、专业交付可验证、两批四周队列完成，并有至少 5 位真实付款样本或明确停止商业化的决定。
- P3 完成：只代表团队/企业是否进入已由证据决定；企业代码需要新的独立规格和计划。
