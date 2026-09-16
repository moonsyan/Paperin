# Paperin 已完成与未完成清单

更新时间：2026-09-15（Asia/Shanghai）

本文是当前 `master` 的唯一实时完成度记录。实施计划和路线图描述目标，不因代码存在而自动视为完成；本清单只记录已经验证的行为，以及仍需继续处理的工作。

## 2026-09-16 S02 关闭确认竞态补强（当前有效结论）

关闭保存现由 `useDocumentCloseSaving` 统一处理。它在请求开始时绑定文件路径、活动会话序号与编辑器实例，并在快照等待、关闭确认、另存为、队列写入后再次核对身份、正文和编辑器未落账输入；不满足时保留文档并拒绝关闭。手动另存为也只会在原文件、会话和编辑器实例仍一致时更新标签，迟到的成功结果不会套用到已切换或卸载的会话。窗口关闭在逐标签确认之后，还会在队列和工作区视图持久化完成后复核全部标签，因此等待期间的新输入、新标签、路径迁移或未落账输入不会继承旧的关闭许可。

自动回归新增未命名 5 MiB 文档、另存为期间继续输入、异步另存为失败/卸载、手动另存为等待时的会话切换/卸载、普通保存回执前的未落账输入、A→B→A 会话切换，以及 32 字符、1 MiB 阈值两侧和 5 MiB 四种大小各 30 次“保存中继续输入”场景；窗口关闭覆盖队列/工作区写入等待、新标签、路径变更和未落账输入。本次 `npm run test`（166 文件、1273 项）通过；lint、a11y、typecheck、build 和真实 Electron smoke 在同一关闭竞态批次已通过。完整 Q02 仍未完成：真实中文 IME、工作区切换、磁盘结果组合、每类全量 30 次和跨平台人工验证尚待执行。

## 2026-09-15 S05 首项与 S17 热点拆分（当前有效结论）

S05 保存状态的首项修复已实现：有路径文件仍按当前版本 dirty 显示“已保存/未保存”；没有磁盘路径的未命名文档显示“尚未保存到磁盘”，示例未修改显示“示例文档”，修改后显示“示例 · 有未保存修改”。顶栏、正文路径条与状态栏不再就同一无盘文档给出相互矛盾的持久化承诺；顶栏 `aria-label` 与提示文本采用同一口径，未落盘状态的点不再用磁盘成功绿色。真实 Electron smoke 已驱动欢迎示例和 Ctrl+N 未命名文档，核对三处状态一致；组件与派生规则测试覆盖有/无路径及脏状态。

随本项触及的 `AppComposition.tsx` 已从 530 行收敛到 449 行：窗口副作用、文档 chrome 上下文、标签筛选、模板新建/合集读取分别移入 `useAppWindowEffects`、`useDocumentChromeContext`、`useTagFilter`、`useDocumentCreationAndCollection`；新边界均有直接测试，未复制正文状态。其余 S05 保存中/晚到旧版本回执、真实中文 IME、焦点与九主题缩放矩阵及 S17 其他热点仍未完成；这项首修不代表 S05/Q03 全项验收。

## 2026-09-15 S03 当前有效结论

S03 的 **P0 真实 Electron 防卡死硬门禁已通过**：生产构建中打开 5 MiB 文件，经 Milkdown 编辑、原生 Ctrl+S 保存后，磁盘 Markdown 同时含原文尾部与末次输入；资源包导出和 20 标签两轮切换也通过。三个独立运行批次的保存耗时为 211.56/226.47/185.64 ms，打开为 1272.37/1231.72/1212.5 ms，资源包导出为 60.74/52.33/54.29 ms，40 次暖切换 P95 为 29.9/29.6/29.4 ms；三个批次均无失败。阈值、夹具大小与结构未放宽。测试脚本先前把 Milkdown 转义后的 `PERF\_...` 与原标记判为不同文本，且尝试包装不可写的 preload bridge，形成错误的保存失败和 15 秒虚假耗时；本次改为从快捷键到磁盘确认直接计时，并同时验原文尾部与末次编辑。

**未完成**：S03 的 P1 完整 M01 体验采样仍需五类 5 MiB 节点形态、每类 20 次/至少三批、普通输入/保存、另一台 16GB/SSD 设备及 8 小时稳定性；S02 Q02 完整时序矩阵和 S01 Q01 故障/平台矩阵仍未完成。当前结果只能证明这一 Windows 开发机和固定长段落夹具的端到端门禁，不能宣称跨设备性能、发布就绪或战略优势达成。

## 2026-09-14 当前核对：战略、实施与 P0 首批开发

代码基准 `fe76b96` / `0.6.0`。已修订 [战略定位](PRODUCT-STRATEGY-ROADMAP.md)、[实施计划](NEXT-DEVELOPMENT-PLAN.md)，新增 [战略验收协议](development/strategy-validation.md)；并完成 S01 可恢复写入、S02 快照超时/关闭保护和 S03 保存阶段诊断的首批工程增量。S00–S17 的完整验收状态以本页任务小节为准，不能把代码提交等同于平台或用户验证。

本轮实测：`npm run typecheck`、`npm run test`、`npm run lint -- --quiet`、`npm run build`、`npm run smoke` 和 `npm run a11y` 通过；S01/S02/S03 的定向测试通过。当前没有可作为达标依据的 5 MiB 性能结果；真实 IME、三平台安装和完整故障注入未执行，下面旧结果保留为历史证据，不代表当前版本全量验证。

本次静态核对对后续优先级的影响：

- 普通 smoke、收藏恢复/取消、路径条、抽屉协调、轻大纲、主题样张已有实现或历史验证，不再整批作为新功能安排；真实平台/IME/缩放与保存语义缺口继续验收。
- 5 MiB 保存有历史 `SAVE_RESULT_TIMEOUT`、`diskHasEdit:false`，尚未找到当前代码的新闭环证据。旧记录关于“排除快照陈旧”的推断不足以排除所有竞态，需 S02/S03 分别验证正确性与性能。
- `ensure-snapshot.ts` 的超时/会话改变路径已阻止旧缓存写入和关闭；完整 Q02 的 IME、卸载、保存中继续输入、大小/时序组合仍未验证。
- 已有文件的保存已加入恢复材料和读取恢复；S01 的每注入点 20 次、进程终止、磁盘满/权限、符号链接、并发和三平台文件身份证据仍缺失。
- build/release workflow 已存在；远端 run、产物安装、升级和正式发布证据尚未在本轮核实，S00/S04/S14 继续处理。

2026-09-15 早期追加核对（S03 本次修复前）：原生 Ctrl/Cmd+S 已改为捕获阶段处理，避免 ProseMirror 在冒泡阶段消费保存键；大文档的关闭前 `flush` 在仍有未落账编辑时不再消费脏标记或把旧缓存排队写盘。当时对 5 MiB 的错误失败结论已经由本页顶部最新实测取代；Q02 时序矩阵仍未通过。

