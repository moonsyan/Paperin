# Paperin Product Strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Paperin 从工程化程度较高但仍有发行阻断的个人产品候选，推进为可安全交给陌生个人用户试用、可验证重复价值、再按证据进入专业交付和团队场景的本地 Markdown 项目知识工作台。

**Architecture:** 保持现有 Electron 主进程、Preload typed bridge、React/Milkdown Renderer 和 Shared DTO 边界。近期只修复文件授权、测试装配、性能退化、依赖和发行材料，不引入账号、云同步或服务端；用户验证与发行验证和代码门禁并列，不用自动测试替代真实桌面证据。

**Tech Stack:** Electron 43、React 18、TypeScript strict、Milkdown/ProseMirror、Vitest、Testing Library、electron-vite、electron-builder、GitHub Actions、Node 22 CI。

## Global Constraints

- 产品定位固定为：面向个人技术写作者和独立开发者的本地 Markdown 项目知识工作台，帮助用户把散落的项目资料写成带来源、可持续维护、可直接交付的文档。
- 主线任务固定为：打开资料 → 找到依据 → 插入来源并写作 → 安全保存重开 → 导出或交付检查。
- 现阶段首发范围为 Windows 外部 Alpha；macOS/Linux 只有各自候选、安装和平台验证完成后才可对外承诺。
- Renderer 不导入 Electron、Node 或文件系统；Preload 是唯一 Electron 能力出口；IPC 通道必须来自 `src/shared/ipc/channels.ts`。
- 保存必须传 `expectedMtime` 并处理 `CONFLICT`；`ENCODING_LOSS` 不得丢字符；删除优先进回收站；路径授权不得因测试替身绕过真实信任根。
- 新功能先写失败测试，再实现最小修复；触及超过 300 行的生产文件先评估拆分，超过 450 行不得继续增加无关职责。
- 不新增账号、云同步、实时协作、全库 AI 问答、插件市场或移动端主线；这些只能在本计划阶段门槛满足后另立方案。
- 现有 `lint`、`typecheck`、全量测试、`build` 和 `a11y` 的通过记录不代表 smoke、性能、安装、用户价值或商业验证通过。
- 所有提交消息必须为 `<type>: <摘要> #<PM号>`；本计划不执行提交，实际 PM 号由维护者在执行时提供。

---

## 文件地图

- `src/main/ipc/workspace-scope.ts`：窗口工作区根与候选路径的真实路径比较。
- `src/main/ipc/workspace-scope.test.ts`：工作区授权的 Windows 别名、符号链接、未存在目标和多窗口回归。
- `src/main/ipc/workspace-search-watch-production.perf.ts`：真实生产搜索 IPC 与 watcher 性能夹具。
- `src/main/trusted-paths.ts`：主进程信任根、钉住路径和文件级授权实现。
- `src/main/testing/electron-smoke.ts`：Electron 核心用户流程冒烟入口。
- `src/main/testing/electron-performance-smoke.ts`：真实 Electron 大文档与多标签性能夹具。
- `package.json`、`package-lock.json`：脚本、依赖和打包入口。
- `docs/PRODUCT-STRATEGY-REVIEW-2026-09-21.md`：当前唯一战略判断和阶段门槛。
- `docs/PROJECT-STATUS.md`：当前代码、门禁、发行和用户验证状态；不记录旧批次执行顺序。
- `docs/UI-INTERACTION-SPEC.md`：当前稳定界面与交互契约。
- `docs/IMPLEMENTATION-PLAN.md`：开发门禁入口，指向本计划和项目约束。
- `docs/development/`：性能、发行、研究和兼容证据；带日期文件是历史快照或特定验证报告。

## 阶段门槛总表

| 阶段 | 目标 | 进入条件 | 退出证据 |
| --- | --- | --- | --- |
| P0 | 可信发行候选 | 当前 smoke、性能夹具、依赖、许可和失效入口均有明确任务 | Windows 候选可安装，P0 阻断清零，两位现有用户各完成 3 次真实任务 |
| P1 | GitHub 外部 Alpha | P0 退出，定位和核心任务入口稳定 | 6–8 位外部用户中大多数无需口头帮助完成任务，至少 3 人第二次主动使用 |
| P2 | 个人专业版 | P1 有重复使用证据 | 20 人四周队列、W4 有效留存目标 40%、至少 5 位非关联用户真实付款实验 |
| P3 | 团队/企业扩展 | 至少 3 个真实团队重复提出同一类交付或治理问题 | 团队连续两个周期使用并出现真实预算；企业另立身份、权限、审计和部署架构方案 |

## P0：发行与信任阻断

### Task P0-01: 修复工作区规范路径比较并恢复 Electron smoke

**Priority:** P0，数据安全与发行阻断。

**Files:**
- Modify: `src/main/ipc/workspace-scope.ts`
- Test: `src/main/ipc/workspace-scope.test.ts`
- Verify: `src/main/testing/electron-smoke.ts`, `scripts/smoke-electron.mjs`
- Docs: `docs/PROJECT-STATUS.md`, `docs/development/release-validation.md`, `docs/file-write-recovery.md`

**Interfaces:**
- Consumes: `workspaceRootFor(webContentsId): string | null`、`isTrustedPath(candidate): boolean`、`getPinnedTrustRoot(root): string | null`。
- Produces: `withinCallerWorkspace(deps, event, candidate): Promise<boolean>`；对不存在目标先规范化最近存在父目录，再拼接剩余路径；根外、链接换靶和多窗口越权仍返回 `false`。

- [ ] **Step 1: 写失败测试**

在 `workspace-scope.test.ts` 增加 Windows 语义测试：创建真实目录根、指向该根的 junction 或 symlink，并构造尚不存在的子文件；使用字面短路径/真实长路径两种写法，断言根内目标为 `true`，重绑根外后的目标为 `false`。无法创建链接的平台必须显式跳过并记录原因，不得把未创建链接当作通过。

```ts
it('规范化最近存在父目录后允许根内的未存在目标', async () => {
  const candidate = join(rootAlias, 'new', 'note.md')
  await expect(withinCallerWorkspace(deps, eventOf(7), candidate)).resolves.toBe(true)
})
```

