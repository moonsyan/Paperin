# Paperin 战略落地实施任务计划

> 面向后续执行者：使用 `executing-plans` 按任务实施；如另行选择子代理实施方式，使用 `subagent-driven-development`，遵守当时的协作限制。下列复选框只表示实施状态，本轮交付计划不代表任务已执行。

**目标：** 将现有 Paperin 收敛为可信、易用的技术与项目 Markdown 知识工作台，再按真实使用证据进入商业与团队探索。

**架构：** 保留 Main → typed Preload → Renderer 边界、标准 Markdown 正文和 Milkdown 状态源。重点修正保存版本、内容转换、索引完整性及交付反馈，复用现有工作区、命令、面板和导出流程。

**技术栈：** Electron 43、React 18、TypeScript strict、Milkdown 7/ProseMirror、mdast/micromark、Vitest/Testing Library、electron-vite、electron-builder。实施时以锁文件为准，不在本计划顺带升级依赖。

**依据：** [战略报告](../../PRODUCT-STRATEGY-REVIEW-2026-09-20.md)、[代码审查附录](../../development/product-audit-2026-09-20.md)、[验收协议](../../development/strategy-validation.md)。已替代的 S00–S17 计划只在 Git 历史中保留追溯。代码基线 `b6ad9a5`，2026-09-20。

## 1. 全局约束与执行方法

- 近期只承诺 Markdown 知识库和写作；不并行建设通用 PDF/Office 检索、账号云同步和企业协作。
- 当前只有开发者与朋友两名已知用户；预计每周安排 20 小时，包括实现、测试、研究和文档。朋友不计研发产能。
- 所有文件操作保留成功、取消、冲突、编码失败和权限失败分支；不静默覆盖或丢弃用户内容。
- 保存继续传 `expectedMtime`，并在 R02 补足精确编辑基线；不能只扩大超时或关闭冲突检测。
- Renderer 不读用户文件；Shared 无平台副作用；新增/调整 IPC 同步 Main、Preload、`api.d.ts`、Renderer、测试及维护文档。
- 生产 `.ts/.tsx` 超过 450 行不得继续加功能；React 组件按仓库 250 行/状态/异步数量规则拆职责。拆分与当前任务一起交付，不做无关全仓重构。
- 每项工程任务先写失败测试，确认失败原因，实施最小变更，执行相关验证、更新文档，验证后独立提交。单步可在一个短工作时段内完成；跨进程任务不能为了小提交拆出不兼容的半套协议。
- 常规工程门禁为 `npm run typecheck`、`npm run lint`、`npm run test`、`npm run build`；UI/文件/IPC 追加 `npm run smoke`，UI 追加 `npm run a11y`；性能按 R09，在空闲环境串行测。
- 不把被跳过的测试当通过；不修改阈值、夹具或失败分母来通过门禁。外部环境不足记录阻塞范围，不推断成功。
- 每次提交遵循本仓库 `AGENTS.md` 的 `fix:`、`feat:`、`docs:`、`chore:` 中文摘要规则；不混入用户无关修改，不推送、不打 tag、不触发发布，除非当次任务明确授权。
- 工程负责人默认为项目开发者；用户研究由开发者主持，参与者自愿。平台验收由有相应设备的人执行；没有设备不冒充完成。

每项任务结项记录：`任务号 / 提交 / 失败测试 / 修复后结果 / 全量门禁 / 文档 / 人工边界 / 实际工时 / 下一项`。仅研究和文档任务不必重跑无关代码测试，但必须核查记录与链接。

## 2. 优先级、顺序和依赖总表

P0 表示必须先处理的发布/数据信任门禁，不表示已证明发生了严重事故；P1 为核心任务正确性和产品体验；P2 为有前置条件的增长与业务扩展。A 编号对应审查附录。