当前不宣称发布就绪、战略优势成立或用户留存达标。下方 M0/M1/M2 的“完成”按当时批次含义阅读；新版计划明确区分实现、自动测试、人工/平台和用户验证。

### S01：可恢复桌面文件写入（工程验证通过，平台/故障矩阵待验证）

为已有桌面文件新增同目录 journal/backup 协议：新内容先写入并同步临时文件，旧确认版本复制到校验 backup 后才覆盖原文件对象；目标同步且哈希校验完成后记录 `committed`，最后清理恢复材料。应用下次读取文件时会处理遗留 journal：未确认写入恢复最后确认版本，已确认写入只清理材料，绝不以旧 backup 覆盖后续外部修改。活动进程持有未确认 journal 时读取返回 `FILE_BUSY`，避免索引或打开读取部分内容。

实现位于 `src/main/ipc/file-write-recovery.ts`；`file-io.ts` 保持编码读取/目录扫描职责，`file-handlers.ts` 在 `stat` 前先恢复，处理 destination 被失败复制删除的情况。恢复材料只存同目录隐藏文件；journal 不含绝对路径或正文，backup 仅在保存未确认期间保留旧确认内容。协议、边界与手工验证见 [可恢复桌面文件写入](file-write-recovery.md)。

自动验证：复制中断后恢复、`prepared` journal 重启恢复、`committed` journal 清理、外部修改保留、编码读回、授权读取通过；目标覆盖复制中断、`prepared` 重启恢复、`committed` 清理及已提交后的外部修改保留各在 20 个隔离临时目录连续通过。前两者每次恢复最后确认版本并在后续保存后清理 journal/backup；后两者每次保留新版本或外部版本并清理材料。本次最终验证 `npm run typecheck`、`npm run lint -- --quiet`、`npm run test`（165 文件、1253 项）、`npm run build`、普通 Electron smoke 和 a11y 通过。S03 的固定长段落 5 MiB 性能硬门禁现已通过，结果见顶部；S01 未完成的仍是其他注入点 20 次、进程终止、磁盘满/权限、符号链接、三平台文件身份和硬件掉电边界验证。

### S02：快照超时与关闭安全（首个正确性闭环完成，完整时序矩阵待验证）

大文档保存现在捕获目标文件 ID 与活动编辑会话序号。`ensureFreshSnapshot` 在等待期间发现超时、标签/工作区切换，或切换后又回到同一文件 ID 时，返回带原因的未完成结果；手动保存不会把旧缓存写入目标路径，关闭流程不冲刷队列且返回拒绝关闭。关闭前 `flush` 也会先检查未落账的大文档事务，避免提前清除脏标记并把旧缓存伪装为已保存。普通编辑器同步读取保持原有低延迟路径；大文档已落账快照不会在异步等待后反向覆盖随后到达的内容。

自动验证新增超时不写盘、超时不关闭、等待中 A→B→A 会话失效、目标变化中止，以及活动会话序号递增；定向 4 文件 20 项通过，类型检查和 lint 通过。完整 Q02 的普通/阈值/5 MiB、IME、保存中继续输入、卸载、工作区切换、磁盘与窗口结果组合及每类 30 次重复，仍由 S02/S03 后续验证，不能据此宣称大文档保存门禁已解决。

### S03：5 MiB 真实 Electron 硬门禁（P0 通过，完整 M01 待验证）

性能冒烟使用 Electron 原生输入发送 Ctrl/Cmd+S，按真实磁盘 Markdown 中原文尾部和末次编辑的语义等价标记确认成功。Milkdown 会转义正文下划线，故门禁接受原始 `_` 与转义 `\_` 两种合法写法；不再尝试包装 context bridge API，也不将包装不可用误当保存失败。保存计时覆盖快捷键到磁盘确认，既有体积、时间和 20 标签阈值保持不变。

自动验证覆盖原文尾部与末次编辑两者缺一不可、原始/转义 Markdown 等价；三个真实 Electron 独立批次均通过完整保存/导出/20 标签场景。未完成的是 M01 的多结构、多设备、普通输入/保存和 8 小时稳定性验证，以及 S02 的全面正确性时序矩阵。

## 2026-09-13 结论（历史）

当前代码可通过类型检查、lint、构建和 Electron smoke；全量测试为 161 个测试文件、1244 项。Electron smoke 的完整链路（关联 → 工作区 → 新建 → 保存 → 冲突 → 重读 → 重命名 → 搜索 → 状态读取）实测通过；收藏写回、重启恢复、直接取消及浅色/深色主题星标交互也在隔离配置中实测通过。CI 配置已恢复并通过本地结构校验，实际 CI 运行证据仍待托管平台支持。

**2026-09-12 M2 起步（T10–T14）**：按 [UI 规范](NEXT-UI-SPEC.md) §3/§8 完成顶栏、路径条与导航层级（T10）——正文上方新增 28px 轻路径条（示例/未命名/库内/外部四态，目录段与「定位到文件」可展开侧栏并展开祖先链）、标签栏同名文件相对目录消歧、库名常驻展示收敛到侧栏标题（侧栏收起时顶栏才显示）；完成统一抽屉和焦点协调（T11 核心子集）——窄窗口侧栏与 ContextDock 共用 scrim、互斥由瞬时 overlay 协调（偏好与 overlay 分离）、Escape 关闭并恢复触发焦点；轻大纲窄栏与外观主题样张（T13）；空状态主动作区分与空集合引导文案（T14）；typewriter accent 对比度修复清除 6 项最差存量债务（T12 部分）。全量回归 150 文件 1201 项通过。

**2026-09-12 M2 收尾（T12 全量完成）**：输入框描边与装饰线语义拆分完成——九主题新增 `--border-input`（控件边界，a11y 门禁 ui 级 3:1 硬校验，36 项检查全达标），`--border-m` 收窄为纯装饰分割线（9 条债务继续「不变差」登记）；6 处输入类控件描边切换（搜索框、设置文本/搜索输入、图谱搜索、代码块语言输入、状态栏目标输入）。至此 M2 界面第二轮收敛（T10–T14）全部完成。

整个产品重构尚未完成。5 MiB 编辑器保存/导出全链路的快照新鲜度证据（T05–T06）、quiet-workspace 界面收敛（T09–T14）和三平台安装包验证（T20）仍是明确工作。低频能力登记与主要视觉迁移已落地，不再按"尚未迁移"重复安排。

## 2026-09-12 M2：界面第二轮收敛（批次记录）