- [ ] **Step 2: 运行失败测试**

Run: `npx vitest run src/main/ipc/workspace-scope.test.ts -t "未存在目标|规范化最近存在父目录"`

Expected: FAIL，当前实现对 `realpath(candidate)` 失败后直接比较字面路径，短路径和真实路径不一致时返回 `false`。

- [ ] **Step 3: 实现最小修复**

沿候选路径向上寻找最近存在的父目录；对父目录调用 `realpath`，再把不存在的相对后缀通过 `resolve` 拼回；最后只对规范化后的候选调用 `isInsideRoot`。根自身仍必须通过 `isPathTrustedAfterResolvingLinks` 和已钉住根检查，不能把失败的 `realpath` 当成授权。

```ts
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'path'

const resolveCandidateForComparison = async (candidate: string): Promise<string | null> => {
  let current = resolve(candidate)
  const suffix: string[] = []
  while (true) {
    const realCurrent = await realpath(current).catch(() => null)
    if (realCurrent) return resolve(realCurrent, ...suffix)
    const parent = dirname(current)
    if (parent === current) return null
    suffix.unshift(basename(current))
    current = parent
  }
}
```

- [ ] **Step 4: 运行通过测试和真实 smoke**

Run: `npx vitest run src/main/ipc/workspace-scope.test.ts`; `npm run smoke`

Expected: 授权单测通过；Electron smoke 覆盖打开工作区、新建、保存、冲突、重命名、搜索、关闭和系统文件关联，退出 0。

- [ ] **Step 5: 同步文档并提交**

记录 Windows 短路径与 `realpath` 口径、链接换靶拒绝和 smoke 版本；运行 `git diff --check`，再由维护者使用实际 PM 号提交：`git commit -m "fix: 修复工作区路径授权与冒烟门禁 #<PM号>"`。

### Task P0-02: 让生产搜索性能夹具使用真实信任根

**Priority:** P0，性能测试可信度阻断。

**Files:**
- Modify: `src/main/ipc/workspace-search-watch-production.perf.ts`
- Test: `src/main/ipc/workspace-search-watch-production.perf.ts`
- Reference: `src/main/trusted-paths.ts`, `src/main/ipc/workspace-handlers.ts`
- Docs: `docs/development/performance-baseline.md`, `docs/PROJECT-STATUS.md`

**Interfaces:**
- Consumes: `trustDirectory(root, { essential: true })`、真实 `isPathTrusted`、`registerWorkspaceHandlers`。
- Produces: 生产搜索测试通过真实窗口根授权后调用 `file:search-workspace`，不再使用只返回 `true` 的授权替身。

- [ ] **Step 1: 写失败测试**

在性能夹具装配前清空/隔离信任状态，保留当前 `isTrustedPath: () => true` 的错误替身，先断言测试会返回 `{ ok: false, error: { code: 'INVALID_TARGET' } }`，证明夹具确实没有进入性能测量。

```ts
expect(result).toEqual({ ok: false, error: { code: 'INVALID_TARGET' } })
```

- [ ] **Step 2: 运行失败测试**

Run: `npm run perf:workspace-search-watch`

Expected: 当前搜索样本失败为 `INVALID_TARGET`，而 watcher 样本可能通过；不能把单文件通过写成整套性能通过。

- [ ] **Step 3: 实现最小装配修复**

在 `beforeAll` 创建临时根并完成文件写入后调用 `trustDirectory(root, { essential: true })`；注册 handler 时传入真实 `isPathTrusted`，不要改生产 handler 的安全分支。

```ts
trustDirectory(root, { essential: true })
registerWorkspaceHandlers({
  hasWorkspaceRoot: () => true,
  workspaceRootFor: () => root,
  isTrustedPath,
  setWorkspaceRoot: () => undefined,
  clearWorkspaceRoot: () => undefined,
})
```

- [ ] **Step 4: 运行通过性能文件**

Run: `npm run perf:workspace-search-watch`; `npm run perf:production`

Expected: 搜索 IPC 返回最后一个文件的唯一命中，报告 `PRODUCTION_SEARCH_PERF_METRICS`；生产性能两个文件均通过或仅因真实阈值退化而失败，不能再因 `INVALID_TARGET` 失败。

- [ ] **Step 5: 同步文档并提交**

在性能基线中区分“夹具授权修复”和“实际性能结果”；使用实际 PM 号提交：`git commit -m "test: 修正生产搜索性能授权装配 #<PM号>"`。

### Task P0-03: 诊断并处理 5000 篇性能回归

**Priority:** P0/P1 交界，影响用户承诺和性能阈值可信度。

**Files:**
- Modify: `scripts/perf-baseline.mjs`, `scripts/perf-regression.mjs`
- Test: `scripts/perf-regression.test.mjs`, `src/main/indexing/workspace-index-production.perf.ts`, `src/main/ipc/workspace-search-watch-production.perf.ts`
- Docs: `docs/development/performance-baseline.md`, `docs/PROJECT-STATUS.md`

**Interfaces:**
- Consumes: `measureWorkspacePerformance({ documents, bytesPerDoc, query })` 和现有 200/2000/1500 ms 固定阈值。
- Produces: Node 22 至少三轮的 tree/index/search 分布、资源环境记录和根因结论；阈值只有在代表性基线和产品预算共同复核后才可变更。

- [ ] **Step 1: 写失败回归记录测试**

扩展 `perf-regression.test.mjs`，读取默认阈值、运行固定 5000×2048B 场景并记录超过阈值的键；测试必须证明超阈值退出非零而不打印 fixture 正文。

```js
expect(failed.code).not.toBe(0)
expect(String(failed.stdout)).toContain('超阈值')
```

- [ ] **Step 2: 运行失败命令并保留证据**

Run: `node --version`; `npm run perf:regression`; `npm run perf:regression`; `npm run perf:regression -- --documents 5000 --size 2048`

Expected: 在 Node 22 CI 版本和当前 Node 24 各保留三轮聚合结果，明确 tree/index/search 哪个阶段退化；不得用 `--update-baseline` 覆盖基线。