| 顺序 | 任务 | 级别 | 依赖 | 预计投入 | 可独立验收结果 |
| --- | --- | --- | --- | --- | --- |
| 1 | R00 恢复可重复验证环境与 lint | P0 门禁 | 无 | 3–5 小时 | 当前提交可完整执行门禁，失败被准确归因 |
| 2 | R01 严格编码与原字节保护 | P0 信任 | R00 | 5–8 小时 | A01 样例不再静默损坏 |
| 3 | R02 保存绑定读取版本 | P0 信任 | R00、R01 | 12–20 小时 | A02 完整窗口/IPC 用例证明旧版本不覆盖 |
| 4 | R03 集合输出内容保真 | P1 | R00 | 10–16 小时 | A03 四类复现和组合文档通过 |
| 5 | R04 输出范围与完成反馈 | P1 | R03 | 6–10 小时 | A04 缺图、空标签、索引不全准确处理 |
| 6 | R05 搜索与索引覆盖契约 | P1 | R00 | 8–12 小时 | A05 漏扫不再伪装完整 |
| 7 | R06 监听失效与坏文件隔离 | P1 | R01、R05 | 8–12 小时 | A06 目录变化和单篇错误不破坏整库可用性 |
| 8 | R07 草稿、历史与恢复边界 | P1 | R02 | 10–16 小时 | 多窗口恢复/历史范围明确且可验证 |
| 9 | R08 弹窗、IME、主题与焦点 | P1 | R00 | 6–10 小时 | 搜索/发布键盘路径完整，存量豁免有处理结果 |
| 10 | R09 核心兼容与性能矩阵 | P1，正确性为 P0 | R02–R08 | 10–16 小时 | 普通与大文档任务正确，性能有真实范围 |
| 11 | R11 入口与核心任务演示 | P1 | R04、R05、R08 | 6–10 小时 | 用户能发现引用与项目模板，不靠讲解 |
| 12 | R10 候选包、安装与更新验证 | P0 发布 | R09、R11 | 首平台 12–20 小时 | 对应平台可试用；三平台资源另外核实 |
| 可提前 | R12 两位用户任务基线 | P1 研究 | 无；操作用安全副本 | 2–4 小时整理，观察两周 | 逐人任务与真实阻塞记录 |
| 13 | R13 外部小样本与正式任务对照 | P1 验证 | R10、R11、R12 | 12–18 小时，招募另计 | 6–8 人发现轮；条件满足再做协议 12 人轮 |
| 14 | R14 重复使用与最大阻塞修复决策 | P1 验证 | R13 | 8–12 小时研究；修复另估 | 解释采用/放弃；决定是否进入下一阶段 |
| 条件项 | R15 专业交付与真实付费实验 | P2 | R14 有重复价值 | 8–12 小时研究，30 天观察 | 有付款/退款/支持成本证据或明确暂缓 |
| 条件项 | R16 小团队交付需求研究 | P2 | R14，至少 3 个团队需求 | 6–10 小时研究 | 明确共同任务，另立具体协作方案 |
| 贯穿 | R17 文档入口、许可材料与维护账本 | P1 维护 | 无，随任务更新 | 初轮 4–6 小时 | 当前状态、计划和发行声明无矛盾 |

R00–R14 加 R17 的初步任务投入合计 **122–195 小时**，不含缺陷复杂度超预期、招募等待、多平台新增设备与真实长运行占用。战略报告的 160–225 小时为含部分缓冲的规划范围，不是交付保证。实际工时每周复核一次。

依赖主链：`R00 → R01 → R02 → R07 → R09 → R10 → R13 → R14`；输出链 `R03 → R04`、知识链 `R05 → R06` 进入 R09；R11 在核心正确性成立后改入口。单人优先串行完成一个闭环，R12/R17 穿插。

## 3. R00：恢复验证环境和 lint 基线

**问题：** 本轮 `npm ci` 恢复 JS 依赖后 Electron 二进制仍缺失，3 个套件加载失败；lint 有 1 个 error、3 个 warning。

**文件：** 检查 `package.json`、锁文件、`.github/workflows/build.yml`；修改 `src/renderer/src/components/HelpDialog/index.test.tsx` 和 `app/workspace/useWorkspaceFiles.ts` 的实际问题；更新 `docs/REFACTOR-STATUS.md`。若触及超限 hook 行为，随任务拆文件操作职责。

**接口：** 不改变产品 API。先使用 README/CI 支持的 Node 22 环境，再验证 Electron 二进制实际存在且版本与锁一致。

- [x] 记录 `node --version`、`npm --version`，按锁安装，检查 `node_modules/electron/dist/electron.exe`（Windows）。下载失败按网络/缓存处理，不伪造可执行文件路径绕过加载。
- [x] 运行 `npm run lint` 复现未使用导入及三个依赖警告；删除无用导入。逐项检查 `flushActiveIf/mtimeOf/needsSave` 的捕获值与最新状态，不能单纯关闭规则。
- [x] 在 `useWorkspaceFiles.test.ts` 增加重渲染后切换 dirty、mtime 与保存动作的行为用例，旧闭包调用不得保存过期内容。
- [x] 执行针对测试：`npx vitest run src/renderer/src/app/workspace/useWorkspaceFiles.test.ts src/renderer/src/components/HelpDialog/index.test.tsx`；再跑全局门禁和 smoke。
- [x] 按命令记录退出码、测试数量、运行时版本；环境错误与断言失败分别记录；更新完成记录后提交。

