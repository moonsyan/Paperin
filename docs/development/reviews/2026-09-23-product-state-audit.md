# Paperin 产品状态与代码审查证据（2026-09-23）

> 冻结基线：`e7ed2e9d7ba8ee66f38d3a4a71c451123821511f`，版本 `0.7.0`。  
> 本文是审查当日证据；后续修复状态进入 [PROJECT-STATUS](../../PROJECT-STATUS.md)，不回写本次反例为通过。  
> 产品判断见[战略报告](../../PRODUCT-STRATEGY-REVIEW-2026-09-23.md)。本次没有修改产品代码、现有测试、依赖锁文件、CI 或性能阈值，没有发布或推送远端。

## 1. 审查方法与覆盖

先确认 Git 工作区干净、当前提交和依赖，再核对文档、生产调用链、测试及发布配置。对新发现的边界问题使用临时合成探针；探针执行后删除，结果与既有测试分开报告。没有读取用户 `.paperin`、真实知识库正文或凭据。

| 审查域 | 生产链路/入口 | 直接测试或检查 | 结论范围 |
| --- | --- | --- | --- |
| 进程隔离 | `main/window/window-manager.ts` → `preload/index.ts` → `shared/ipc/channels.ts` | typed API、配置和安全测试 | 窗口 sandbox/contextIsolation 开启、Node 集成关闭；不能因此推定每个 IPC 安全 |
| 文件授权 | `main/ipc/workspace-scope.ts`、`trusted-paths.ts` | workspace-scope、file-read-auth 等测试 | 普通文件路径已有真实路径与调用窗口授权 |
| 正文保存/编码 | `main/ipc/document-save-handler.ts`、`file-io.ts` | 文件、冲突、编码和保存队列测试 | mtime/hash、跨进程锁、字符损失拒绝等已实现 |
| 中断恢复/版本 | `file-write-recovery.ts`、`history/version-store.ts` | 恢复测试和 write-recovery-process 测试 | 有恢复协议；非无限历史、非真实掉电证明 |
| 工作区状态 | `workspace-state-handlers.ts` → `settings/workspace-state-store.ts` | 既有 store 测试 + A01 新探针 | 状态 JSON 路径未复用上述安全边界，已复现越界 |
| 索引与内存 | `indexing/workspace-index-service.ts`、`workspace-search-corpus.ts` | 服务、预算、缓存、释放和失效测试 | 有界语料、generation、引用依赖失效已实现 |
| 搜索与监听 | `workspace-search-handler.ts`、`workspace-file-watcher.ts` | 搜索测试、独立性能门禁 | 缓存命中与 watcher 故障组合仍需补验证 |
| 编辑器 | `components/Editor/instance/useMilkdownInstance.ts` 及 plugins | GFM、公式、Mermaid、脚注、frontmatter、交互测试 | 语法与编辑基础齐备；真机 IME 未替代 |
| 会话与工作区 UI | `app/document-session/`、`AppWorkspace.tsx`、Sidebar/TabBar | 标签、关闭、工作区操作测试 | 一套工作区承接库内外文件、dirty、最近与收藏 |
| 知识复用 | WorkspaceSearchDialog → AppDialogs → Editor 引用插入 | 搜索、插入引用、真实核心任务 smoke | 入口与实际插入链路存在 |
| 来源维护 | `useSourceTracking.ts`、`source-health.ts`、`source-relocation.ts` | 既有单测 + A02/A03 Hook 探针 + 路径迁移调用链 | 逐篇基线/复核/显式重定位已落地，但文档身份转换与应用内改名/移动仍有缺陷 |
| 导出交付 | `hooks/exports/`、`export-preflight.ts`、`export-bundle.ts`、`delivery-report.ts` | 各格式测试、发布流程测试、核心任务 smoke | 资源包与普通导出预检不等价；接收方仍待验证 |
| 模板与首次使用 | `core-task.ts`、`document-collection.ts`、`writing-templates.ts`、文件命令/CommandPalette | 开始页、模板和入门一致性测试；本次隔离首屏观察 | 六类模板确有实现；生产首屏仍直接复用带 `R11_SYNTH_*` 标记的测试契约 |
| 主题/可访问性 | 九主题、字体、焦点与弹窗 | a11y 脚本、组件测试与弹窗调用链 | 静态颜色/轮廓门禁通过但有存量豁免；部分弹窗未接入统一焦点闭环，不代表弹窗或真机矩阵通过 |
| 更新/凭据/支持 | `main/index.ts`、`updater/`、`image-host-handlers.ts`、支持摘要 | 策略及 IPC 测试 | 默认生产更新可关闭、凭据使用 safeStorage；日志与隐私承诺另有问题 |
| 构建/发行/许可 | package、lock、build/release workflow、afterPack、许可隐私材料 | 本次 build、ci-config、audit、公开 Release 页面 | 有旧版公开发行；当前安装、签名、第三方分发材料仍需实物验证 |