| 任务 | 结果 |
| --- | --- |
| T10 顶栏/路径条/导航层级 | 完成：① 新增 `DocumentPathbar`（正文上方 28px 轻路径条）：示例「示例文档 · 另存为后保留修改」、未命名「未命名 · 尚未保存到磁盘」、外部文件标 + 全路径、库内相对路径分段；目录段与「定位到文件」触发侧栏定位（展开侧栏 + 仅展开当前文件的祖先目录，`collapsedKeysAfterRevealFromRecord` 兼容「默认全折叠」开关下记录为 null 的语义）。② `TabBar` 同名文件消歧：重名标签旁标注相对目录小字（`tabSubdirLabels`），aria-label 同步「位于 {目录}」。③ 库名去重：`WorkspaceContext` 新增 `showName`，侧栏展开时顶栏不重复显示库名（侧栏收起时显示，无障碍名始终保留）。路径展示逻辑统一收敛到 `lib/path-display.ts`（`CurrentFileBanner` 复用，行为不变）。回归：typecheck / lint / 146 文件 1173 项测试 / build / a11y 门禁通过 |
| T11 统一抽屉和焦点协调 | 完成（核心子集）：新增 `app/workspace/drawer-coordinator.ts`（纯函数：最近打开者获胜、Escape/遮罩关闭、跨断点失效、有效可见性解析）与 `app/useWorkspaceDrawers.ts`（matchMedia 820px 断点、瞬时 overlay 状态、Escape 捕获监听含 IME 组合态跳过、焦点恢复到触发控件）。持久化布局偏好（sidebarCollapsed / dock visibility）与瞬时 overlay 分离——窄窗口互斥只影响有效可见性，不改用户偏好；宽窗口下两者均按偏好恢复。统一 scrim：`.workspace-scrim`（z-50，窄窗口渲染），ContextDock 抽屉形态 z 40→56，侧栏 60，遮罩点击与 Escape 关闭当前抽屉。窄窗口下 dock 被互斥隐藏用瞬时 `visibility:'hidden'` 副本表达，经状态栏/菜单恢复入口展开时自动让侧栏退出。测试 19 项（纯函数 9 + hook 行为 10，含 IME 组合态与跨断点）。回归：typecheck / lint / 148 文件 1192 项测试 / build 通过；真实 Electron 100%/125%/150% 缩放手测待人工执行 |
| T14 新用户与空状态 | 完成：`StartScreen` 按知识库状态区分主动作——无库时主按钮「打开知识库文件夹」（原为「新建文档」）、有库无标签时主按钮「在此知识库新建」并提示「继续最近编辑：打开侧栏『最近编辑』」（不重新打开欢迎页/图谱，样例入口不混同真实文件）。空集合引导文案：空最近「打开或编辑文档后会出现在这里」、空收藏「还没有收藏，可在文件右键菜单中收藏」（`SidebarFlatList` 拆分 `emptyLabel` 空态文案与 `listLabel` 无障碍名）。StartScreen 新增 3 项行为测试（主动作区分 / 提示文案 / 不含登录同步类动作）。回归：typecheck / lint / 全量 149 文件 1195 项通过 |
| T13 轻大纲与主题样张 | 完成：① 轻量大纲形态——`ContextDockState` 新增 `compact` 布尔位（shared 持久化 schema 与组件运行时同步，旧数据缺省 false 向后兼容；rail 新增切换按钮，仅大纲面板生效）；生效时宽度钳制 200–240px（用户宽度保留，退出后恢复）、CSS 隐藏章节字数、标题允许换行——同一 dock / 同一大纲状态，不新建第二套滚动监听或持久化机制。② 主题样张卡——外观设置每张主题卡内嵌真实样张：`data-theme` 作用域让卡片子树解析该主题的真实 token，同一段中文样本覆盖标题/正文/链接/代码/选中/错误六态（装饰性预览 aria-hidden）。测试：dock 状态 4 项 compact 用例 + 样张 2 项；shared/main/lib 夹具同步 compact 字段。回归：typecheck / lint / **150 文件 1201 项测试** / build / a11y 门禁通过 |
| T12 可读性与主题语义 | 完成：① typewriter accent 系列修复——accent #519d5c→#276634（四表面 ≥4.5:1，原 bg-sidebar 2.43:1）、激活行 2.24:1→≥4.57:1（accent 同时是焦点环描边色，属最差存量项）、accent-bg alpha .1→.08，基线清除 6 条豁免（43→37）。② 输入框描边与装饰线语义拆分——新增 `--border-input` token（九主题全部声明，值按四表面最低 ≥3:1 计算取最小视觉变化），搜索框 / 设置文本与搜索输入框 / 图谱搜索 / 代码块语言输入 / 状态栏目标输入等控件描边改用该 token 并纳入 a11y 门禁 ui 级 3:1 硬校验（36 项新检查全达标）；`--border-m` 收窄为纯装饰分割线，其 9 条存量债务继续按「不变差」棘轮登记。回归：typecheck / lint / 150 文件 1201 项测试 / build / a11y（254 项检查 0 失败）通过 |

## 2026-09-12 M0：恢复可信基线（批次记录）

本轮按 [实施计划](NEXT-DEVELOPMENT-PLAN.md) §3/§11 起步清单执行，结果优先于先前批次的历史统计：

| 任务 | 结果 |
| --- | --- |
| T01 smoke 契约 | 修复：探针脚本抽为 `src/main/testing/smoke-probes.ts`（5 测试），`npm run smoke` 全链路通过；另修两处启动缺陷——spawn 不再向 Electron CLI 传 `--disable-gpu`（改由冒烟模式 `appendSwitch`），并剥离宿主终端继承的 `ELECTRON_RUN_AS_NODE` |
| T02 收藏恢复 | 修复：`useSidebarFavorites` 设置就绪后读取持久化并合并（本地点击优先、空数组不当删除、损坏配置回退、读取失败保留内存），10 项行为测试 |
| T03 提示与计数 | 修复：搜索触发框提示由快捷键映射渲染（`formatShortcutHint`，未绑定隐藏）；侧栏"文档数"改为 `countTreeFiles` 递归统计 Markdown 叶子 |
| T04 状态与 CI | 校准：恢复 `.github/workflows/build.yml`（三平台 npm ci → typecheck → lint → test:ci → build，Windows 加 smoke），`verify-ci-config.mjs` 对缺失文件给出明确错误并通过；**实际 CI 运行证据未取得（仓库托管在 Gitee），不宣称三平台 CI 已验证** |
| 全量回归 | 143 文件 / 1140 项通过；typecheck / lint / build 通过 |
| perf:electron | **失败（已定位到准确阶段）**：普通链路 9 步全部通过；5 MiB 保存步骤 `SAVE_RESULT_TIMEOUT`（largeSaveMs 241s，超 120s 门禁），`diskHasEdit: false`——末次编辑未落盘。F06 由"风险待验证"升级为**实测失败**，证据与 T05 快照契约设计输入一致，进入 M1 处理 |