- [ ] **Step 3: 实现最小修复或证据化阈值决策**

为 `measureWorkspacePerformance` 增加 fixture 写入、三次 tree 样本、index 读/解析、search 读/扫描的分段指标，但保留 `treeMs/indexMs/searchMs` 和当前阈值口径。Node 22 与 Node 24 各跑三轮：若分段显示生产逻辑退化，另用对应生产性能文件先写失败断言再改实现；若只受设备、杀毒或 Node 版本影响，必须有同设备空闲/非空闲和 CI 对照后才能评审阈值。任一分支都禁止直接运行 `--update-baseline` 覆盖失败。

```js
const breakdown = {
  fixtureWriteMs,
  treeRunsMs,
  indexReadMs,
  indexParseMs,
  searchReadMs,
  searchScanMs,
}
```

- [ ] **Step 4: 运行性能与全量门禁**

Run: `npm run perf:regression`; `npm run perf:production`; `npm run typecheck`; `npm run test`; `npm run build`

Expected: 性能门禁退出 0，或报告明确的未达标项和停止扩张决定；不能把性能失败隐藏在“环境差异”一句话中。

- [ ] **Step 5: 同步文档并提交**

在 `performance-baseline.md` 写入设备、Node、样本、分位数、阈值和未覆盖场景；使用实际 PM 号提交：`git commit -m "fix: 收敛五千文档性能门禁结果 #<PM号>"`。

### Task P0-04: 消除生产依赖高危漏洞

**Priority:** P0，供应链和发布信任阻断。

**Files:**
- Modify: `package.json`, `package-lock.json`
- Test: existing build/test and a dependency-tree check
- Docs: `docs/PROJECT-STATUS.md`, `docs/development/release-validation.md`

**Interfaces:**
- Consumes: `electron-updater@6.8.9` 的 `js-yaml` 间接依赖。
- Produces: 生产树中的 `js-yaml` 至少为修复 CPU 消耗漏洞所需的兼容版本（当前目标不低于 `4.3.2`），并保留 Electron 更新功能。

- [ ] **Step 1: 写失败依赖检查**

执行 `npm ls js-yaml --omit=dev` 并把审计输出作为失败证据；检查脚本断言生产依赖树不包含低于 `4.3.2` 的 `js-yaml`。

```powershell
npm ls js-yaml --omit=dev
npm audit --omit=dev --audit-level=moderate
```

- [ ] **Step 2: 运行失败审计**

Run: `npm audit --omit=dev --audit-level=moderate`

Expected: 当前报告 1 个 high，指向 `js-yaml@4.3.1`。

- [ ] **Step 3: 最小升级**

优先执行 `npm update js-yaml`，确认锁文件只发生必要变更；不直接跨主版本升级，不执行无审查的全量 `npm audit fix`。

```powershell
npm update js-yaml
npm ls js-yaml --omit=dev
git diff -- package.json package-lock.json
```

- [ ] **Step 4: 运行依赖和全量门禁**

Run: `npm ls js-yaml --omit=dev`; `npm audit --omit=dev --audit-level=moderate`; `npm run typecheck`; `npm run test`; `npm run build`

Expected: 生产依赖审计无 moderate 及以上漏洞；构建和测试通过。

- [ ] **Step 5: 同步文档并提交**

记录依赖来源、版本、审计日期和未覆盖的 dev 依赖风险；使用实际 PM 号提交：`git commit -m "chore: 升级生产依赖并消除高危审计项 #<PM号>"`。

### Task P0-05: 清理失效脚本与发行入口

**Priority:** P0，贡献者可复现性和发布诚实性。

**Files:**
- Modify: `package.json`
- Modify: `scripts/ci-config-gates.mjs`, `scripts/verify-ci-config.mjs`
- Test: `scripts/verify-ci-config.test.mjs`
- Docs: `README.md`, `docs/README.md`, `docs/PROJECT-STATUS.md`

**Interfaces:**
- Consumes: 当前 `demo:soft`、`demo:soft:check`、`demo:soft:build` 指向不存在的 `design/soft-workbench`。
- Produces: `validateLocalScriptPaths(scripts, exists): string[]`；仅保留真实可运行脚本，README 不再链接不存在的设计资源。

- [ ] **Step 1: 写失败检查**

在 `ci-config-gates.mjs` 新增 `validateLocalScriptPaths`，检查 `--config`、`-p` 和明确的仓库相对目录引用；在 `verify-ci-config.test.mjs` 传入包含 `design/soft-workbench` 的脚本并断言返回缺失路径错误。

```js
expect(validateLocalScriptPaths(
  { demo: 'vite --config design/soft-workbench/vite.config.ts' },
  () => false,
)).toEqual(['demo 引用不存在的本地路径: design/soft-workbench/vite.config.ts'])
```

- [ ] **Step 2: 运行失败检查**

Run: `npm run demo:soft:check`

Expected: 因配置路径不存在失败，记录该命令不是产品运行入口。

- [ ] **Step 3: 最小修复**

删除三个无真实资源的 `demo:soft*` 脚本；如果文档需要设计规范，改指向 `docs/UI-INTERACTION-SPEC.md`，不恢复未维护的空原型。

```json
{
  "scripts": {
    "dev": "electron-vite dev",
    "typecheck": "tsc -p tsconfig.web.json --noEmit && tsc -p tsconfig.node.json --noEmit"
  }
}
```

上述片段只表达删除 `demo:soft*` 三项；其余现有脚本必须原样保留。

- [ ] **Step 4: 运行脚本与全量门禁**

Run: `npm run verify:ci-config`; `npm run lint`; `npm run typecheck`; `npm run test`; `npm run build`

Expected: 配置检查和全量工程门禁通过，`rg -n "demo:soft|design/soft-workbench" README.md docs package.json` 无当前入口残留。

- [ ] **Step 5: 提交**

使用实际 PM 号提交：`git commit -m "chore: 清理失效设计演示入口 #<PM号>"`。

### Task P0-06: 补齐许可、第三方声明和 Windows 候选材料

**Priority:** P0，公开发布前置条件。

