# 2026-09-20 产品审查：代码与验证证据

> 历史快照：审查基线 `b6ad9a5951231c0888f2aaa26d3fbc99d1ac4e0c`，版本 0.6.0。原配套战略和执行计划已由 2026-09-21 文档替代，历史版本从 Git 查阅。
> 本文保存当时证据，不代替后续修复和当前状态。当前入口：[战略报告](../PRODUCT-STRATEGY-REVIEW-2026-09-21.md)｜[项目状态](../PROJECT-STATUS.md)｜[实施计划](../superpowers/plans/2026-09-21-product-strategy-implementation.md)。本轮没有修改产品实现，没有写入用户知识库，没有触发远端发布。

## 1. 环境与执行结果

环境：Windows、Node.js `v24.19.0`、npm `11.17.0`，锁文件中的 Electron `43.4.1`。README 推荐 Node 20/22，CI 使用 Node 22；本轮 Node 24 结果不能代替 Node 22 CI 结果。

开始时工作区干净，已有 `node_modules` 目录但缺 `tsc`/`vitest` 实际入口。按现有锁文件执行 `npm ci --no-audit --no-fund` 成功安装 999 个包，没有修改 `package.json` 或锁文件。以下分开记录环境问题和代码检查结果。

| 检查 | 本轮结果 | 解释 |
| --- | --- | --- |
| 首次 `npm run typecheck` / `npm run test` | 未进入检查，命令缺失 | 依赖目录不完整；不计为 TypeScript 或测试断言失败 |
| 恢复依赖后的 `npm run typecheck` | 退出 0 | Renderer 与 Node 两套配置检查通过 |
| `npm run test` | 退出 1；190 文件通过、3 文件加载失败；执行到的 1,374 项通过 | 失败来自 Electron 二进制未安装，不能写成“193 文件全通过” |
| `npm run build` | 退出 0 | 包含类型检查，Main/Preload/Renderer 生产构建成功；未运行安装器 |
| `npm run lint` | 退出 1；1 错误、3 警告 | 属于仓库现有门禁失败，具体位置见 A08 |
| `npm run a11y` | 退出 0 | 254 项主题检查中 37 项基线豁免；31 个样式表焦点检查无新增违规、有 1 项豁免 |
| `node scripts/verify-ci-config.mjs` | 退出 0 | 只证明 `build.yml` 的三平台步骤配置满足脚本要求，不证明远端执行或安装行为 |
| `npm run smoke` | 退出 1，未启动 Electron | 缺 `node_modules/electron/dist/electron.exe`，属于运行环境阻塞 |
| 内存加载真实生产函数的定向探针 | 完成 | 复现 A01、A02、A03、A06 的指定输入；不写用户文件 |
| 新报告链接/结构检查 | 通过 | 三份新增文档本地链接可解析、围栏配对；R00–R17 齐全，91 个步骤均为未执行；不能把代码门禁失败改写为通过 |

Electron 缺失导致加载失败的三个套件是 `src/main/ipc/export-docx.test.ts`、`workspace-link-index.test.ts`、`workspace-tag-index.test.ts`。首次全量执行耗时 284.89 秒。环境恢复和后续重跑如有结果，追加在此，不覆盖首次记录。

恢复尝试：执行 Electron 官方安装脚本未获得可用二进制；随后使用有 120 秒超时的下载请求获取对应版本官方 Windows 包，实际只收到 2,110,658 / 150,154,788 字节，退出码 28。未使用不完整包，也未通过修改 Electron 入口伪造安装。未再取得全量测试或 smoke 通过结果；本轮性能沿用历史记录作背景，未产生新的 Electron 性能数据。

未完成：真实中文输入法人工矩阵、截图级界面验收、安装/升级/卸载、macOS/Linux、物理断电/磁盘满、另一台电脑、多结构 5 MiB、8 小时稳定性、外部用户对比任务、收入验证。本轮未完成独立依赖漏洞审计，也未检查远端 CI 的真实运行记录。