**验收：** lint 零错误；依赖警告有正确修复或具体设计证明；Electron 测试真正加载，不能沿用本轮 1,374 项部分通过记录。

## 4. R01：损坏编码必须在写入前明确处理

**对应 A01 / 原 S01。文件：** `src/main/ipc/file-io.ts`、`file-io.test.ts`、必要时新建 `text-decoding.ts` 与直接测试；错误映射检查 `file-handlers.ts`；文档 `compatibility-matrix.md`、`file-write-recovery.md`。

**接口：** 保持 `decodeTextBuffer(Buffer)` 返回合法正文/编码/hash，非法输入抛已有 `UnsupportedEncodingError`；不把宽松替换当正常读取。合法 GBK/UTF-16 与 BOM 语义保留。

- [x] 在现有测试导入 `decodeTextBuffer`，加入以下首个失败测试：

```ts
it('带 BOM 的残缺 UTF-8 拒绝转换', () => {
  const broken = Buffer.from('中文笔记', 'utf8').subarray(0, -1)
  const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), broken])
  expect(() => decodeTextBuffer(bytes)).toThrow(UnsupportedEncodingError)
})
```

- [x] 补奇数字节 UTF-16LE/BE、孤立代理项、合法补充平面字符、合法 GBK 对照；读失败前后临时文件 hash 必须相等。
- [x] 执行 `npx vitest run src/main/ipc/file-io.test.ts`，确认新增样例在当前代码失败。
- [x] 将严格解码应用于 BOM 和无 BOM 分支，保留已知合法编码检测次序；若引入恢复预览，必须显示损失并输出副本，本任务默认选择拒绝损坏输入，不扩建恢复编辑器。
- [x] 同测打开/索引/历史读取的错误映射，再跑全局门禁与 smoke，更新说明并提交。

**验收：** 所有已支持合法编码往返不变；不完整输入不会变成正常正文；没有隐式改写原文件。

## 5. R02：保存校验当前文档实际读取版本

**对应 A02 / 原 S02。文件：** `src/main/ipc/file-io.ts`、`file-handlers.ts`、`document-save-types.ts`；`src/preload/index.ts`、`api.d.ts`；`src/shared/document-session.ts`；Renderer `app/document-session/` 的记录、打开、保存与回执链；`src/main/testing/electron-smoke.ts`。

**建议新增边界：** `src/shared/document-version.ts` 描述版本事实，Main `src/main/ipc/document-version-check.ts` 只判断冲突，文件 handler 负责授权与锁。`file-handlers.ts` 已超限，保存处理应抽到有语义的 `document-save-handler.ts` 并加直接测试。

**拟新增契约，实施时所有消费者同批更新：**

```ts
export interface DocumentFileVersion {
  modifiedTime: number
  size: number
  contentSha256: string
}
```

读取和成功保存返回此版本；每份文档记录保留自己读取/最后确认的版本。保存仍传 `expectedMtime`，同时传 `expectedContentHash`（64 位十六进制校验）；主进程在锁内校验当前普通文件字节。hash 只用于本地协议，不进入日志/遥测。旧会话没有 hash 时先重新读取并核对，不静默用最新全局 hash 代替。

- [x] 先保留审查探针作为失败测试：`expected=1000`、磁盘/全局基线 1200，旧请求不能仅因差值小于 500ms 被接受；针对拟新增 `expectedContentHash` 写比较测试，必须以请求旧 hash 与磁盘新 hash 比较。
- [x] 在 Main 集成测试创建隔离文件、模拟两个读取者 A/B；A 写入后 B 以旧版本保存，mtime 差值分别为 0、1、200、499、500、501ms，包含等长内容。
- [x] 成功断言不是只看错误码：磁盘必须仍为 A 的内容，B 保留 dirty；明确确认强制覆盖后才允许 B 写入。
- [x] 同步读取 DTO、Preload、记录模型、保存队列及回执；晚到回执只能确认实际写出的版本。编辑期间输入的新内容保持 dirty。
- [x] 运行相关 `file-io`、`save-lock`、`useDocumentSaving`、`save-receipt`、`useDocumentTabClosing` 测试，新增保存 handler 测试纳入全量；在 Electron 用两个真实窗口复验。
- [x] 覆盖锁等待期间授权撤销、切标签、快照超时和 forceOverwrite 取消；跑全局门禁和 smoke，更新 `domain-model.md`、`document-tab-lifecycle.md`、`system-file-open-and-close.md` 后提交。