路径均相对 `src/`，工程文件除外。覆盖主要模块不等于逐行形式化审计。

## 2. 本轮发现与复现

### A01 / P0：工作区状态目录可经 junction 越界

**证据等级：隔离合成文件系统已复现。**

调用链：[状态 handler](../../../src/main/ipc/workspace-state-handlers.ts#L22) 仅从窗口取得根路径；[store 的 stateDirectory](../../../src/main/settings/workspace-state-store.ts#L113) 拼接 `root/.paperin`；[写入路径](../../../src/main/settings/workspace-state-store.ts#L163) 直接 mkdir/writeFile/rename。没有复用 [workspace-scope](../../../src/main/ipc/workspace-scope.ts#L49) 的真实路径授权。

复现步骤：

1. 在自建临时根中创建 `workspace` 和 `outside-workspace` 两个兄弟目录。
2. 令 `workspace/.paperin` 为指向 `outside-workspace` 的 Windows junction。
3. 在根外目录放置合成合法 `settings.json`，包含可识别的 `lastSearchQuery`。
4. 调用实际 `WorkspaceStateStore.load(workspace)`，断言读到了根外值。
5. 调用 `writeSettings(workspace, nextSettings)`，断言根外 JSON 被更新。

临时命令：`npx vitest run src/main/settings/audit-workspace-state-probe.test.ts --maxWorkers=1 --minWorkers=1`。**1 项通过，76 ms**；该通过表示风险断言成立，不表示安全门禁通过。探针和合成数据已清理；先校验目标 realpath 均在自建临时根，再解除 junction 后删除临时目录。

影响范围是固定的工作区状态 JSON 文件，**不是任意文件名写入，也未证明远程攻击可达**。具备恶意/异常链接目录的工作区可能越过既有授权边界。修复应覆盖根、`.paperin`、最终文件、临时文件及换靶时序；不能只做字符串前缀判断。

### A02 / P1：切换标签被误当作首次保存身份迁移

**证据等级：受控 jsdom/React Hook 已复现，未做桌面手工复现。**

[useSourceTracking 的迁移 effect](../../../src/renderer/src/app/useSourceTracking.ts#L69) 只检查上一个引用 key 是临时身份、当前 key 是持久路径，没有确认两者代表同一份文档的保存转换。

步骤：草稿 A key=`@unsaved:draft-a` 插入来源 → `stat` 返回 mtime=99 → 切换至既有文章 B key=`文章/b.md`。

- 期望：B 的持久来源为空，A 的临时来源仍属于 A。
- 实际：持久来源出现 `{ citingDocumentPath: '文章/b.md', sourcePath: '资料/source.md', modifiedTime: 99 }`。

这会污染来源维护提醒，正文是否已经变动不是触发前提。建议用明确的保存身份映射驱动迁移，而非根据当前标签 key 的前后变化猜测。

静态调用链还确认：`resolveCitingDocumentKey` 只为工作区内路径生成可持久身份，已经保存的库外 Markdown 也会退化为 `@unsaved:*` 临时身份。因此影响不只是不落盘草稿；从库外文章 A 切换到库内文章 B，同样可能触发错误迁移，且库外文章的来源基线本身无法持久化。身份模型需要明确区分“未保存文档、已保存库外文件、库内文件和同一文档首次保存”，不能只用临时/持久二分。

### A03 / P1：异步来源登记晚于首次保存时遗漏持久归属

**证据等级：同一 Hook 探针已复现。**

步骤：草稿 A 插入来源但 `stat` 挂起 → A 首次保存为 `文章/a.md` → `stat` 才返回。

- 期望：持久来源属于 `文章/a.md`，临时列表为空。
- 实际：持久列表为空，记录仍在 `@unsaved:draft-a`。

[异步回包](../../../src/renderer/src/app/useSourceTracking.ts#L138) 使用插入时闭包中的临时身份，迁移 effect 不因记录晚到重新执行。真实保存还会改变文档 ID，见 [useDocumentSaving](../../../src/renderer/src/app/document-session/useDocumentSaving.ts#L161)，因此修复不能简单要求保存前后 ID 相等。

A02/A03 临时命令：`npx vitest run --config .audit-source.config.mts --reporter verbose`，**3 例，1 通过、2 失败，exit 1，2.07 s**。通过的对照为“stat 先完成，再保存同一草稿”，两个失败为上述行为契约。探针/配置已删除，未加入既有全量测试，不把故意失败的审查探针伪装成新增已通过回归。

### A04 / P1：监听故障与语料新鲜度未闭合

**证据等级：静态确认分支，最终用户表现待故障注入。**

[fs.watch adapter](../../../src/main/indexing/workspace-file-watcher.ts#L154) 捕获启动异常后返回空清理函数，未见运行时 `error` 订阅；[搜索语料命中分支](../../../src/main/ipc/workspace-search-handler.ts#L163) 不再读取文件 stat。监听不可用后可能保留旧内容，不能直接声称所有文件系统都会复现。应注入启动失败/运行时失败，验证是否降级重扫、显示未验证或恢复监听。

### A05 / P1：隐私表述与发布门禁存在缺口

- [main/index.ts](../../../src/main/index.ts#L50) 直接将 Error.message/stack 写入本地日志，可能带绝对路径；隐私文档的绝对“不写路径”表述过强。未发现自动上传日志链路，本次未读取真实日志。
- [release.yml](../../../.github/workflows/release.yml#L100) 的安装验收 job 为 `if: false`；正式发布校验 Draft/commit，但不以安装证据为必要条件。`verify:ci-config` 通过只证明当前配置校验规则得到满足。
- [verify-windows-install.mjs](../../../scripts/verify-windows-install.mjs#L310) 的 live 分支目前只对 `from` 调用安装器；第 317 行明确保留关联、smoke、升级、卸载与知识库 hash 的后续接线。相关 evidence 仍为 fail。这是未完成实现，不能概括成“脚本完整、仅缺人工运行”；本次没有在真实系统执行安装器。
- 三平台构建不等于三平台安装验收，Windows smoke 也不等于安装/升级/卸载循环。
- 第三方说明承认图标来源未单独核证；打包清单没有显式列出根许可材料，需要检查实际安装产物中的声明分发，不能据此直接宣称违法或已合规。

### A06 / P1–P2：文件规模与文档状态漂移

基于 `git ls-files` 对 `src/` 中非 `.test/.perf` TS/TSX 统计，370 文件、50,391 行；含注释、空行和开发夹具，末尾换行不计额外空行。38 文件超过 300 行，8 文件超过 450 行：

| 文件 | 行数 |
| --- | ---: |
| `src/renderer/src/app/AppComposition.tsx` | 771 |
| `src/renderer/src/lib/docx.ts` | 613 |
| `src/renderer/src/data/demo-files.ts` | 552 |
| `src/renderer/src/app/useAppSettings.ts` | 538 |
| `src/renderer/src/components/Editor/overlays/useEditorOverlays.ts` | 486 |
| `src/renderer/src/components/Editor/plugins/mermaidCodeBlock.ts` | 484 |
| `src/renderer/src/app/AppDialogs.tsx` | 470 |
| `src/renderer/src/components/Editor/instance/useMilkdownInstance.ts` | 462 |

`AppComposition` 中已有重定位业务和多个相关状态，与其“只做装配”注释不符；不建议整仓机械拆文件，应在身份/重定位修复中按职责收敛。

审查开始时，基线 README、旧战略、开发入口仍将逐篇来源、索引失效、缓存与搜索优化写为待实施；状态页则称“全部可自动化代码任务已完成”，同时保留旧行数和执行顺序。本次新反例说明后一表述也过强。同日文档收口已纠正当前入口（战略、状态、README、实施入口、审阅索引等）；历史审阅正文不改写。不得把文档纠正误当成已重新实现能力，也不得把 A01–A10 未修复项标绿。

### A07 / P2：导出预检和对外承诺需统一

[usePublishFlow](../../../src/renderer/src/hooks/exports/usePublishFlow.ts#L69) 有缺图检查、取消及独占导出处理，但没有调用普通格式的 `reviewExportMarkdown`。因此现有接收方矩阵“HTML 资源包预检同 Markdown”的表述未获调用链支持。仍有输出安全处理，**不能仅凭缺少某个函数调用推断没有任何安全校验**。建议用同一组断链、空图、危险 URL、集合范围夹具验证用户可见差异，再统一契约。

集合渲染对公式/Mermaid 的源码降级可在 [collection-markdown-renderer](../../../src/renderer/src/lib/collection-markdown-renderer.ts#L182) 核对；真实 Word/WPS/PDF 阅读器矩阵仍未验证。

### A08 / P1：应用内改名/移动没有迁移来源元数据

**证据等级：生产调用链静态确认，尚未补行为复现。**

[source-tracking](../../../src/shared/source-tracking.ts#L201) 已提供同时重映射引用文档路径与来源路径的 `remapSourceTrackingPath`，但生产代码没有调用者。[useWorkspaceFiles](../../../src/renderer/src/app/workspace/useWorkspaceFiles.ts#L144) 的重命名和 [workspace-move-file](../../../src/renderer/src/app/workspace/workspace-move-file.ts#L81) 的移动只迁移标签、正文、mtime、编码等会话状态。由此可推得：改名/移动引用文章后，来源基线仍挂在旧引用路径；改名/移动来源文件后，旧基线会把它显示为缺失。修复应与 A02/A03 共用文档身份与路径迁移契约，并增加“插入引用 → 保存/切换 → 改名/移动 → 重开 → 导出”的行为回归。

### A09 / P2：设置、弹窗与首次体验存在可见契约偏差

- [main.tsx](../../../src/renderer/src/main.tsx#L51) 在根元素全局设置 `spellcheck=false`，[useMilkdownInstance](../../../src/renderer/src/components/Editor/instance/useMilkdownInstance.ts#L95) 又对正文编辑根硬编码关闭；设置页虽然保存开关并调用 Electron 词典语言 API，仍无法让正文出现拼写检查。当前设置对主要编辑面实际无效。
- 项目已有统一 `useModalDialogKeyboard`，但设置、版本历史等弹窗仍以普通容器实现，缺少一致的 `role="dialog"`、`aria-modal`、焦点闭环和关闭后焦点恢复。`npm run a11y` 检查的是主题对比度与 CSS 焦点轮廓，不能替代这类行为验证。
- [demo-task-files](../../../src/renderer/src/data/demo-task-files.ts#L1) 的生产首次体验直接导入 `shared/testing/r11-fixture-contract`，隔离截图看到 `R11_SYNTH_*` 标记。它不是数据安全问题，但会降低普通用户对产品完成度和定位的理解。

### A10 / P1：当前默认测试与性能门禁未通过

**证据等级：本机重复执行。**

- `npm run test`：238 个测试文件通过，`scripts/verify-windows-install.test.mjs` 在收集阶段失败；1705 个已收集测试全部通过。`node --check`、文件 hash 与 esbuild 均正常。Vite SSR 转换把被导入可执行脚本的 import 提升到 shebang 之前，同时保留中间的 `#!/usr/bin/env node`，生成无效 JavaScript；隔离重跑一致失败。这是测试装配缺陷，不等同于安装逻辑行为失败，但默认门禁为红。
- `npm run perf:production`：3 项中 2 项通过，20,000 watcher 事件后的稳定 P95 为 **9867.21 ms**，超过 5000 ms。独立重跑为 **9687.87 ms**，再次失败；搜索 P95 仅约 33–37 ms，慢点集中在 watcher 后的索引稳定路径。尚未完成 profiling，不把历史 I/O 推断冒充当前根因。
- `npm run perf:regression`：树 243.99 ms、索引 3406.64 ms、搜索 1927.38 ms，分别超过 200/2000/1500 ms；分段显示主要墙钟在读盘，但仍应保持红灯，不放宽阈值。

## 3. 本次工程验证记录

环境：Windows、Node `24.19.0`、npm `11.17.0`；不冒充项目 CI 使用的 Node 22，也不代表第二台设备。

环境恢复：最初本地依赖不完整，`npm run lint` 因找不到 eslint 未启动；`npm ci --no-fund --no-audit` 按锁文件恢复后可运行。Electron 可执行文件缺失，首次 smoke 未启动，测试导入 Electron 时等待自动下载；下载失败后使用本机同版本归档，经包内官方 `checksums.json` SHA-256 一致性核验后恢复。没有修改锁文件，也没有用其他 Electron 版本替代。

| 命令/检查 | 本次结果 | 解释 |
| --- | --- | --- |
| `npm run lint` | 环境恢复后 exit 0 | 静态规则通过，不证明全部行为 |
| `npm run typecheck` | exit 0 | Web/Node 两套 TypeScript 检查 |
| `npm run build` | exit 0 | 包含再次 typecheck；产物可运行，非安装验证 |
| `npm run smoke` | 恢复 Electron 后 exit 0 | 系统参数打开、保存、冲突、重命名、搜索及引用→保存重开→资源包闭环 |
| `node scripts/smoke-electron.mjs --compatibility` | exit 0 | 61 篇合成文档只读链路/hash 不变，非第三方真实导出验收 |
| `npm run a11y` | exit 0 | 254 项，37 项基线豁免；焦点扫描无违规，仍非真机可访问性全通过 |
| `npm run verify:ci-config` | exit 0 | 不证明远端工作流运行或安装门禁已接通 |
| `npm audit --omit=dev --audit-level=moderate` | exit 0，0 告警 | 仅 npm 生产依赖分类；不等同最终应用全部依赖 |
| `npm audit --json` | exit 1，19 个受影响依赖条目 | 4 moderate、13 high、2 critical，主要关联 Vite/Vitest、electron-builder 依赖链；不等同 19 个独立可利用运行时漏洞 |
| `npm run test` | exit 1；238 文件通过、1 文件收集失败；1705 测试通过 | 失败根因是可执行 `.mjs` 的 shebang 经 Vite SSR 转换后落在模块中间；不是“全量测试通过” |
| `npm run perf:production` | exit 1；2/3 通过 | watcher 稳定 P95 9867.21 ms，独立重跑 9687.87 ms，均超过 5000 ms |
| `npm run perf:regression` | exit 1 | tree/index/search 三项均超阈值；本次不修改基线或阈值 |

完整 audit 中可见 `tar`、`vitest` 为 critical 条目。应按实际利用前提、开发服务是否暴露、构建输入与最终分发物分析，制定兼容升级与回归计划；本次未执行 `npm audit fix`，未自动升级主要版本。

`npm audit --omit=dev` 的后续确认重跑遇到内部 npm registry 504；表中 exit 0 来自本轮较早的成功执行。完整 audit 在同一依赖树上成功返回上述 19 条分类，后续需要按实际打包路径和利用前提分流，不能只看 `dependencies/devDependencies` 字段下结论。

## 4. 实际界面与外部资料检查

使用当前构建产物、独立临时 userData 和隐藏窗口抓取 1200×800 的首次欢迎界面，未读取日常用户设置。观察到：左侧示例树、中央编辑器、顶部标签和右侧大纲均实际渲染；正文是技术说明任务，第一步暴露 `R11_SYNTH_SOURCE_A_TTL` 夹具关键词。页面组织已有完成度，但三类场景入口的平衡、夹具标记对普通用户的可理解性值得真人观察。没有从一次截图断言九主题、所有缩放、屏幕阅读器和中文 IME 已通过。

本次 GitHub [公开仓库](https://github.com/moonsyan/Paperin)与 [v0.6.0 Release](https://github.com/moonsyan/Paperin/releases/tag/v0.6.0) 可访问；Release 页面显示 9 项资产，但资产动态列表未完整返回，本次未下载/安装。GitHub REST 查询受到匿名速率限制，因此不报告最新下载量、私有 Draft 或远端 CI 状态。

竞品均使用官方站点/帮助/仓库；详细链接随战略报告各项结论列出。语雀部分帮助/价格正文受限，明确不作价格与导出权益断言；没有试装全部竞品或进行主观打分。

## 5. 明确未完成的验证

- A01/A02/A03/A08 的生产修复与永久回归；A04 的监听故障注入；A10 的门禁恢复与性能 profiling。
- A09 的拼写检查行为、弹窗焦点闭环和面向普通用户的首次体验清理。
- 当前候选在两个隔离环境中的 Windows 安装/升级/卸载、文件关联和用户文件保留。
- macOS 签名/公证与 Finder、Linux 桌面集成；真正使用默认生产沙箱的完整安装环境矩阵。
- 两设备八小时稳定性、真实磁盘满/权限异常/掉电矩阵。
- 九主题 × 多缩放 × 窄窗口、真实输入法和辅助技术检查。
- 实际接收方的 HTML/PDF/DOCX 与 Pandoc 外部依赖验收。
- 两位用户真实任务、外部发现/确认轮、留存、实际付款和团队需求。

本次交付是审查和战略文档；这些未完成项不能因报告已交付而标绿。

返回 [审阅索引](_index.md) · [战略报告](../../PRODUCT-STRATEGY-REVIEW-2026-09-23.md)。