## 2. 全仓盘点与职责证据

统计口径：`git ls-files src`；TypeScript 为 `.ts/.tsx`；生产文件排除 `.test` 与 `.perf`，包含示例数据和类型；物理行通过 PowerShell `Get-Content` 计数。

| 项目 | 数量 |
| --- | ---: |
| `src` 受版本管理文件 | 536 |
| TypeScript 文件 | 501 |
| `src` TypeScript 测试文件 | 188 |
| 生产 TypeScript 文件 | 311 |
| 生产 TypeScript 物理行 | 43,283 |
| 生产文件超过 300 行 | 33 |
| 生产文件超过 450 行 | 8 |

| 超限文件 | 行数 | 处理含义 |
| --- | ---: | --- |
| `src/renderer/src/data/demo-files.ts` | 650 | 主要是示例资源，单列而不等同业务复杂度 |
| `src/renderer/src/lib/docx.ts` | 613 | 输出职责多，触及功能前拆分 |
| `src/renderer/src/app/workspace/useWorkspaceFiles.ts` | 519 | 文件操作与异步状态集中 |
| `src/renderer/src/app/useAppSettings.ts` | 496 | 设置加载/保存与状态装配 |
| `src/renderer/src/components/Editor/overlays/useEditorOverlays.ts` | 486 | 编辑器交互维护边界 |
| `src/renderer/src/components/Editor/plugins/mermaidCodeBlock.ts` | 484 | 渲染、失败与交互边界 |
| `src/main/ipc/file-handlers.ts` | 474 | 读写、授权、编码和回执边界 |
| `src/renderer/src/components/Editor/instance/useMilkdownInstance.ts` | 462 | 编辑器注册与生命周期 |

`AppComposition.tsx` 为 450 行。300/450 行规则不是唯一质量尺度，React 组件还需按 250 行、异步流程与状态数量评估。原完成记录中的部分行数已与当前基线不同。

主要检查锚点（行号均为审查基线）：

| 能力 | 实现/测试证据 |
| --- | --- |
| 窄桥接与窗口隔离 | `src/preload/index.ts`、`src/preload/api.d.ts`、`src/main/window/window-manager.ts:43` |
| 恢复写入与故障覆盖 | `src/main/ipc/file-write-recovery.ts:205`、`:261` 及同名/并发测试 |
| 保存身份与旧回执 | `src/renderer/src/app/document-session/useDocumentSaving.ts`、同名测试的末次输入/会话改变用例 |
| 正则隔离 | `src/main/ipc/search-regex.ts:6`，Worker 超时边界 |
| 索引预算与增量 | `src/main/indexing/workspace-index-service.ts:80`、`:145` 及同名单测/生产性能测试 |
| 搜索引用和位置恢复 | `src/renderer/src/app/AppDialogs.tsx:350`、`lib/source-citation.ts`、`lib/insert-citation.ts` |
| 技术文档模板 | `src/renderer/src/app/actions/commands/file-commands.ts:5` 注册六类；`app/useDocumentCreationAndCollection.ts:28` 创建 |
| 默认开库图谱 | `src/renderer/src/app/useGraphView.ts:66`，属于待观察的产品选择 |
| Markdown 枚举范围 | `src/main/indexing/workspace-index-filesystem.ts:31`，仅 `.md/.markdown` |
| 历史上限 | `src/main/history/version-store.ts:10`，20 份/5 MiB 总量/2 MiB 源文件 |
| 自动更新 | `src/main/index.ts:217`，生产检查并自动下载，错误静默处理 |

## 3. 发现明细

### A01：带 BOM 异常编码绕过严格解码

**优先级 P1；证据为直接调用生产函数复现。**

`src/main/ipc/file-io.ts:262` 对 UTF-16LE 使用宽松转换，`:268` 对带 BOM UTF-8 同样直接转换；后面的 fatal UTF-8 解码没有覆盖这些分支。