**Files:**
- Create after rights review: `LICENSE`, `THIRD-PARTY-NOTICES.md`
- Create: `.github/ISSUE_TEMPLATE/bug.yml`, `.github/ISSUE_TEMPLATE/compatibility.yml`, `.github/ISSUE_TEMPLATE/data-safety.yml`, `.github/ISSUE_TEMPLATE/feature.yml`
- Modify: `README.md`, `docs/README.md`, `docs/development/release-validation.md`
- Modify: `scripts/ci-config-gates.mjs`, `scripts/verify-ci-config.test.mjs`
- Verify: `.github/workflows/build.yml`, `.github/workflows/release.yml`

**Interfaces:**
- Consumes: `package.json` 的许可证字段、Electron/Chromium 和 `resources/` 资产来源、GitHub Release workflow。
- Produces: `validateReleaseMaterials(root): string[]`、可审查的根许可证、依赖/资源声明、四类 Issue 模板和 Windows 候选记录格式。

- [ ] **Step 1: 写失败发行检查**

在 `verify-ci-config.test.mjs` 的临时目录中只写入 `package.json`，断言 `validateReleaseMaterials` 同时报告缺少 `LICENSE`、`THIRD-PARTY-NOTICES.md` 和四类 Issue 模板；补齐合成文件后断言无错误。测试材料不得伪装成仓库最终许可证。

- [ ] **Step 2: 运行失败检查**

Run: `npm run verify:ci-config`; `if (!(Test-Path LICENSE) -or !(Test-Path THIRD-PARTY-NOTICES.md)) { exit 1 }`

Expected: workflow 配置检查可能通过，但许可证材料检查失败；不得把 `package.json` 的 `MIT` 字段当作完整授权。

- [ ] **Step 3: 实现材料**

在确认版权所有者和第三方资产权利后写入准确的许可证文本；逐项列出生产依赖、Electron/Chromium 必要声明、图标和资源来源。无法确认的权利不得用猜测文本填充。

```text
候选 commit:
支持平台:
smoke 结果:
安装/升级/卸载环境:
用户文件保留:
未验证项:
```

- [ ] **Step 4: 验证 Windows 候选**

Run: `npm run build:win`; `npm run smoke`; 安装器在两个隔离环境分别执行安装 → 启动 → `.md` 文件关联 → 保存 → 升级 → 卸载，检查用户文件仍在。

Expected: 候选记录包含版本、commit、安装环境、失败/回退、文件保留和签名状态；未执行项明确为 `UNVERIFIED`。

- [ ] **Step 5: 同步文档并提交**

更新支持平台、已知限制、数据位置和卸载行为；使用实际 PM 号提交：`git commit -m "docs: 补齐许可与 Windows 候选发行材料 #<PM号>"`。

## P1：外部 Alpha 与核心任务验证

### Task P1-01: 完成两位现有用户真实任务基线

**Priority:** P0 研究并行项 / P1 输入，低成本验证核心任务是否真实发生。

**Files:**
- Modify: `docs/development/user-research/_index.md`
- Modify: `docs/development/user-research/seed-study-2026-09.md`
- Reference: `docs/development/strategy-validation.md`, `docs/PRODUCT-STRATEGY-REVIEW-2026-09-21.md`

**Interfaces:**
- Consumes: 两位已知用户、两周观察窗、脱敏任务记录表。
- Produces: 每人至少 3 次真实任务记录、阻塞、成果是否实际使用和下一次是否继续；不计算虚假的两人留存率。

- [ ] **Step 1: 写记录完整性检查**

为记录表增加检查规则：每个会话必须包含任务、原工具、完成/放弃、求助/绕路、保存重开、交付结果和再次使用字段；缺字段不能标记完成。

```ts
type SeedSession = {
  participantId: 'A' | 'B'
  task: string
  originalTool: string
  outcome: 'completed' | 'abandoned'
  assisted: boolean
  saveReopen: 'ok' | 'failed' | 'not-run'
  deliverable: 'used' | 'discarded' | 'not-run'
  nextUse: 'yes' | 'no' | 'unknown'
}
```

- [ ] **Step 2: 运行空表失败检查**

Run: `rg -n "未采集|未完成|UNVERIFIED" docs/development/user-research/seed-study-2026-09.md`

Expected: 当前空表仍显示未采集，不能被误读为研究通过。

- [ ] **Step 3: 执行脱敏观察**

使用合成副本或参与者同意的本地资料；只记录枚举、时长分桶、结果和阻塞，不记录正文、路径、搜索词或稳定文件身份。

- [ ] **Step 4: 复核与决策**

Run: `npm run typecheck`; `npm run test`; 手工检查每位用户 3 行记录和失败原因。

Expected: 记录可追溯到任务版本；由最大阻塞选择下一项代码工作，不因礼貌反馈或单次成功扩大范围。

- [ ] **Step 5: 提交**

使用实际 PM 号提交：`git commit -m "docs: 记录两位现有用户核心任务基线 #<PM号>"`。

### Task P1-02: 验证 15 分钟首次核心闭环

**Priority:** P1，外部 Alpha 激活门槛。

**Files:**
- Modify: `src/main/testing/electron-smoke.ts`
- Test: `src/main/testing/smoke-probes.test.ts`, `src/renderer/src/app/r11-core-task-entry.test.ts`, `src/renderer/src/components/WorkspaceSearchDialog/index.test.tsx`, `src/renderer/src/components/PublishDialog/index.test.tsx`
- Modify: `README.md`, `docs/coexistence.md`, `docs/export-formats.md`
- Docs: `docs/development/strategy-validation.md`, `docs/PROJECT-STATUS.md`

**Interfaces:**
- Consumes: 打开目录、搜索/反链、来源插入、保存重开、导出预检和模板入口。
- Produces: `runCoreTaskSmoke(evaluate, workspaceRoot): Promise<void>`，按真实 UI 执行来源查找、插入、保存重开和资源包导出；另有无口头帮助的 15 分钟人工记录格式。

- [ ] **Step 1: 写失败任务测试**