**验收：** 不用时间容差代替内容版本；进程级缓存可优化读取，但不能覆盖请求自身基线。完整多窗口触发若被其他机制阻挡，也要保存其证据，并保留纯函数契约回归。

## 6. R03：集合导出保留文档语义

**对应 A03 / 原 S10。文件：** `lib/document-collection.ts`、同名测试、`hooks/exports/usePublishFlow.ts`；建议拆出 `lib/collection-markdown-renderer.ts` 与测试，集合排序/标题/模板保留原职责；更新 `docs/export-formats.md`。

**接口：** 保留 `renderMarkdownToHtml(markdown: string): string` 的兼容出口；内部统一解析 frontmatter、脚注与引用定义，HTML 仍按既有安全策略处理。不要为修内容保真放宽危险 URL/HTML。

- [ ] 加入以下失败用例，并用 DOM 结构而不是全文快照检查层次：

```ts
it('集合输出保留引用图片并隐藏元数据', () => {
  const html = renderMarkdownToHtml(
    '---\ntitle: 内部标题\n---\n\n![架构图][img]\n\n[img]: assets/a.png'
  )
  expect(html).not.toContain('title: 内部标题')
  expect(html).toContain('src="assets/a.png"')
  expect(html).toContain('alt="架构图"')
})
```

- [ ] 补中文脚注 reference/definition 关联、重复标签、两层列表、列表中的段落/代码/引用、引用式链接、不闭合 frontmatter、危险引用 URL。
- [ ] 运行 `npx vitest run src/renderer/src/lib/document-collection.test.ts` 确认至少本轮四类缺陷均被捕获。
- [ ] 修正 AST 字段与 block/inline 渲染职责，明确公式/Mermaid 在集合中是渲染结果还是声明过的降级；不允许无提示丢失。
- [ ] 将同一合成文档分别经单篇和集合输出，在浏览器查看 HTML；原 Markdown 文件 hash 不变，来源与图片完整。
- [ ] 全量验证后提交，记录输出差异和支持子集；不把 HTML 修复自动算为 PDF/DOCX 全部通过。

## 7. R04：输出范围、图片失败与完整性一致

**对应 A04 / 原 S10。文件：** `components/PublishDialog/index.tsx`、新建 `index.test.tsx`；`hooks/exports/usePublishFlow.ts`、新建同名测试；`useInlineExportImages.test.ts`；`app/resolve-collection-entries.ts`、现有 `resolve-collection-entries.test.ts`；`lib/export-bundle.ts`。

**接口：** 保留 `PublishScope` 联合类型。首版集合模式仅允许资源包导出，富文本复制只在“当前文档”模式可用并明确标注；不悄悄把 scope 降级。内联函数继续返回 `{ html, failed }`，调用者必须处理 `failed`。

- [ ] 写组件测试：选择标签但空输入时导出禁用并有可访问原因；集合模式“复制当前文档富文本”不可触发；不会回调成 `kind:'document'`。
- [ ] 用 hook 依赖注入返回 `{html:'<img src="mdimg://missing">',failed:1}`，断言不调用 `exportBundle`、不显示成功，原文和选定目录不被写入。
- [ ] 构造 `createEmptyWorkspaceIndex` 和 `truncated:true` 索引传入集合解析，首版直接拒绝输出并解释“索引不完整”；完整索引但某篇读失败也不生成残缺成功包。
- [ ] 对最多 200 篇边界、用户取消、重复点击、导出时切标签、已打开文档实时正文、标题/目录排序做回归。
- [ ] 执行新增组件/hook/集合测试与 `export-bundle.test.ts`；检查实际 HTML 的图片可离线打开；全局门禁后更新说明并提交。

**验收：** 产物、范围、反馈三者相符；取消或被阻止时无写入；原文件不被改写。

## 8. R05：统一覆盖报告并明确取消边界

**对应 A05 / 原 S03/S07。文件：** `src/main/ipc/file-io.ts`、`workspace-handlers.ts`、`src/main/indexing/workspace-index-service.ts`、`workspace-index-filesystem.ts`；Shared 索引 DTO、Preload 搜索结果、`WorkspaceSearchDialog/useWorkspaceSearch.ts` 与 UI；相关测试及 `compatibility-matrix.md`。

**建议新增：** `src/shared/workspace-coverage.ts` 定义共享覆盖模型，`src/main/ipc/workspace-search-handler.ts` 拆分全文扫描。现有公开通道复用；若添加取消通道必须登记在 `channels.ts`。

**拟共享契约：**