- 输入“中文笔记”的 UTF-8 字节去掉最后一个字节，无 BOM 时抛 `UnsupportedEncodingError`。
- 在相同残缺字节前加 UTF-8 BOM，返回 `中文笔�`。
- 输入 `[255,254,65,0,66]`，返回 UTF-16LE 文本 `A`，尾部孤立字节消失。

`src/main/ipc/file-io.test.ts:72` 有无 BOM 残缺 UTF-8 回归，但未覆盖本次带 BOM 和奇数字节样例。这里证明的是读取契约可能静默损坏，再保存可能固化损坏；没有观察到真实用户文件已被破坏。

验收方向：合法编码往返完整，非法/残缺编码在修改前明确拒绝或进入显式恢复选择；原始文件字节不变。不能仅检查最终字符串“可显示”。

### A02：保存时间容差与全局基线不能证明当前编辑版本

**优先级 P1 待完整链路定级；纯函数边界已复现，双窗口端到端未复现。**

`src/main/ipc/file-io.ts:28` 每路径只有一份进程级已知状态；`:44` 仅在当前 mtime 比期望值晚超过 500ms 时直接冲突。`file-handlers.ts:302` 在保存成功后更新该共享基线。

输入旧窗口 `expectedMtime=1000`，磁盘与全局已知值 `mtimeMs=1200`、尺寸和新内容 hash 相同，`inspectSaveConflict` 返回 `{ conflict: false, needsContentHash: false }`。

因此，串行锁与“磁盘匹配最新全局 hash”不能替代“写入方确实基于该版本编辑”。完整窗口启动、读取、写入顺序是否触发此路径仍需专项测试，不应把推论写成已观测到覆盖。

验收方向：请求携带自己读取时的版本事实；第一窗口写入后，第二窗口持有旧版本必须冲突，不受 500ms、同尺寸或保留 mtime 影响。显式强制覆盖仍需既有用户确认与授权复核。

### A03：集合 Markdown 转 HTML 内容保真不足

**优先级 P1；四种样例均直接调用生产函数复现。**

`src/renderer/src/hooks/exports/usePublishFlow.ts:74` 集合分支调用 `lib/document-collection.ts:226` 的独立渲染器：只注册 GFM/math；脚注在 `:145`、`:214` 读取错误的 AST 字段；`:140` 引用式链接/图片退化；`:165`、`:168` 列表子节点走行内处理。

| 输入 | 实际输出问题 |
| --- | --- |
| YAML frontmatter 加正文 | 元数据变为 `<hr>` 与 `<h2>`，混入输出正文 |
| `正文[^注一]` 与脚注定义 | 引用为 `[]`，定义为 `[^]`，标签关联丢失 |
| 引用式链接与图片及定义 | 链接只剩文字，图片变成空段落 |
| 两层无序列表 | 内层列表退为同一个 `<li>` 的连续文字 |

这些是集合路径问题，不能泛称单篇 DOM 导出也具有同一缺陷。现有基础语法测试不足以覆盖所有技术内容组合。建议建立同一份支持矩阵，对编辑、单篇输出和集合输出分别验收。

### A04：发布完成反馈、范围和完整性不一致

**优先级 P1 交付；证据为静态代码路径，未做接收方软件实机测试。**

1. `useInlineExportImages.ts:29` 在失败时累计 `failed` 并保留原 `mdimg://`。`usePublishFlow.ts:97`、`:143` 只接收 HTML，`:118`、`:152` 仍显示成功；非内联图片分支则会检查失败并取消。
2. `components/PublishDialog/index.tsx:61` 在标签输入为空时回退当前文档；`:201` 集合选项下的富文本复制回调不接收范围，实际只复制当前文档。
3. `app/resolve-collection-entries.ts:31` 只要求索引存在，没有判断 `complete/truncated`，按不完整索引得到的集合也可继续输出。