## 2026-09-12 M1：文件与编辑器可靠性（进行中）

| 任务 | 结果 |
| --- | --- |
| T05 可等待的编辑快照契约 | 完成：新增 `document-session/ensure-snapshot.ts`（`ensureFreshSnapshot`：编辑器无未落账输入时零等待返回缓存；有输入时轮询等待 markdownUpdated 落账，默认 5s 超时失败出口，settled=false 时调用方保留 dirty 并提示）。`EditorHandle` 新增非破坏读信号 `hasPendingChanges()`（dirty-track 插件的 dirtyRef，不消费）；`handleSave` 大文档分支与 `saveBeforeClose` 关闭路径收口——防抖窗口内有输入时先等落账再写盘，超时仍提交已落账版本（保证磁盘有内容）并 toast 提示，保存后 contentsRef 比对自然保留 dirty；普通文档保持同步 `getMarkdown` 低延迟语义不变。版本语义以注释形式落档（editorRevision=dirtyRef 事务计数、snapshotRevision=contentsRef 落账、persistedRevision=INITIAL_OR_SAVED+mtime），不新建第二真相源。阈值单位命名：`LARGE_DOCUMENT_SNAPSHOT_CHARS` / `LARGE_DOC_UNITS_THRESHOLD`（UTF-16 code unit 口径，含中文/emoji 代理对说明）。测试：契约 5 项 + 保存行为 4 项（零等待/等待落账/超时出口/小文档路径不变）。回归：typecheck / lint / **152 文件 1210 项测试** / build 通过 |
| perf:electron（T05 后复测） | **仍失败，且证据排除快照陈旧**：`SAVE_RESULT_TIMEOUT` 240s、`diskHasEdit:false`、磁盘=初始内容。主进程 save 所有路径（锁/冲突/编码）均立即 resolve，观测器与实际调用通道一致（`api.save`）；若保存完成（哪怕旧内容）观测器必然被赋值——说明 5 MiB 场景下保存 IPC 在 120s 内**根本未完成往返**，瓶颈在序列化/IPC 传输/渲染阻塞层而非快照新鲜度，分段测量归 T07。T05 验收口径（等待有进度与失败出口、不丢字符、不保存半截）不受影响 |

## M0 退出条件核对

- [x] T01–T04 的实现、直接测试、说明和独立提交齐备。
- [x] smoke 不再在过时 DOM 契约处失败（全链路 SMOKE_PASS）。
- [x] 收藏重启、真实快捷键与文档计数有行为测试。
- [x] 当前状态不再引用旧 smoke 的通过作为当前通过证据。
- [x] 大文档仍失败，已记录准确失败阶段（5 MiB 保存 SAVE_RESULT_TIMEOUT、末次编辑未落盘）与后续任务（M1/T05），未宣称重构完成。

## 2026-09-12 最新评估复核（历史）

本节结果优先于下方先前批次的历史统计；完整依据见 [项目评估](NEXT-PRODUCT-ASSESSMENT.md)，下一步见 [实施计划](NEXT-DEVELOPMENT-PLAN.md) 与 [界面规范](NEXT-UI-SPEC.md)。本轮只修改文档，没有修复下列应用问题。

| 项目 | 当前结果 |
| --- | --- |
| typecheck / lint / build | 通过 |
| test | 142 个文件、1125 项通过 |
| a11y | 218 项检查、43 项基线豁免、0 新失败；29 样式表焦点扫描 0 违规 |
| smoke | 失败：旧标题选择器失效，需恢复完整链路验证 |
| perf:production | 2 文件、3 项通过；冷索引 1211.81ms、暖刷新 97.41ms、增量 94.67ms；搜索 P95 454.65ms、watcher 稳定 P95 199.16ms |
| perf:electron | 本轮未执行：共用失败的关联 smoke 前置步骤；大文档完整结果仍待验证 |
| verify-ci-config | 失败：本检出缺少脚本目标 `.github/workflows/build.yml` |
| 安装包、三平台、真实 IME 人工验收 | 本轮未执行 |

新增确认与风险：

- 收藏当时只有设置写入，没有重启加载接线；该历史问题已在 2026-09-13 修复，当前结果见本文顶部和末尾的收藏闭环记录。
- 侧栏搜索提示写死 `Ctrl K`，默认快速打开是 `Ctrl+P`；侧栏“文档数”取根节点数量。
- 无路径示例/未命名文件可能同时显示“未保存文档”和“已保存”，需区分文档种类与磁盘持久化状态。
- 大文档缓存分支按 `content.length > 1_000_000` 判断，非 MiB 字节；末次输入与缓存新鲜度仍需即时保存/关闭验证，尚未复现实际丢字。
- AppComposition 当前 470 行、docx 613 行、Mermaid 插件 459 行；超限清单以新评估统计为准，历史行数不再代表现状。

## 已完成

### 工程与进程边界

- 已建立 Electron Main、Preload、Renderer、Shared 的可运行基线，并保留窄化的 `window.desktopAPI` 边界。
- ESLint 9 flat config 已覆盖源码、脚本和根 TypeScript 配置；lint、strict typecheck、测试、构建和 smoke 都有稳定命令。
- Electron smoke 使用隔离的临时 `userData`，无 GPU 环境会在 `app.ready` 前禁用硬件加速。
- 未提交 `out/`、`release/`、用户数据、日志、草稿正文、token 或绝对用户路径。

### 文档会话与编辑器

- Shared 已定义 `DocumentRef`、`DocumentSession`、工作区/外部文件来源、mtime 和 UTF-8/UTF-16/GBK 编码联合类型。
- `useDocumentState` 已收敛为单一 `DocumentRecord` store；正文、保存基线、mtime、编码不再由多套 React state 独立维护。
- 保存竞态会保留保存开始后的新输入；冲突和编码损失路径继续禁止静默覆盖或丢字。
- 真实 Milkdown 组件已实现 `EditorAdapter` 的 Markdown 读写、聚焦、语义命令和订阅；卸载时清理订阅，Milkdown/ProseMirror 仍是正文唯一状态源。
- 文档会话控制器已逐项验证收口：草稿恢复按 mtime 丢弃过期草稿（B6）、fresh 窗口不恢复会话与草稿、已显式清除的草稿不会被空内容复活（X-M1）；关闭确认覆盖未命名文档三选（保存/不保存/取消）与保存失败后二选（放弃修改/取消），保存对话框取消同样中止关闭；多窗口竞态由工作区 IPC 的 `sender.id` 绑定、fresh 窗口隔离和 `SAVE_LOCKED`「另一窗口正在保存」提示共同承接。
- 会话恢复补齐取消语义：`restoreFromSessionData` 的异步读循环与两处「编辑器就绪」重试链（各 100ms×20）现在受 `disposedRef`（卸载）与 `restoreRunRef`（新一轮恢复取代旧一轮）双重约束，卸载后不再写入状态、不再排重试；重复触发恢复时旧一轮在下一个 await 之后即失效，不会与新结果交错。`useDocumentRestore.test.ts` 直接覆盖这两种取消路径。