在 `smoke-probes.test.ts` 先约束核心步骤标记和错误输出；在 Electron smoke 中加入从合成资料找到末尾来源、插入引用、保存、切换后重开并导出的顺序断言；在现有 Testing Library 测试中断言失败/取消/冲突状态可采取行动。

```ts
await runCoreTaskSmoke(evaluate, workspaceRoot)
// 每步失败抛出 CORE_TASK_FAIL <step> <reason>，不得只检查最终 toast。
```

- [ ] **Step 2: 运行失败或现状确认**

Run: `npm run smoke`

Expected: 在 P0 未完成时不得把核心闭环标绿；失败记录具体步骤和错误码。

- [ ] **Step 3: 实现最小可发现性修复**

先实现 `runCoreTaskSmoke` 并复用现有合成来源夹具。若自动链路通过而真人任务失败，只允许从真实记录中选择一个最大阻塞另立失败测试；本任务不预先增加可见教程、AI、同步或团队功能。

```ts
const CORE_TASK_STEPS = ['find-source', 'insert-citation', 'save-reopen', 'export-bundle'] as const
```

- [ ] **Step 4: 运行闭环验证**

Run: `npm run smoke`; `npm run a11y`; `npm run typecheck`; `npm run test`; `npm run build`

Expected: 核心流程可在无口头帮助下执行，失败分支仍保留；输出文件可由接收方打开并记录兼容矩阵。

- [ ] **Step 5: 提交**

使用实际 PM 号提交：`git commit -m "feat: 打通资料到可交付文档的首次闭环 #<PM号>"`。

### Task P1-03: GitHub 外部 Alpha 发布和反馈闭环

**Priority:** P1，面向外部用户的最小发行。

**Files:**
- Modify: `README.md`, `docs/README.md`, `docs/development/release-validation.md`
- Create/Modify: `.github/ISSUE_TEMPLATE/bug.yml`, `.github/ISSUE_TEMPLATE/compatibility.yml`, `.github/ISSUE_TEMPLATE/data-safety.yml`, `.github/ISSUE_TEMPLATE/feature.yml`
- Verify: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: P0 Windows 候选、隐私说明、已知限制、2–3 分钟核心任务演示和脱敏示例项目。
- Produces: GitHub Draft Release、校验信息、安装说明、反馈分类和公开的验证范围。

- [ ] **Step 1: 写发布门禁检查**

检查 Release 文案必须包含 commit、支持平台、安装/升级限制、数据位置、已知未验证项和 smoke 结果；缺任一项时失败。

```yaml
candidate:
  commit: required
  smoke: required
  supportedPlatforms: required
  knownLimitations: required
  installationEvidence: required
```

- [ ] **Step 2: 运行失败检查**

Run: `npm run verify:ci-config`

Expected: 当前 workflow 配置门禁通过不等于候选可发布；缺少安装证据时文档检查仍失败。

- [ ] **Step 3: 生成 Draft Release**

使用候选 workflow，上传 Windows 安装器和校验信息；不把 Draft 自动提升为正式发布，不在正文中承诺未验证的平台。

```powershell
gh workflow run release.yml -f action=candidate -f tag=candidate-2026-09-21
gh release view candidate-2026-09-21 --json isDraft,targetCommitish,assets
```

- [ ] **Step 4: 复核反馈路径**

Run: `git diff --check`; 手工打开 Issue 模板和安装说明。

Expected: 外部用户能报告安装、兼容、数据安全和功能问题；诊断材料不要求上传正文、绝对路径或搜索词。

- [ ] **Step 5: 提交文档变更**

使用实际 PM 号提交：`git commit -m "docs: 建立 GitHub 外部 Alpha 发布入口 #<PM号>"`。

### Task P1-04: 完成 6–8 位外部用户任务对照

**Priority:** P1，证明陌生目标用户能理解定位并完成核心任务。

**Files:**
- Create after P0 exit: `docs/development/user-research/external-alpha-study.md`
- Modify: `docs/development/user-research/_index.md`, `docs/PROJECT-STATUS.md`
- Reference: `docs/development/strategy-validation.md`, `docs/coexistence.md`

**Interfaces:**
- Consumes: 6–8 位符合画像的外部用户，其中至少一半不是熟人；每人保留自己的常用工具和正常配置。
- Produces: `ExternalAlphaSession` 记录，字段固定为匿名参与者、题组、工具顺序、完成/失败、用时分桶、求助、保存重开、成果可读、第二次主动使用和最大阻塞。

- [ ] **Step 1: 写研究完整性检查**

在研究文档顶部定义机器可扫描的字段清单和结项规则；缺少失败样本、工具顺序、受助状态或成果检查时不得写“完成”。

```text
participantId | taskSet | toolOrder | outcome | durationBucket | assisted |
saveReopen | deliverableReadable | secondUse | blocker
```

- [ ] **Step 2: 运行进入条件检查**

Run: `rg -n "smoke.*退出 0|Windows.*安装|每人至少 3 次" docs/PROJECT-STATUS.md docs/development/user-research/seed-study-2026-09.md`

Expected: P0 或种子观察未完成时停止招募，不创建虚构会话。

- [ ] **Step 3: 执行交叉顺序任务**

每人用 Paperin 和自己的常用工具完成等价任务：找到旧资料并插入来源、跨两篇资料写结论、保存重开、形成可检查成果。A/B 顺序交叉，每项限时 15 分钟；超时、受助、错文档或不可读成果计失败。

```json
{
  "participantId": "P01",
  "toolOrder": ["Paperin", "常用工具"],
  "outcome": "completed",
  "assisted": false,
  "deliverableReadable": true,
  "secondUse": "unknown"
}
```

- [ ] **Step 4: 复核退出条件**

Run: `git diff --check`; 手工核对 6–8 位完整记录、全部失败和第二次使用证据。

Expected: 大多数用户无需口头教学完成核心任务，且至少 3 人第二次在真实任务中主动使用；否则只选择最大阻塞回到 P1-02，不进入 P2。

- [ ] **Step 5: 提交**

使用实际 PM 号提交：`git commit -m "docs: 完成外部 Alpha 核心任务对照 #<PM号>"`。

## P2：个人专业版与重复价值

### Task P2-01: 建立多结构大文档、第二设备和 8 小时稳定性门禁