验收方向：实际输出范围与选择一致；未知完整性、空标签和缺图不能被成功文案掩盖；要么阻断，要么由用户明确接受准确标注的部分结果。标签/目录集合上限目前为 200 篇，需明确说明。

### A05：搜索覆盖的“完整”语义不可靠

**优先级 P2；证据为静态分支确认。**

`src/main/ipc/workspace-handlers.ts:310` 跳过大于 2 MiB 文件；`:305` 的扫描截断只依据树预算和文件数，`:365` 返回值没有包含大小跳过。`file-io.ts:326` 深度超过 5 直接返回空列表，不设置截断。

生产统一索引适配器并没有同一深度上限，因此标签/图谱中存在的文档不一定出现在全文搜索范围。先修状态解释与范围契约，再考虑增加容量。

补充边界：前端查询序号可以抑制旧响应，但不等于主进程正在进行的逐文件扫描已取消。`useWorkspaceSearch.ts` 与全文搜索 handler 未形成相同的取消契约；此项需在性能/搜索任务中明确验证。

### A06：目录级变化与坏文件的故障隔离

**优先级 P2；监听过滤已用注入回调复现，平台事件分布未测。**

`src/main/indexing/workspace-file-watcher.ts:86` 把无文件名事件交给根路径；`:52` 又仅保留 Markdown 后缀，根路径和目录路径会被丢弃。用实际 watcher 工厂分别输入根路径和重命名目录，两次事件累计回调为 0。外部系统是否只给目录事件取决于平台，不能据此断言所有目录操作都失效。

`workspace-index-service.ts:168` 与 `workspace-handlers.ts:314`、`:339` 只对 `FileIdentityChangedError` 做单篇跳过，其他读取/解码错误直接抛出，存在一篇坏文件阻断整次任务的路径。

验收方向：未知/目录事件触发有预算的全量失效；坏文件单篇报错，正常文档仍可用；完整性状态体现未读部分；切库后旧回调无效。

### A07：草稿、历史与可访问性的边界

**优先级 P2；代码确认，真实设备故障和辅助技术体验未测。**

- `app/document-session/useDocumentSession.ts:106` 使用 `enabled: !FRESH_MODE`；fresh 窗口不写共享草稿。`hooks/useDraftPersistence.ts:77`、`:97` 吞掉持久化错误；需要明确恢复保障与错误提示。
- `history/version-store.ts:10` 规定历史容量；删除正文时 `workspace-handlers.ts:234` 同时清理应用内历史，因此历史不是独立备份。
- `WorkspaceSearchDialog/index.tsx:74` 与 `PublishDialog/index.tsx:69` 没有与命令面板相当的 dialog 语义和焦点约束。对照 `CommandPalette/index.tsx:220`、`:277` 已有可参考实现。
- 静态主题检查存在 37 项基线豁免，弱化文字另有仅记录项；通过不能写成“全部主题都达无障碍标准”。

### A08：当前 lint 与发行证明的缺口

**lint 是本轮确认失败；发行项是配置事实与待验证范围。**

- `src/renderer/src/components/HelpDialog/index.test.tsx:3`：`fireEvent` 未使用，1 个 lint error。
- `src/renderer/src/app/workspace/useWorkspaceFiles.ts:230`、`:313`、`:503`：3 个 Hook 依赖 warning。不能通过盲加依赖直接判定行为正确，应核实闭包与触发频率。
- `.github/workflows/release.yml:75` 说明 macOS 未签名，`:140` 直接创建非草稿发布；release gate 没有安装/升级/卸载或 smoke 验收。
- `src/main/index.ts:217` 已有更新实现，但失败静默；未证明下载、安装、重启、配置迁移和回退全链路。

### A09：维护和产品叙事偏差

**证据为仓库盘点与代码/文档对照。**

审查基线时 README `:49`、`:76` 和 package 的 `demo:soft*` 指向本基线不存在的 `design/soft-workbench`。2026-09-20 的文档收敛已清理 README 入口；`package.json` 脚本仍待 R17 决定删除或恢复真实资源。package description 仍强调极简编辑器，开始页是写作空间，产品文档强调知识工作台；需要统一核心任务表达，但不必为此重做整个 UI。