```ts
export type CoverageSkipReason =
  | 'file-size' | 'depth' | 'file-budget' | 'read-error'

export interface WorkspaceCoverage {
  complete: boolean
  scannedFiles: number
  skipped: Record<CoverageSkipReason, number>
  matchCapped: boolean
}
```

`complete` 表示范围内已完整检查；命中上限与扫描遗漏分别表达。总文件数未知就不展示虚假的百分比。所有跳过路径应有本地诊断，不能进入遥测。

- [ ] 用临时目录写三个失败场景：单篇 `2 MiB + 1 byte` 含唯一词；深度超限目录含唯一词；第 5,001 篇超预算。均不得显示完整无结果。
- [ ] 补命中达到 200 条但扫描被提前停止的语义、空库、权限失败、2 MiB 临界值与中文多字节尺寸；明确节点数和文件数不是同一预算。
- [ ] 实现统一覆盖累计；规模保护可以保持现值，但树、搜索、索引各自限制必须显示且文档一致。
- [ ] 定义查询 ID 与取消：新查询/关闭面板令旧任务在下一文件或 Worker 边界退出，旧响应不能改 UI。若首批只做到抑制响应，明确仍在扫描，不宣称已取消后台任务。
- [ ] 新建 `workspace-search-coverage.test.ts` 与 `useWorkspaceSearch.test.ts`，联合索引测试执行；验证 5,000 篇性能与全文精确词尾部命中，再跑全局门禁并提交。

## 9. R06：目录变化失效与逐文件失败隔离

**对应 A06 / 原 S03/S07。文件：** `src/main/indexing/workspace-file-watcher.ts`、同名测试、`workspace-index-service.ts` 与测试、Main 搜索 handler、`ipc/handlers.ts` 装配；使用 R05 覆盖模型。

**接口：** watcher 明确区分文件变化与全量失效，不能用伪造 `.md` 路径骗过过滤器。建议回调事件：

```ts
export type WorkspaceChange =
  | { kind: 'files'; paths: string[] }
  | { kind: 'rescan'; reason: 'directory' | 'unknown' }
```

- [ ] 将附录根路径/目录路径 0 回调探针变成使用假计时器的失败测试，期待一次合并后的 rescan。
- [ ] 模拟 Windows 与 POSIX 路径、目录移动、无文件名事件、隐藏目录过滤、20,000 条变化合并、关闭/切库取消旧 timer。
- [ ] 让每篇读取失败转为本地诊断和 `read-error` 计数；正常文件继续索引/搜索。进程级错误仍失败，不能把所有异常吞成成功。
- [ ] 用一篇合法 Markdown、一篇残缺字节、一篇被删除文件验证可用结果、完整性为 false、可再次扫描恢复。
- [ ] 执行 `workspace-file-watcher.test.ts`、`workspace-index-service.test.ts`、新增搜索覆盖测试及 `npm run perf:workspace-search-watch`；全局门禁后同步文档提交。

## 10. R07：草稿、历史与多窗口恢复可解释

**对应 A07 / 原 S02/S09。文件：** `hooks/useDraftPersistence.ts`、新建同名测试；`app/document-session/useDocumentSession.ts`、`useDocumentRestore.ts`、`src/main/history/version-store.ts`、设置/草稿存储和其测试。

**接口：** 不把 fresh 窗口直接加入共享草稿写入而造成相互覆盖。先复用文档身份设计，记录会话所有者与确认的磁盘版本；UI 明确“保存完成”和“草稿备份完成”是不同状态。

- [ ] 失败测试覆盖 fresh 窗口未保存输入后恢复、两窗口同路径草稿竞争、持久化被拒绝、重启后磁盘已修改、关闭前末次输入。
- [ ] 若采用独立会话草稿，新增 `draftSessionId` 并在 Main 独立存储，迁移旧数据缺字段时保留原草稿，不清空；禁止两个窗口覆盖彼此记录。
- [ ] 草稿写失败保留编辑与 dirty、给出一次可理解提示并提供重试；不以 toast 自动触发破坏性恢复。
- [ ] 明确大于 2 MiB 历史不支持、20 份/5 MiB 淘汰和删除时历史清理规则；选择扩容需另测容量，不借此承诺完整备份。
- [ ] 相关草稿/恢复/历史测试与真实两次重启通过；补权限、异常退出和跨窗口记录；全量验证后更新恢复说明提交。

**验收：** 用户知道哪些内容已落盘、哪些可恢复；不能为了“恢复成功”覆盖外部新版本。

## 11. R08：搜索与发布弹窗的完整键盘体验