**Priority:** P2，公开 Beta 前的稳定性门槛。

**Files:**
- Modify: `src/main/testing/fixtures/markdown-builders.ts`, `src/main/testing/electron-performance-smoke.ts`
- Test: `src/main/testing/fixtures/fixtures.test.ts`, `src/main/testing/electron-performance-smoke.test.ts`
- Modify: `scripts/smoke-electron.mjs`
- Docs: `docs/development/performance-baseline.md`, `docs/compatibility-matrix.md`, `docs/PROJECT-STATUS.md`

**Interfaces:**
- Consumes: 现有 `PerformanceFixtureKind`、5 MiB 长段落/多结构夹具和 Electron 性能阈值。
- Produces: `ElectronStabilityMetrics`，包含每种结构的打开/保存/导出样本、8 小时 Main/Renderer RSS 序列、watcher 数和 100 次标签关闭重开结果。

- [ ] **Step 1: 写失败测试**

把 5 MiB 夹具扩为 `large-paragraph`、`many-short-nodes`、`long-line`、`cjk-emoji`、`mixed-syntax` 五种结构；测试每种 UTF-8 字节数、首尾 marker 和异常/不完整语法仍存在。为稳定性汇总函数写入 30 分钟窗口中位数和增长率断言。

```ts
expect(summarizeStability(samples)).toMatchObject({
  restartCycles: 100,
  watcherLeak: false,
})
```

- [ ] **Step 2: 运行失败测试**

Run: `npx vitest run src/main/testing/fixtures/fixtures.test.ts src/main/testing/electron-performance-smoke.test.ts`

Expected: 新的五结构联合类型和 `summarizeStability` 尚不存在而失败。

- [ ] **Step 3: 实现最小门禁**

复用 `runElectronPerformanceSmoke`，逐结构执行打开、末尾编辑、保存和资源包导出，每种至少 20 次并保留超时；新增 `--stability-hours 8` 参数每 5 分钟采样内存和监听数，首小时暖机后比较末两小时窗口中位数，增长必须同时满足 `<=15%` 且 `<=100 MiB`。

```ts
export interface ElectronStabilityMetrics {
  fixtureKind: PerformanceFixtureKind
  samples: { openMs: number; saveMs: number; exportMs: number }[]
  restartCycles: number
  watcherLeak: boolean
  rssGrowthPercent: number
  rssGrowthMiB: number
}
```

- [ ] **Step 4: 运行两设备验证**

Run: `npm run perf:electron`; `node scripts/smoke-electron.mjs --performance --stability-hours 8`

Expected: 参考机和另一台 16 GB RAM/SSD 设备分别保存原始聚合指标；任何结构失败、内存单调增长或 watcher 泄漏都保留红灯。

- [ ] **Step 5: 同步文档并提交**

写明设备、commit、样本量、P50/P95/最大值和超时率；使用实际 PM 号提交：`git commit -m "test: 建立个人版长期稳定性门禁 #<PM号>"`。

### Task P2-02: 增加来源变化、缺失和移动提示

**Priority:** P2，强化“带来源且可持续维护”的核心优势。

**Files:**
- Modify: `src/shared/workspace-state.ts`
- Test: `src/shared/workspace-state.test.ts`
- Create: `src/renderer/src/lib/source-health.ts`, `src/renderer/src/lib/source-health.test.ts`
- Modify: `src/renderer/src/app/AppDialogs.tsx`, `src/renderer/src/components/QualityPanel/index.tsx`, `src/renderer/src/components/ContextDock/ContextDockPanels.tsx`
- Create: `src/renderer/src/components/QualityPanel/index.test.tsx`
- Docs: `docs/compatibility-matrix.md`, `docs/command-panels.md`, `docs/PROJECT-STATUS.md`

**Interfaces:**
- Consumes: 插入来源时的工作区相对路径、`document.stat(path)` 返回的 `modifiedTime`、当前 `WorkspaceIndex.documents`。
- Produces: `SourceSnapshot { path: string; modifiedTime: number }` 和 `evaluateSourceHealth(snapshots, index): SourceHealthRecord[]`；状态仅为 `current | changed | missing | unverified`，不保存正文或哈希。

- [ ] **Step 1: 写失败测试**

在 `workspace-state.test.ts` 覆盖绝对/越界路径拒绝、去重、数量上限和旧 schema 默认空数组；在 `source-health.test.ts` 覆盖 mtime 一致、变化、目标消失、索引不完整和同名不同目录。

```ts
expect(evaluateSourceHealth(
  [{ path: '资料/a.md', modifiedTime: 10 }],
  completeIndexWith('资料/a.md', 20),
)).toEqual([{ path: '资料/a.md', status: 'changed' }])
```

- [ ] **Step 2: 运行失败测试**

Run: `npx vitest run src/shared/workspace-state.test.ts src/renderer/src/lib/source-health.test.ts`

Expected: `sourceSnapshots` schema 和 `evaluateSourceHealth` 尚不存在而失败。

- [ ] **Step 3: 实现最小来源健康闭环**

插入引用成功后异步 `stat` 来源并更新工作区私有状态；索引加载后用纯函数派生状态，在质量面板显示“来源已变化/来源缺失/索引未完成”。路径缺失时只提供重新定位和打开搜索，不猜测新路径、不自动改正文链接。

```ts
export type SourceHealthStatus = 'current' | 'changed' | 'missing' | 'unverified'
export interface SourceHealthRecord { path: string; status: SourceHealthStatus }
```

- [ ] **Step 4: 运行相关和全量门禁**

Run: `npx vitest run src/shared/workspace-state.test.ts src/renderer/src/lib/source-health.test.ts src/renderer/src/components/QualityPanel/index.test.tsx`; `npm run typecheck`; `npm run test`; `npm run build`; `npm run smoke`

Expected: 状态重启后仍可派生，清除导航记录同时清除来源快照；正文 hash 在检查前后不变。

- [ ] **Step 5: 同步文档并提交**

说明 mtime 提示的局限和“移动不自动修复”边界；使用实际 PM 号提交：`git commit -m "feat: 增加来源健康与变化提示 #<PM号>"`。