### 工作区壳层、命令与面板

- `WorkspaceShell` 持续显示知识库上下文；`CurrentFileBanner` 显示标题、来源、路径和 dirty 状态，外部文件不会被误标为知识库文件。
- 命令注册表已支持 app/workspace/document scope、关键词和统一可用性判断；外部 Markdown 在没有知识库时仍拥有文档级命令。
- `ContextDock` 已真正由 `PanelRegistry` 驱动顺序、标题、scope 和 `render(context)`；支持安全的自定义面板 ID、内置面板覆盖和布局持久化。
- 文档级大纲/属性与工作区级关系/标签/检查会按上下文出现；持久化面板失效时回退至第一个可用面板。
- 隐藏状态保留可访问恢复入口；Escape 收起并恢复按钮焦点；分隔器支持键盘调宽和数值 ARIA；拖拽取消或组件卸载会清理全局监听。
- ContextDock 主组件和面板渲染组件分别保持在 250 行门禁以内。
- 命令注册表已统一为唯一执行入口：`useActionDispatcher.ts` 从 289 行降到 73 行，switch/case 逐项迁入 `app/actions/commands/`（文件/搜索/视图/面板/帮助五个域工厂），菜单栏、右键菜单、快捷键与命令面板共享同一 `execute`；历史别名动作（如 `preview`/`focusMode`）在分发入口做别名归一，不再重复出现在命令面板。
- `PanelRegistry` 插槽已全覆盖：Sidebar 主区域消费 `sidebar.primary`（内置 `files` 面板渲染文件树，扩展面板经 `render(context)` 追加），`editor.margin` 由新增 `EditorMargin` 宿主消费，`statusbar.end` 由 `StatusBar` 按注册顺序渲染内置片段与自定义面板。三处均支持缺省回退到应用级共享注册表。
- Sidebar 折叠记录改用内容签名（而非数组引用）做 effect 守卫：调用方传入内联字面量等不稳定引用时不再触发无限更新循环，`useSidebarCollapse` 直接测试覆盖该回归。
- 往返选择状态已统一到单一工作区视图模型 `app/workspace/useWorkspaceViewModel.ts`：反链/出链跳转、工作区搜索结果、知识图谱节点、质量诊断四处「打开文件并接力定位」共用同一次 `reveal` 调用与同一条「最后一次点选获胜」seq 判定。此前三套独立 seq 守卫语义不一致（诊断跳转完全没有守卫，旧请求迟到返回会覆盖新选择）。搜索接力选项在各调用点显式声明：反链跳转打开查找栏并强制非正则，工作区搜索与诊断跳转保持静默；未显式指定的正则/大小写开关沿用当前偏好，不再被跳转动作隐式重置。
- 命令可用性从「执行时才判定」前移到「入口处表达」：`useCommandRegistry` 新增 `isActionAvailable`（复用注册表 `list()`，与命令面板同源），经 `AppComposition → AppTopBar → TopBarSlots → MenuBar` 下发为 `isActionEnabled`，菜单条目按下 `disabled` + `aria-disabled` + `.is-disabled` 灰显，键盘下拉导航改用 `.dd-item:not([disabled])` 跳过禁用项；`AppCommand` 新增 `unavailableHint`、`useActionDispatcher` 新增 `onCommandUnavailable` 出口，快捷键与右键菜单被作用域挡下时给出原因（接 toast）而不是静默无响应。`graph`/`wsSearch` 补 `workspace` 作用域与提示文案，`versionHistory` 补 `document` 作用域，与 `docs/command-panels.md` 登记表一致。

### quiet-workspace 视觉迁移

- 顶栏四层 chrome 收敛为单条 52px 三区顶栏：左区（侧栏切换 + 品牌 + 菜单 + 工作区上下文点）· 中区（标签栏）· 右区（当前文件标识 + 文档标题 + 操作组）。此前垂直堆叠为顶栏 42px + 工作区上下文条 38px + 当前文件条 52px + 标签栏 34px ≈ 166px，正文首屏因此被压掉约 114px。
- `WorkspaceShell` 不再自绘上下文横条，改为只提供 `role="region"` 与 open/empty 状态；工作区名与「本地/未打开」标由新增 `WorkspaceContext` 呈现在顶栏左区，完整路径保留在 title 与无障碍名中（不再三处重复表达）。
- `CurrentFileBanner` 由 52px 独立横条缩身为顶栏右区紧凑标识（来源 + 相对路径，超长截断；窄窗口只留来源标，极窄窗口隐藏）。文件名交给标签页，保存状态交给状态栏与标签脏标记，工作区名与文件名保留在无障碍树中；`role="status"` / `data-source` / `data-dirty` 契约不变。
- 侧栏改为五段式：搜索触发框（点击打开命令面板，复用既有注册表，零新增搜索逻辑）→ 快捷导航（最近编辑 / 我的收藏，带计数，切换为平铺列表视图）→ 集合标题（含新建）→ 文件树 → 底部区（状态点 + 集合摘要 + 设置入口）。
- 收藏数据层落在 `app/useSidebarFavorites.ts`：按工作区作用域分桶持久化（与折叠记录同一 `settings` 机制），不新增共享 schema、不改 IPC、不动 `WorkspaceStateBundle` 兼容分支；文件行右键菜单新增「收藏 / 取消收藏」。
- 新增「雾白」（亮）「夜松」（暗）两套留白绿调主题，作为第 8/9 套接入既有 token 体系；主题级排版尺度（H1 `clamp(28px, 2.8vw, 38px)`、H2 去边框、引用/代码形态、更紧圆角、避开 Inter 的界面字体栈）落在 `styles/quiet-workspace.css` 并**只作用于这两套主题**，原有 7 套主题取值零改动。刻意不覆盖 `--efs` / `--ecw` / `--elh`（字号、内容宽度、行距归用户设置所有）。
- 补齐全局 `prefers-reduced-motion`（此前仅 `context-dock.css` 单点处理）；保留 0.01ms 而非 `none`，以便依赖 `transitionend`/`animationend` 的逻辑仍能收到事件。

### 无障碍与主题可读性门禁