**对应 A07 / 原 S05。文件：** `WorkspaceSearchDialog/index.tsx`、`PublishDialog/index.tsx`、相应测试、焦点 hooks；复用 `CommandPalette`/现有弹窗模式。主题样式和 `docs/ACCESSIBILITY-SMOKE.md`。

**接口：** 弹窗具备可访问名称、`role="dialog"`、`aria-modal`、初始焦点、Tab/Shift+Tab 约束、Escape 和关闭后的焦点恢复。输入法组合态 Escape 不关闭。

- [ ] 新增 Testing Library 断言：按 role/name 查到弹窗；Tab 不能落到背景动作；触发元素卸载时焦点落到安全工作区入口。
- [ ] 用 `compositionstart`→Escape→`compositionend` 序列验证不误关，导出忙时按既有取消策略处理；真实 IME 仍需手测。
- [ ] 对照当前主题 37 项豁免，区分正文/交互必需对比和装饰性边框；先修影响核心任务的文本与焦点，不机械删除豁免。
- [ ] `npm run a11y` 加组件测试；在目标设备九主题、100/125/150% 缩放、窄窗口执行矩阵，记录实际未测组合。
- [ ] 全局门禁和 smoke 后同步设计说明提交。

## 12. R09：兼容、保存时序与性能共同验收

**对应原 S01–S03/S10。文件：** `src/main/testing/electron-performance-smoke.ts`、`scripts/smoke-electron.mjs`、现有编辑器/输出测试；新增合成夹具放 `src/main/testing/fixtures/`；文档 `development/performance-baseline.md`、`compatibility-matrix.md`。

**输入：** R02 磁盘版本回执、R03/R04 输出契约、R05 覆盖状态。**输出：** 绑定提交、环境、夹具与样本次数的验证报告。

- [ ] 建立普通、阈值两侧、固定长段落 5 MiB、多结构 5 MiB 四类；多结构含中文、列表、表格、代码、公式、Mermaid、脚注、frontmatter 与不完整输入。
- [ ] 每类先验正确性：末尾原文和最后输入落盘，晚输入保留 dirty；切文档/IME/超时/关闭不串文档；导出不漏内容。
- [ ] 运行现有 `npm run smoke`、`npm run perf:electron`、`npm run perf:production`，再按协议补多结构与重复次数，不能把合成扫描速度算用户动作总时延。
- [ ] 按既有体验预算记录普通输入 P95 50ms、保存 500ms、20 标签切换 300ms、5 MiB 打开 10s/保存 5s、5,000 文档搜索 P95 800ms；未达标保留结果并定位，不直接改目标。
- [ ] 第二台设备、8 小时稳定性、系统权限/磁盘满/进程终止按原 Q01/Q02/M01 协议执行；设备不足写未验证，不让长运行排挤安全修复。
- [ ] 不在构建/全量测试高负载并行时宣称性能基线；保存原始匿名合成测量后更新状态并提交。

## 13. R10：候选包先验收，再进入正式发行

**对应 A08 / 原 S04/S14。依赖 R09、R11。文件：** `.github/workflows/build.yml`、`release.yml`、`scripts/verify-ci-config.mjs`、`package.json`、`src/main/index.ts` 更新流程、`window/system-file-open.ts`；新增 `docs/development/release-validation.md`。

**接口：** 工作流先产候选 artifact/draft，正式发布必须关联同一提交、候选校验记录与明确发布动作。不得把打包通过当安装成功。

候选必须包含 R11 的最终入口变更；验证后再有 UI、文件或协议修改时，重新验证对应候选，不能拿上一提交的安装证据为新版本背书。

- [ ] 为 release workflow 补配置测试：缺 smoke/候选验收步骤或直接无条件正式发布应失败；不得仅验证 build workflow。
- [ ] 运行 `npm run build:win` 等实际目标命令只产包；任何正式 tag/远端发布留给明确发布任务。
- [ ] 首个试用平台至少两个独立环境、每环境至少三次完整安装/启动/关联/保存/卸载流程，按原 S04 条件记录；不能在个人唯一真实配置上做破坏性升级实验。
- [ ] 更新验证覆盖下载失败、完整性失败、重启、配置/草稿迁移、旧版本回退、用户文件保留；macOS 签名/公证和 Linux MIME/字体逐项说明。
- [ ] 若先 Windows，单独同步产品支持范围；三平台正式承诺仍需三平台证据。维护 `release-validation.md` 后提交工作流/文档。

**估算：** 12–20 小时只包含首平台工程与组织验收，不包含三平台硬件获取、签名费用与所有等待；资源不足不进入该平台正式发布。