### Task P2-03: 保存发布配置并输出项目交付报告

**Priority:** P2，个人专业交付价值。

**Files:**
- Create: `src/shared/publish-profile.ts`, `src/shared/publish-profile.test.ts`
- Modify: `src/shared/workspace-state.ts`, `src/shared/workspace-state.test.ts`
- Create: `src/renderer/src/components/PublishDialog/PublishProfileControls.tsx`
- Modify: `src/renderer/src/components/PublishDialog/index.tsx`, `src/renderer/src/components/PublishDialog/index.test.tsx`
- Create: `src/renderer/src/lib/delivery-report.ts`, `src/renderer/src/lib/delivery-report.test.ts`
- Modify: `src/renderer/src/lib/export-bundle.ts`, `src/renderer/src/lib/export-bundle.test.ts`, `src/renderer/src/hooks/exports/usePublishFlow.ts`, `src/renderer/src/hooks/exports/usePublishFlow.test.ts`
- Modify: `src/main/ipc/export-handlers.ts`
- Create: `src/main/ipc/export-handlers.test.ts`
- Docs: `docs/export-formats.md`, `docs/compatibility-matrix.md`, `docs/PROJECT-STATUS.md`

**Interfaces:**
- Consumes: 当前 `PublishOptions`、`PublishScope`、`DiagnosticRecord[]` 和资源包写出协议。
- Produces: `PublishProfile { id; name; options; scope }`、`DeliveryReport { schemaVersion: 1; generatedAt; documentCount; diagnosticsByCode; missingTargets; indexComplete }`；资源包新增 `reports/paperin-delivery-report.json`，不含正文、绝对路径或搜索词。

- [ ] **Step 1: 写失败测试**

覆盖配置名称清洗、最多 20 个配置、旧 workspace state 迁移、报告字段白名单、诊断计数、路径只保留工作区相对值；主进程测试拒绝 `../` 报告文件名、空数据和超过 1 MiB 的报告。

```ts
expect(buildDeliveryReport(index, diagnostics)).toEqual(expect.objectContaining({
  schemaVersion: 1,
  indexComplete: true,
  diagnosticsByCode: { BROKEN_LINK: 1 },
}))
```

- [ ] **Step 2: 运行失败测试**

Run: `npx vitest run src/shared/publish-profile.test.ts src/renderer/src/lib/delivery-report.test.ts src/renderer/src/lib/export-bundle.test.ts src/main/ipc/export-handlers.test.ts`

Expected: 配置 DTO、报告构建和报告写出协议尚不存在而失败。

- [ ] **Step 3: 实现最小专业交付**

将发布 DTO 移到 Shared，`export-bundle.ts` 只导入类型；`PublishDialog` 先拆出 `PublishProfileControls` 再接入保存/应用/删除，避免继续增长超过 250 行的组件。主进程把报告写入临时目录的 `reports/` 后再原子重命名；任一报告校验或写入失败则整个资源包失败，不留下半成品。

```ts
export interface PublishProfile {
  id: string
  name: string
  options: PublishOptions
  scope: PublishScope
}
```

- [ ] **Step 4: 运行全量与产物检查**

Run: `npm run typecheck`; `npm run test`; `npm run build`; `npm run smoke`

Expected: 保存配置重启后可用；导出目录同时含可读 `index.html`、完整资源和脱敏 JSON 报告；取消或失败不写目录，原 Markdown hash 不变。

- [ ] **Step 5: 同步文档并提交**

更新格式支持、大小上限和隐私字段；使用实际 PM 号提交：`git commit -m "feat: 增加可复用发布配置与交付报告 #<PM号>"`。

### Task P2-04: 建立 20 人四周重复使用队列

**Priority:** P2，决定个人专业版是否继续扩张。

**Files:**
- Create after P1 exit: `docs/development/user-research/retention-cohort.md`
- Modify: `docs/development/user-research/_index.md`, `docs/PROJECT-STATUS.md`
- Reference: `docs/development/strategy-validation.md`

**Interfaces:**
- Consumes: 至少 20 位已激活用户，day 0、W2（day 7–13）、W4（day 21–27）固定窗口。
- Produces: 每批整数分子/分母、失访、W2/W4 有效留存、W4 来源复用、首 14 天成果率和 Wilson 区间；不上传正文或路径。

- [ ] **Step 1: 写队列完整性检查**

冻结激活、有效编辑、有效复用和有用成果定义；表格必须保留未返回和撤回样本，不能删除失败者提高比例。

- [ ] **Step 2: 运行进入条件检查**

Run: `rg -n "至少 3 人|第二次.*主动使用|外部 Alpha" docs/development/user-research/external-alpha-study.md docs/PROJECT-STATUS.md`

Expected: P1 未退出时不启动四周队列。

- [ ] **Step 3: 执行两批观察**

每批至少 20 位已激活用户，自动代理数据与自报日记分列；失访保留在原分母并报告保守值和可能范围。

```text
cohortId | activatedAt | w2ValidUse | w4ValidUse | w4Reuse | usefulOutcome | lostOrWithdrawn | evidence
```

- [ ] **Step 4: 复核进入付款实验的门槛**

Run: `git diff --check`; 手工复算 W4 有效留存和来源复用的整数分子/分母及 Wilson 区间。

Expected: 两批分别达到 W4 有效留存 40% 和来源复用 25% 才进入付款实验；任一批失败则回到最大阻塞。

- [ ] **Step 5: 提交**

使用实际 PM 号提交：`git commit -m "docs: 建立个人版四周重复使用队列 #<PM号>"`。

### Task P2-05: 进行真实付款实验，不开发授权系统

**Priority:** P2，商业验证而非功能开发。

**Files:**
- Modify: `docs/development/user-research/_index.md`
- Create after entry condition: `docs/development/user-research/paid-value-study.md`
- Docs: `docs/PRODUCT-STRATEGY-REVIEW-2026-09-21.md`, `docs/PROJECT-STATUS.md`

**Interfaces:**
- Consumes: 至少 20 位激活用户的四周队列、专业交付结果、支持时间和真实反馈。
- Produces: 至少 5 位非关联用户的付款、退款、30 天使用和支持成本记录；没有自动授权、账号或订阅后台。