- 主题对比度从「人工逐主题冒烟」升级为可机械校验的门禁：`scripts/theme-contrast.mjs` 解析九套主题的 token，按 WCAG 2.1 计算 218 项组合（text 级 4.5:1、ui 级 3:1），覆盖应用底/卡片面/侧栏/弹层（`--bg-menu`）四个表面、侧栏激活行、焦点环描边，并额外解析 `app/constants.ts` 的 `TITLEBAR_COLORS` 核对系统标题栏按钮（9/9 通过 4.5:1）；`--text-3`/`--text-4` 只记录不门禁。判定为**硬门禁 + 棘轮基线**两段式：未达下限的组合必须登记在 `docs/development/theme-contrast-baseline.json`，且不得比登记值更差；新出现的低对比组合直接失败，新增主题（`mist`/`pine`）不允许靠登记基线绕过门禁（测试显式限定只可登记 `--border-m`）。
- 新增主题的四处踩线取值已按等色调加深修正：`--text-2 #667168 → #616C64`（4.47 → 4.80）、`--accent #3F7658 → #3C7154`（激活行 4.46 → 4.78）、`--accent-line #6AA07A → #5A9070`（2.66 → 3.26）、`TITLEBAR_COLORS.mist.symbol #667168 → #616C64`（4.47 → 4.80）。`pine` 无需修正。
- 焦点可见性成为门禁：`scripts/focus-outline.mjs` 扫描全部样式表，任何基础规则里出现 `outline: none|0` 都必须在同文件配有 `:focus`/`:focus-visible`/`:focus-within` 的可见替代（非 none 的 outline、box-shadow、border-color 或 border）；焦点规则自己抹掉轮廓同样判违规；例外必须带理由且必须仍命中。本轮据此修掉 7 处真实缺陷，其中 `commandpalette.css` 的 `.palette-item:focus { outline: none }` 与 `:focus-visible` 同优先级但位置更后，实际把面板条目的焦点环彻底抹掉；`fine-slider`、`fm-input`、`tree-rename-input`、`.math-edit`、`.mermaid-source-toggle:focus-visible`、`.context-dock-resizer` 各自缺焦点提示或显式抹掉。
- 组件级无障碍冒烟固定为 `src/renderer/src/a11y-smoke.test.tsx`（15 项）：顶栏三区、侧栏五段式、扁平列表、当前文件标识与工作区壳层的可访问名称、`aria-pressed` / `aria-current` 状态语义、树的键盘可达性（Enter/Space）与 `.sr-only` 兜底。本轮补齐侧栏集合标题的 `aria-current`，并补上 demo 有、生产缺的**跳转链接**（`app/SkipLink.tsx` → `#editor-content`，落点带 `tabIndex={-1}`，样式用 `transform` 移出视口而非 `display: none`）。
- 完整结论、37 项存量债务清单与待人工执行的冒烟清单见 `docs/ACCESSIBILITY-SMOKE.md`。

### 运行时安全与告警

- Renderer CSP 只在已有图片白名单之外，为构建内联的 KaTeX 字体在 `font-src` 放行 `data:`；脚本与连接来源未放宽。
- Mermaid 源码通过 Refractor 纯文本别名交给既有预览插件处理，Prism 不再误报不支持语言。
- CSP 有直接安全契约测试；Electron smoke 遇到 CSP violation 或 Prism unsupported 会失败。
- `src/main/ipc/workspace-scope.test.ts` 的符号链接逃逸用例改为以「链接是否真正落盘」（`lstat().isSymbolicLink()`）判定前置条件，原实现只捕获 `symlink` 抛错——在 symlink 被静默忽略的受限沙箱中会误判为断言失败。真实 Electron 与 CI 环境仍执行完整 realpath 消解断言。

### 系统打开与生产索引

- Windows 文件关联、启动 argv、macOS `open-file` 和 `second-instance` 均经过 Main 校验后才进入 Preload 窄事件；启动早期事件有队列，单窗口复用、无窗口恢复、多窗口 fresh 隔离均有规则测试。
- 外部 Markdown 通过现有文档标签路径打开，同一路径去重；外部临时文件不会加入工作区索引，关闭前保存失败会保持窗口。Electron smoke 已覆盖关联文件、外部标签和重复打开。
- 生产 `WorkspaceIndexService` 已改用真实文件系统适配器，5000 文件预算、无变更刷新和单文件增量刷新进入独立性能门禁；当前基线约为冷索引 538ms、刷新 97ms、增量 98ms、峰值 RSS 126.5MiB。
- 生产工作区搜索现在与索引共享 5000 文件覆盖预算；真实 IPC 在末尾文件命中，watcher 对 20000 事件按路径去重并合并为单批刷新，`npm run perf:workspace-search-watch` 已纳入回归门禁。

### 维护性拆分

- GraphView 入口已从 932 行拆为 197 行入口、画布、工具栏、设置、布局/视口/交互 hooks 和纯函数模块；Sidebar 已收敛为 438 行以内的文件树，并将上下文菜单、图标、外部文件模型独立成模块。
- Sidebar 接入 `sidebar.primary` 后一度增至 466 行（越 450 行门禁），已按职责二次拆分为 253 行入口 + `SidebarTree.tsx`（树与行级交互、拖拽移动、内联重命名）+ `useSidebarCollapse.ts`（折叠记录与级联语义）；新边界各带直接测试。
- GraphView、Sidebar、系统打开和文档来源均有直接行为测试；拆分没有改变现有外部 API。
- `useDocumentTabs` 已拆为打开、关闭、工作区视图恢复和纯关闭计划模块；入口 103 行，补充关闭计划测试和维护说明。
- 窄窗口下 Sidebar 变为不挤压正文的抽屉；TabBar 上下文菜单接管焦点并在 Escape 后恢复触发标签，Sidebar/TabBar 组件测试覆盖这些行为。
- `App.tsx` 已保留稳定入口，组合控制器移至 `app/AppComposition.tsx`；组合控制器已从 2010 行收敛到约 440 行，只负责装配功能域 hook 与渲染视图组合。业务实现移入 `useAppSettings`、`useWorkspaceIndexes`、`useEditorFeatures`、`useGraphView`、`useAppLayout`、`useWritingMetrics`、`resolve-collection-entries`，视图拆为 `AppTopBar`、`AppWorkspace`、`AppDialogs`。
- 编辑器目录已按功能域重排：`adapter/`（对外门面与命令映射）、`content/`（正文替换、位置换算、视图状态）、`viewport/`（视口虚拟化与导出快照）、`navigation/`（光标导航与标题枚举）、`overlays/`（浮动层与 Wiki 补全）、`instance/`（Milkdown 实例装配），原有 `plugins/` 不变。`useEditorContentReplacement.ts` 从 709 行降到约 340 行，大文档流式替换独立为 `useStreamingReplace`，新增纯函数模块均带直接测试。
- 图谱打开的工作区校验与链接刷新收敛到 `useGraphView.openGraphView`，`useAppActions` 只保留委托，避免同一策略分散两处；主题持久化统一收进 `useAppSettings`。
- `hooks/useExports.ts` 从 506 行拆到 111 行入口，按导出域拆到 `hooks/exports/`：`useExportSession`（会话互斥 + 独占运行 + 活动文档守卫）、`useDocHtmlSnapshot`（DOM 快照 → HTML/发布模板）、`useInlineExportImages`（mdimg 内联）、`useHtmlPdfExport`、`useSourceExport`（Markdown/Pandoc）、`useDocxExport`、`usePublishFlow`（资源包 + 富文本）；纯函数 `rasterizeSvgToPngDataUrl` 与 HTML 模板 `renderExportDocHtml` 下沉到 `lib/svg-rasterize.ts`、`lib/export-doc-html.ts`，均带直接单测。入口 API 与 `AppComposition` 契约保持不变。
- `app/useAppActions.ts` 从 552 行拆到 205 行入口，按域拆到 `app/actions/`：`useCommandRegistry`（命令注册表 + save + 布局预设 + runCommand，支持 extraCommands 扩展点）、`useDocumentTitleEditing`（标题 blur/keydown）、`useDialogClosers`（8 个弹窗关闭器）、`usePanelNavigation`（大纲/上下文面板/反链跳转 seq 守卫/版本历史）、`useActionDispatcher`（handleAction switch/case + L20 原生对话框动作的焦点补偿）。新增 `useCommandRegistry.test.ts`（7 项）与 `usePanelNavigation.test.ts`（6 项）直接覆盖命令注册、上下文构造、布局预设、大纲 tick 时序与反链并发。入口 API 与 `AppComposition` 契约保持不变。