## 14. R11：让用户发现已存在的核心价值

**对应原 S05/S06/S08/S11。文件：** `components/StartScreen/index.tsx`、`app/useGraphView.ts`、搜索结果/反链入口、`app/actions/commands/file-commands.ts`、示例数据及其测试；README 与命令说明。

**产品结果：** 用户第一次能完成“打开资料 → 用来源写一段技术说明”。六类模板已经存在，本任务不重建模板系统。

- [ ] 先观察两人开库后的首个动作；记录自动图谱是否打断任务。若改变默认激活行为，在 `useGraphView.test.ts` 增加“开库保持文档上下文，手动打开图谱仍有效”的失败用例。
- [ ] 统一开始页、示例、README 与 package 描述中的任务表达；首屏引导打开/继续资料，提供可发现的模板与引用动作，保持顶栏简洁。
- [ ] 示例只用合成内容，包含旧笔记、目标技术说明和可用来源；不自动写入用户工作区。
- [ ] 测试首次打开、关闭全部标签、外部文件、无库模板、撤销、窄窗口和命令入口；不引入强制账号、打卡或弹窗导览。
- [ ] 两位用户无口头提示完成一次演示任务；全局/UI 门禁后更新 README/命令说明并提交。

## 15. R12：两位现有用户的真实任务基线

**类别：** 用户研究，不是研发功能。可前置，访谈不受环境阻塞；操作研究使用合成或可恢复副本。

**交付：** 新建 `docs/development/user-research/seed-study-2026-09.md` 和该目录 `_index.md`，不记录真实正文、绝对路径或可识别个人资料；父级文档只链接该分组入口。

- [ ] 每人说明最近三次知识/技术文档任务、现有工具、文件规模/最大文件/深度、常用交付方式、遇到的实际阻塞。
- [ ] 两周中每人至少记录三次任务，使用下表；没有完成就保留未完成原因。

| 匿名参与者 | 任务类型 | 原工具 | 完成/放弃 | 求助与绕路 | 成果是否实际使用 | 下次是否继续 |
| --- | --- | --- | --- | --- | --- | --- |

- [ ] 对照代码问题标记任务影响，不因参与者是朋友而把礼貌评价当采用理由；两人分别呈现，不报“留存率成功”。
- [ ] 形成最大三个阻塞及对应 T 编号；没有使用数据的字段写“未采集”，不虚构记录。文档核查后提交。

## 16. R13：外部任务对照

**依赖 R10/R11/R12。交付：** `user-research/external-task-study.md`、匿名逐人结果和测试材料说明；沿用 `development/strategy-validation.md` 指标字典。

- [ ] 招募 6–8 位已有 Markdown 且经常维护技术/项目文档的人，至少一半非熟人；参与联系在对应执行任务明确授权后进行。
- [ ] 两个等价任务交叉顺序：从资料找两条依据→带来源写说明→保存重开→交付并检查；对照工具保留日常插件/配置。
- [ ] 记录成功、求助、放弃、耗时、来源正确性、缺图/断链、接收方是否能使用；失败不能从分母删除。
- [ ] 先用发现轮定位问题，再积累正式 12 人协议样本；至少 10/12 独立成功、配对中位耗时改善目标 30%，质量不能下降。人数不足不自动换成更低门槛。
- [ ] 输出最大阻塞及继续/修改判断；数据与同意范围核对后提交脱敏报告。

**验收：** 研究记录可信完整即可完成研究任务；目标未达标要明确写未达标，不能把“完成研究”写成“产品优势已成立”。

## 17. R14：重复使用验证与下一阶段选择

**依赖 R13。交付：** `user-research/repeated-use-study.md`、下一迭代决策；不新增后台遥测。

- [ ] 追踪原任务一周后是否更新/复用原文档，逐人记录自发与受提醒行为。
- [ ] 条件允许后按原协议两批各至少 20 名已激活用户观察各自 28 天；时间未成熟不计算完整 W4。
- [ ] 报告有用成果、W4 有效使用、W4 复用、失访和放弃原因；沿用 40%/25% 初始门槛，并同时报告分子/分母。未达标不是研究失败，而是战略决策证据。
- [ ] 每轮只选择一个最大阻塞进入新工程任务，附工时、失败测试与预期改善；本表 8–12 小时不包含尚未确定的修复代码。
- [ ] 若两轮都无重复价值，暂停扩功能并复核任务/画像；若成立，选择“项目文档维护”或“专业交付”一个主方向，更新计划并提交。