- [ ] **Step 1: 写研究前门槛检查**

检查 W4 队列、真实成果和重复使用字段是否齐全；不足时研究文档必须报告“条件未满足”。

- [ ] **Step 2: 运行门槛检查**

Run: `rg -n "W4|非关联|真实付款|条件未满足" docs/development/user-research docs/PROJECT-STATUS.md`

Expected: 当前只有 2 位已知用户，不能开始价格实验。

- [ ] **Step 3: 执行人工小额实验**

比较一次性 99–199 元创始支持包与年度维护表达；记录实际付款、退款、交付工时和支持时间，不把问卷意向计入付款。

```text
userId | offer | paidAmount | paidAt | refund30d | activeAt30d | supportMinutes | reason
```

- [ ] **Step 4: 复核商业决策**

Run: `git diff --check`; 逐项检查分子、分母、退款和退出样本。

Expected: 明确继续个人 Pro、暂停收费或回到任务价值；不以下载、Star 或“愿意付费”代替现金证据。

- [ ] **Step 5: 提交研究记录**

使用实际 PM 号提交：`git commit -m "docs: 记录个人专业价值与付款实验 #<PM号>"`。

## P3：团队与企业扩展（有条件）

### Task P3-01: 团队交付桥梁需求验证

**Priority:** P3，必须有真实团队重复问题。

**Files:**
- Create only after entry condition: `docs/development/user-research/team-handoff-study.md`
- Modify: `docs/development/user-research/_index.md`, `docs/coexistence.md`, `docs/export-formats.md`
- Docs: `docs/PRODUCT-STRATEGY-REVIEW-2026-09-21.md`, `docs/PROJECT-STATUS.md`

**Interfaces:**
- Consumes: 至少 3 个真实小团队、连续两个周期的相同交付/评审/维护问题。
- Produces: 真实团队重复需求、渠道共存约束、责任人/评审状态/更新时间/变更摘要字段的验证结果，以及明确的进入/暂缓决定；不声称实时协作。

- [ ] **Step 1: 写进入条件测试/检查**

研究索引必须拒绝在没有 3 个团队重复证据时创建团队方案文档。

- [ ] **Step 2: 运行检查**

Run: `rg -n "3 个|两个周期|团队" docs/development/user-research docs/PROJECT-STATUS.md`

Expected: 当前条件未满足，不能开始账号、权限或协作开发。

- [ ] **Step 3: 执行共存工作流观察**

记录作者如何把 Paperin 产物交给现有团队渠道，观察返工、交接和来源检查成本；不把共享目录包装成实时协作。

```ts
type TeamHandoffObservation = {
  teamId: string
  cycle: 1 | 2
  channel: 'git' | 'shared-folder' | 'yuque' | 'feishu' | 'confluence'
  reworkMinutes: number
  handoffBlocker: string
  repeatedNeed: boolean
}
```

- [ ] **Step 4: 冻结最高频团队结果的独立规格**

Run: `git diff --check`; 由 3 个团队逐项确认共同字段、交付渠道和不支持范围。

Expected: 只有一个明确团队结果进入下一份独立实现计划；身份中心、复杂 RBAC 和实时评论仍留在企业架构前置条件之后。

- [ ] **Step 5: 提交**

使用实际 PM 号提交：`git commit -m "feat: 建立团队文档交付桥梁 #<PM号>"`。

### Task P3-02: 企业内部知识库架构评审

**Priority:** P3，独立架构项目，不与个人版并行实现。

**Files:**
- Create after budget and team evidence: `docs/enterprise-architecture-proposal.md`
- Reference: `AGENTS.md`, `docs/PRODUCT-STRATEGY-REVIEW-2026-09-21.md`, `docs/domain-model.md`, `src/shared/ipc/channels.ts`, `src/preload/api.d.ts`

**Interfaces:**
- Consumes: 团队预算、采购意向、身份/权限/审计/部署/SLA 需求和个人版可靠性证据。
- Produces: 是否新增服务端、同步、SSO、RBAC、审计、备份、私有部署、监控和升级体系的架构决策；不把本地单机应用直接改名为企业产品。

- [ ] **Step 1: 写进入条件检查**

列出团队重复需求、预算、支持责任和安全要求；任一项缺失则架构文档只记录“不进入”。

- [ ] **Step 2: 运行检查**

Run: `rg -n "预算|采购|SSO|RBAC|审计|私有部署|SLA" docs/PROJECT-STATUS.md docs/development`

Expected: 当前没有企业证据，不能创建实现任务。

- [ ] **Step 3: 评审边界**

比较继续使用标准 Markdown + Git/语雀/飞书/Confluence，和新增服务端治理的总成本、数据边界、迁移风险与支持责任。

```text
decision: enter | defer | stop
identity: required | not-required | unknown
permissions: required | not-required | unknown
audit: required | not-required | unknown
deployment: local | private | hosted | unknown
supportOwner: named | missing
```

- [ ] **Step 4: 形成架构决策**

Run: `git diff --check`; 由维护者和真实团队代表复核。

Expected: 明确进入、暂缓或停止；不以功能清单替代预算和运维责任。

- [ ] **Step 5: 提交**

使用实际 PM 号提交：`git commit -m "docs: 评审企业知识库架构进入条件 #<PM号>"`。

## 完成前总验收

- [ ] `git diff --check` 通过，Markdown 围栏成对，所有当前相对链接可解析。
- [ ] 旧战略、旧计划、旧状态和旧 UI 规范名称只出现在明确标注的历史审计说明中，当前入口无残留。
- [ ] 本计划没有空任务或未定义接口；每一项任务都给出文件、失败测试、通过命令、文档和提交步骤。
- [ ] 文档变更本轮不声称修复 smoke、性能、漏洞或安装；代码任务执行后必须用新鲜命令输出更新状态。
- [ ] `git status --short` 只包含本次计划、战略入口、状态/规范和文档清理的预期变更。
- [ ] 实际提交前由维护者提供 PM 号；未提供前不生成伪造提交记录。