Git 跟踪文件中未找到根 LICENSE；只有 `package.json` 的 MIT 元数据不能代替完整分发材料审查。现有 `afterPack.js` 明确保留 Chromium 许可文件，不应错误声称它删了许可证。

本轮新报告中的竞品事实另由官方网站核实；文档内已有来源链接。未把历史“停止更新”“只能在线”等印象当当前事实。

## 4. 可重复的只读探针

以下在仓库根目录 PowerShell、当前 Node 24 和已恢复依赖环境执行。只在内存中转译加载生产 TypeScript，不创建测试文件、不访问真实知识库；这不是正式回归测试替代物。后续修复须将断言转为仓库测试。

```powershell
@'
const fs = require('node:fs')
const ts = require('typescript')
require.extensions['.ts'] = (mod, filename) => {
  const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  })
  mod._compile(result.outputText, filename)
}

const { decodeTextBuffer, inspectSaveConflict, sha256Hex } =
  require('./src/main/ipc/file-io.ts')
const truncated = Buffer.from('中文笔记', 'utf8').subarray(0, -1)
for (const [name, bytes] of [
  ['无BOM', truncated],
  ['带BOM', Buffer.concat([Buffer.from([239, 187, 191]), truncated])],
  ['UTF16', Buffer.from([255, 254, 65, 0, 66])]
]) {
  try {
    const { encoding, content } = decodeTextBuffer(bytes)
    console.log(name, JSON.stringify({ encoding, content }))
  } catch (error) {
    console.log(name, error.name)
  }
}
const known = { mtimeMs: 1200, size: 3, contentSha256: sha256Hex('new') }
console.log(inspectSaveConflict({
  current: known, expectedMtime: 1000, known,
  currentSha256: known.contentSha256
}))

const { renderMarkdownToHtml } =
  require('./src/renderer/src/lib/document-collection.ts')
for (const [name, markdown] of [
  ['元数据', '---\ntitle: 内部标题\ntags: [技术]\n---\n\n# 正文'],
  ['脚注', '正文[^注一]\n\n[^注一]: 中文脚注'],
  ['引用', '[链接][doc]\n\n![架构图][img]\n\n[doc]: ./guide.md\n[img]: ./a.png'],
  ['列表', '- 外层\n  - 内层甲\n  - 内层乙']
]) {
  console.log(name, renderMarkdownToHtml(markdown))
}

const { createWorkspaceFileWatcher } =
  require('./src/main/indexing/workspace-file-watcher.ts')
let fire
const changes = []
const watcher = createWorkspaceFileWatcher({
  watch: (_root, callback) => {
    fire = callback
    return () => {}
  },
  debounceMs: 1
})
watcher.start('D:/synthetic-notes', paths => changes.push(paths))
fire(['D:/synthetic-notes'])
fire(['D:/synthetic-notes/renamed-folder'])
setTimeout(() => {
  console.log(JSON.stringify({ callbacks: changes.length }))
  watcher.stop()
}, 10)
'@ | node
```

关键结果：无 BOM 抛错，带 BOM 返回 `中文笔�`，UTF16 返回 `A`，旧保存基线返回 `conflict:false`；集合输出分别出现元数据正文、空脚注标签、丢图片、列表扁平化；watcher 回调数为 0（**R06 已转为** `workspace-file-watcher.test.ts` 根/目录 rescan 断言）。

## 5. 后续修复记录规则

每次记录发现编号、实际复现、修复提交、失败测试、相关/全量门禁和人工边界。A02 要分开填写纯函数、IPC、双窗口证据；A03 要分开填写单篇与集合格式；A08 要分开填写构建、候选安装和正式发布。

本轮文档交付可以完成，但在现有 lint/环境阻塞和已确认缺陷消除前，不能宣称“项目已经全量验证通过”。