### 合成性能基线

- 仓库提供 5,000 个 Markdown 文件 × 2,048 B 的合成脚本基线和阈值，以及单个 5 MiB 文件的补充基线。
- 最新门禁运行结果：`treeMs=12.15`、`indexMs=452.66`、`searchMs=323.73`、峰值 RSS `146 MiB`。
- `npm run perf:regression` 默认读取仓库场景；显式更新基线时会同步更新场景，避免 baseline 与 scenario 不一致。
- 该门禁只约束 `scripts/perf-baseline.mjs` 的合成扫描/解析/搜索口径，不代表生产 `WorkspaceIndexService`、Renderer 或 Electron 端到端性能。

## 先前批次验证（历史记录，当前结果以上方复核为准）

| 门禁 | 结果 |
| --- | --- |
| `npm run lint` | 通过 |
| `npm run typecheck` | 通过 |
| `npm run test` | 通过：141 个测试文件，1108 项测试 |
| `npm run a11y` | 通过：九套主题 218 项对比度（43 项存量债务已登记棘轮基线，无新增失败）；29 个样式表焦点可见性零违规 |
| `npm run build` | 通过：Main、Preload、Renderer 均成功构建 |
| `npm run perf:regression` | 通过：5,000 文件合成场景未超阈值 |
| `npm run smoke` | 通过：打开工作区、新建、保存、冲突、重读、重命名、搜索、状态读取 |
| `npm run perf:workspace-search-watch` | 通过：5000 文件末尾搜索；20000 watcher 事件去重，搜索 P95 约 437ms、刷新 P95 约 192ms |
| `npm run perf:production` | 通过：生产索引、搜索、监听门禁；本次冷索引 1375ms、暖刷新 99ms、增量刷新 105ms |
| `npm run perf:electron` | 修复前未通过：5 MiB 打开/DOM 编辑后，Milkdown 序列化超过 240s 仍未进入保存 IPC；已加入 >1 MiB 快照保存策略，完整门禁待重新跑完 |

测试输出仍包含部分既有脚注/数学异常输入用例的预期诊断，以及 Vite CJS API 的弃用提示；它们不导致失败，但后续应继续收敛测试噪声。

## 未完成

### 发布前高优先级

- S03 固定 5 MiB 长段落真实 Electron P0 门禁已有三次通过证据；未完成的是 M01 多节点形态/另一设备/8 小时稳定性、监听释放和主/渲染进程内存趋势，以及 S02 的保存/关闭完整时序矩阵。
- 完成 Windows 安装包启动、文件关联、保存、导出验证；macOS/Linux 安装包与更新流程仍需对应平台环境。

### 架构与维护性

- 当前仍超过项目行数门禁的文件（2026-09-15 实数）：`src/main/ipc/file-handlers.ts`（662）、`src/renderer/src/lib/docx.ts`（613）、`app/workspace/useWorkspaceFiles.ts`（505）、`app/useAppSettings.ts`（496）、`Editor/overlays/useEditorOverlays.ts`（486）、`Editor/instance/useMilkdownInstance.ts`（485）。本轮 `AppComposition.tsx` 由 530 行拆到 449 行，已回到 450 行门禁内；`useEditorContentReplacement.ts`（约 340）超过评估线，触及时仍需按职责拆分。上述未触及热点保留在 S17 账本，不因本项拆分而宣称维护债务全部完成。
- 文档会话剩余风险集中在 5 MiB 大文档的保存耗时（见上方发布前高优先级），会话状态一致性、卸载取消与多窗口竞态已完成核验。

### UI 与功能迁移