## 18. R15：真实付费实验（有条件）

**进入条件：** R14 有外部重复价值且核心安全、交付和支持流程稳定。默认状态为“条件未满足，不开发收费系统”。

**交付：** `user-research/paid-value-study.md`，专业交付样例、报价表达、实际付款/退款与支持汇总；许可材料依赖 R17。

- [ ] 与至少 15 位完成过核心任务的用户了解真实交付成本，区分愿意付费与已经付款。
- [ ] 使用当前已可靠的输出制作专业样例，比较一次性许可/年度维护表达；报价、支付、联系和支出由对应执行任务明确授权。
- [ ] 在真实小实验中记录至少 5 位非关联付费用户的 30 天付款、退款、使用与支持成本；没有交易则商业仍未验证。
- [ ] 两轮无付款理由则暂停收费扩建；保存、恢复和取回自己文件不设为付费门槛。
- [ ] 仅在证据成立后另立计费/授权功能方案；本任务不构建支付后台，不预测未证实收入。

## 19. R16：小团队交付研究（有条件）

**进入条件：** 个人核心闭环稳定，至少 3 个真实小团队重复提出相同任务，并有相应维护资源。

**交付：** `user-research/team-handoff-study.md`，团队任务、现有 Git/语雀/飞书等流程、共同缺口和是否立项的决定。

- [ ] 验证个人文档如何交给同事阅读/评审，不把共享目录称为实时协作。
- [ ] 分别判断问题属于导出、版本比较、阅读发布还是多人编辑；只选共同高频问题。
- [ ] 对拟进入方向列身份、权限、冲突、审计、备份、运维和支持成本；若资源不具备，保持与现有团队平台共存。
- [ ] 研究结束输出一个边界明确的新方案或暂缓理由；不在本计划直接执行企业平台建设。

## 20. R17：文档、许可材料与维护账本

**对应 A09。文件：** `README.md`、`docs/README.md`、`REFACTOR-STATUS.md`、`PRODUCT-STRATEGY-REVIEW-2026-09-20.md`、本计划、`package.json`；有权利依据后补根 `LICENSE` 与第三方材料；`package.json` 中不存在资源对应的 `demo:soft*` 脚本应清理或恢复实际资源。

- [x] 删除已被本轮审查替代的 `PRODUCT-STRATEGY-ROADMAP.md` 和 `NEXT-DEVELOPMENT-PLAN.md`，更新 README、索引、验收协议与计划链接；旧内容在 Git 历史中追溯。
- [ ] 以当前代码核对声明，保留历史作为历史；不继续把引用流程、模板当未实现，也不把平台/用户验收写成已完成。
- [x] 明确本轮战略/实施入口；完成状态只更新 `REFACTOR-STATUS`，本轮审查证据保留原快照。
- [ ] 核对项目许可声明与第三方分发材料，不能仅依据 MIT 字段做全部权利结论；不删除 Chromium 必需声明。
- [ ] 为超限逻辑文件维护“本次触及职责/拟拆边界/直接测试/实际行数”账本；示例数据单列，不为了数字机械拆分。
- [ ] 检查本地 Markdown 链接、计划依赖和工时，不制造多个互相矛盾的任务顺序。文档修改用 `docs:` 独立提交。

## 21. 首两个周末的具体开工顺序

1. 工作日短时段：R00 复现与环境恢复，R01 写失败测试；同时 R12 收集两人的任务背景。
2. 第一个周末：完成 R01 的最小修复、全量验证和提交；开始 R02 的 IPC/双窗口复现，不急于大改保存协议。
3. 第二周工作日：完成 R02 的版本契约、失败场景与文档设计，将所有受影响 DTO/消费者列齐。
4. 第二个周末：实现并验证 R02；若没有完成正确性证明，继续该任务，不为了日历推进开始输出或商业扩张。
5. 后续按 R03–R11 逐项推进，R12/R17 穿插；R13 只能在适用平台候选和核心安全通过后扩大真实资料试用。

## 22. 完成标准与交接

每项工程任务的完成必须同时包含实现、行为测试、相关文档、全量门禁、适用人工证据与独立提交；仅写了代码或只有单元测试通过不得勾选完成。

研究、发行和商业分别结项：研究执行完不等于指标达标，构建完不等于安装验证完，有报价不等于有收入。缺少设备、用户样本或资源时，记录其影响与下一步，不把条件项写成已完成。

本次交付的是完整战略和实施任务文档。执行从 **R00 → R01 → R02** 开始；R15/R16 保留为有条件的后续任务，不是近期必须实现的功能。