- quiet-workspace 视觉语言已完成主要迁移：顶栏四层 chrome 收敛为单条 52px 三区顶栏（正文首屏回收约 114px）、侧栏改为五段式（搜索触发框 / 快捷导航 / 集合标题 / 文件树 / 底部区）、新增「雾白」「夜松」两套留白绿调主题并把排版尺度落到主题作用域样式、补齐全局 `prefers-reduced-motion`。剩余：窄窗口侧栏与 ContextDock 共用一套 scrim 机制尚未统一；AppearancePanel 的主题样张卡未引入；ContextDock「仅大纲」窄栏极简模式未实现。
- 主题文本/边框/悬停/禁用/焦点对比度已从人工冒烟升级为机械门禁（`npm run a11y`，见上「无障碍与主题可读性门禁」）；仍需人工过一遍的是：中文输入法组合态、全键盘导航路径、焦点不被弹层遮挡、减少动态效果的实际观感。清单与操作路径见 `docs/ACCESSIBILITY-SMOKE.md` 文末。
- 已登记的对比度存量债务需独立处理：`--border-m` 在九套主题均为 1.16–1.55:1（承担输入框/分割线描边，WCAG 1.4.11 要求 3:1），`typewriter` 的 accent 低至 2.24（同时是焦点环描边色）。
- 收藏（侧栏快捷导航数据层 + 文件右键收藏入口）已落地，按工作区作用域持久化；搜索触发框复用命令注册表。低频能力（图片、发布、导出、历史、另存为、设置、统计、图谱、全文搜索）已逐项登记为命令：作用域由 `CommandContext` 在**执行前**判定（`app` 恒可用、`workspace` 需知识库、`document` 需活动文件——外部 Markdown 也算完整文档上下文），菜单按下 `disabled`/`aria-disabled` 在点击前灰显、命令面板只列当前可用项、快捷键与右键菜单经 `unavailableHint` + `onCommandUnavailable`（接 toast）提示而非静默；三条入口共用 `useCommandRegistry` 暴露的同一份可用性判断，登记契约由 `low-frequency-capabilities.test.ts` 固化。详见 `docs/command-panels.md` 的「低频能力登记表」。
- Renderer 分包已落地：主包从 3,325.69 kB 降到 **1,205.37 kB（-63.8%）**。`electron.vite.config.ts` 按 vendor 域拆出 `vendor-milkdown`（1,846.73 kB）与 `vendor-react`（214.56 kB），mermaid/katex/cytoscape 保持既有按需分块（手动分组会把按需加载重新拉回首屏，故刻意不碰）；`lib/docx`（613 行 OOXML 生成）与 `lib/svg-rasterize` 改为导出执行时动态 import（`docx` chunk 19.4 kB）；设置/帮助/图片/PDF 选项/发布/版本历史/工作区全文搜索七个对话框在 `AppDialogs.tsx` 改为「打开时才挂载 + Suspense」懒加载（各 5.4–33.2 kB chunk），命令面板（Ctrl+P）与关闭确认是高频路径保持静态。全量测试 142 文件 1123 项通过，build 通过。

## 本轮提交

| 提交 | 内容 |
| --- | --- |
| `d76a0a5` | 稳定 Electron smoke 启动 |
| `9854fef` | 将真实 Milkdown 接入 EditorAdapter |
| `34d138d` | 统一 DocumentRecord 会话 store |
| `4867244` | 恢复 ESLint 质量门禁 |
| `926018a` | 增加运行时告警和合成性能门禁 |
| `2e8827c` | 让 ContextDock 完整消费 PanelRegistry |
| `fa66e1d` | 生产搜索/监听门禁、文档标签职责拆分、窄窗口抽屉与 TabBar 焦点，以及真实 Electron 大文档门禁（当前暴露序列化瓶颈） |
| `9eecdf0` | 超过 1 MiB 文档保存/关闭优先复用落账快照，避免同步序列化阻塞 Renderer |
| `7aee9a7` | 统一命令注册表执行入口并补齐 PanelRegistry 插槽覆盖 |
| `304c83a` | 往返选择状态统一到单一工作区视图模型 |
| `e5760ac` | 会话恢复补齐取消语义并核验关闭确认/多窗口竞态 |
| `f6c30a6` | quiet-workspace 视觉迁移：顶栏收敛为 52px 三区、侧栏五段式、新增雾白/夜松主题 |
| `bbf936c` | 主题对比度与焦点可见性门禁固化，补齐跳转链接与焦点缺口 |
| `04cbdd4` | 低频能力登记为命令并前移可用性判断（菜单灰显 / 快捷键提示同源） |
| `15ead72` | Renderer 主包分包与低频能力懒加载（主包 -63.8%，docx/对话框按需 chunk） |
| `576e3ff` | M0 评估与三份 NEXT 文档（评估 / 实施计划 / UI 规范） |

更早的基线、领域模型、命令边界和工作区壳层提交已包含在同一 `master` 历史中。

## 建议继续顺序

1. ~~修复关联 smoke 的过时选择器，恢复真实验证入口；补收藏重启读取、快捷键提示与文件计数，校准 CI 配置。~~（M0 已完成，见上文任务表）
2. S03 固定 5 MiB Electron P0 门禁已有通过证据；继续完成 M01 多形态、多设备与长运行，以及 S02 保存/关闭完整时序矩阵。
3. 以 `app/workspace/useWorkspaceFiles.ts`、`app/useAppSettings.ts`、`Editor/instance/useMilkdownInstance.ts`、`Editor/overlays/useEditorOverlays.ts` 和 `src/main/ipc/file-handlers.ts` 为拆分入口；AppComposition 已回到门禁内，触及时仍须评估职责。
4. 按下一版 UI 规范完成保存状态语义、顶栏/路径、轻大纲、小窗口、输入法、焦点和主题验证。
5. 连接已有搜索与回访路径，稳定现有导出并进行目标用户试用。低频能力登记与主要懒加载已完成，不重复安排。
6. 完成品牌/存储兼容决策、Windows 安装包以及 macOS/Linux 安装包和更新流程验证。

具体任务与退出条件见 [NEXT-DEVELOPMENT-PLAN](NEXT-DEVELOPMENT-PLAN.md)，以上均为待执行工作。


## 2026-09-13 收藏与取消收藏修复

补齐文件树、最近编辑、收藏列表的星标按钮，支持直接收藏/取消、实时计数和取消后的焦点恢复。修复旧恢复测试模拟错接口响应导致的漏检：`settings.get` 实际返回 `{ ok, data }`，现按成功响应解包；读取失败禁止写回覆盖旧记录。此项修正上文 T02 的过早完成判断。

验证：161 个测试文件、1244 项测试通过；typecheck、lint、build、a11y、Electron smoke 通过。额外以隔离配置连续启动三个真实 Electron 进程，验证「收藏并落盘 → 重启后恢复并取消 → 再次重启保持取消」，同时检查浅色/深色星标与取消后的焦点。临时验证文件和用户配置未进入仓库。

## 2026-09-13 Paperin 全量重命名

用户可见品牌、启动页、窗口标题、关于页、包元数据、文件关联、应用标识、原型、工作区状态目录和发布产物名称已统一为 `Paperin`。工作区状态统一写入 `.paperin`，项目源码、文档和测试不再保留旧产品名称。远程仓库地址作为发布基础配置保留，不作为产品界面名称。

验证：161 个测试文件、1244 项测试通过；typecheck、lint、build、a11y、demo:soft:check 和 Electron smoke 全部通过。

## 2026-09-13 发布弹窗视觉收敛

修复发布弹窗沿用通用横向弹窗布局导致的标题竖排问题：发布弹窗改为明确的纵向结构，标题栏、内容区和操作区按同一宽度对齐。移除发布选项之间重复的底部分隔线，改用留白、悬停背景和焦点背景表达可交互行；内容过长时只滚动内容区，保留关闭按钮和导出动作可见。

验证：typecheck、lint、build、a11y 和 Electron smoke 通过；当前分支已移除独立原型目录，因此未执行 demo:soft:check。
