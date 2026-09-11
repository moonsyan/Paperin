# Quiet-Workspace Demo 迁移评估

评估日期：2026-09-10（Asia/Shanghai）
评估对象：`design/quiet-workspace/`（index.html / style.css / demo.ts）对照 `src/renderer/` 当前生产实现
评估方法：逐区域比对 DOM 结构、CSS token、交互入口，并用全库检索验证功能是否存在（而非仅凭文档声明）。

## 一句话结论

**交互模型（壳层、命令、面板、会话）已迁移约八成；视觉语言（留白绿调、顶栏收敛、侧栏信息架构）基本未迁移。** 当前生产界面是"功能完整的新模型 + 旧视觉外壳"，demo 的价值恰好补在后者。按 REFACTOR-ROADMAP 的划分，Phase 2/3 已落地，Phase 4（主题与交互视觉）尚未开始。

## Demo 结构拆解（迁移评估的基准）

| 区域 | Demo 实现 | 关键特征 |
| --- | --- | --- |
| 侧栏 | brand 行 → 空间名（glyph + 本地标） → 搜索触发框（Ctrl K） → 快捷导航（最近编辑/我的收藏，带计数） → 文件集合标题（+新建） → 文档树 → 底部（状态点 + 设置） | 单栏承载全部导航；搜索为一等入口 |
| 顶栏 | 恢复侧栏钮 · 工作区上下文点 · 标签（下划线激活态） · 新建 · [专注][页边目录][更多] | 一条 52px 顶栏，三区固定 |
| 正文区 | 面包屑 → kicker（分类 + 收藏星标） → H1 → 副标题 → 元信息（日期 · 阅读时长） → 正文 → 末尾装饰 | 阅读宽度 650–680px，居中 |
| 页边 | sticky 大纲（150–166px 窄栏）+ 关联笔记 | 不打断写作，非弹窗 |
| 状态栏 | 保存状态（图标+文字） · 字数 · 本地保存 · 明暗切换 | 34px，极轻 |
| 弹层 | 命令面板（搜索 + `>` 命令）、更多菜单、设置（主题样张/字体/字号滑块）、关于 | 原生 `<dialog>` |
| 工程细节 | skip-link、sr-only、aria 完备、全局 `prefers-reduced-motion`、4 档响应式断点、移动端抽屉 + scrim | — |

## 已迁移（代码实证）

| Demo 概念 | 生产实现 | 证据 |
| --- | --- | --- |
| 持续可见的知识库壳层 | `WorkspaceShell`（region + open/empty 状态） | `components/WorkspaceShell/index.tsx` |
| 当前文件来源与 dirty 表达 | `CurrentFileBanner`（workspace/external 来源、未保存文本+颜色+data 属性） | `workspace-shell.css` |
| 页边目录 / 关联笔记 | `ContextDock`：大纲、链接、标签、属性、质量五面板，PanelRegistry 驱动，宽度记忆 + 键盘调宽 + Escape 焦点恢复 | `ContextDockPanels.tsx`、REFACTOR-STATUS |
| 命令面板（搜索 + 命令） | `CommandPalette` + 统一命令注册表（scope/关键词/可用性） | `app/commands/` |
| 专注模式 | `.focus-mode` 全局样式（顶栏/状态栏/侧栏淡出，悬停恢复） | `global.css` L315 |
| 编辑器适配层 | Milkdown `EditorAdapter`（demo 的 contenteditable 不采用，正确决策） | REFACTOR-STATUS |
| 空状态 | `StartScreen`（demo 反而没有空状态，生产超前） | `App.tsx` |
| 标签激活下划线 | demo `.tab.active::after` 与生产 `box-shadow: inset 0 -2px` 视觉等价 | `tabbar.css` L41 |
| 保存状态文字化 | StatusBar「已保存/未保存」+ 精确时间 | `StatusBar/index.tsx` |

生产能力**超过** demo 的部分：标签固定/预览斜体/拖拽排序/图谱标签/右键菜单；状态栏字数目标、章节字数、编码指示；7 套主题；版本历史、图谱、导出、发布等完整功能面。

## 未迁移（按区域）

### P1 — 结构性差距

1. **顶栏 chrome 四层堆叠，未收敛。**
   当前垂直堆叠：MenuBar 顶栏（42px）→ WorkspaceShell 上下文条（38px）→ CurrentFileBanner（52px）→ TabBar（34px）≈ **166px**，demo 为 52px 顶栏 + 34px 标签 ≈ **86px**。正文首屏被压掉约 80px，且"工作区名 / 文件标题 / 保存状态"在三处重复表达。
   方向：按 DEMO-AUDIT 的三区模型合并为一条顶栏；WorkspaceShell 上下文条并入侧栏空间名区域；CurrentFileBanner 的 dirty/来源信息并入标签 + 面包屑。

2. **侧栏信息架构未迁移。**
   生产 Sidebar（777 行）只有文件树（sidebar-tabs 已隐藏）。全库检索确认：**没有搜索触发框、没有"最近编辑/我的收藏"快捷导航、没有收藏功能本身**（`favorites` 仅 demo 存在）、没有空间名/本地标、没有侧栏底部区。最近文件只存在于 MenuBar 菜单里。
   方向：迁移 demo 侧栏五段式（brand → 空间 → 搜索 → 快捷导航 → 树 → 底部）；搜索框点击即开 CommandPalette（复用现有注册表，零新逻辑）。

3. **视觉 token 未映射。**
   两套完全不同的变量体系：demo `--paper/--ink/--accent:#3f7658`（松绿）vs 生产 `--bg-app/--text-1/--accent`（7 套主题各自定义）。Roadmap Phase 4「quiet-workspace CSS 变量映射到正式主题 token」尚未开始。
   方向：把 demo 的雾白/夜松作为**第 8/9 套主题**接入现有 token 体系（而非替换），排版尺度（H1 clamp(28px,2.8vw,38px)、正文 line-height 1.92、阅读宽 650px）落入 `typography.css`。

### P2 — 体验层差距

4. **正文头部信息层级缺失。** demo 的面包屑（文件夹 › 文件）、kicker 分类、日期/阅读时长元信息，生产均无对应（CurrentFileBanner 是工具条而非阅读流的一部分）。
5. **收藏功能整体缺位。** demo 有收藏星标 + 侧栏收藏入口，生产无任何收藏实现——需先补数据层（收藏列表存 settings/工作区状态），不只是 UI。
6. **页边目录形态差异。** demo 是 150px sticky 窄栏常驻正文旁；生产 ContextDock 是右 dock 面板。功能已覆盖，但视觉重量不同——建议给 ContextDock 增加 demo 式"窄栏极简"展示模式（仅大纲时），而非照搬布局。
7. **窄窗口抽屉未统一。** REFACTOR-STATUS 已列；demo 的单一抽屉机制（侧栏 + scrim，<760px）和页边目录弹层（<1023px）可作为直接参照。

### P3 — 打磨层差距

8. **`prefers-reduced-motion` 生产仅 1 处**（context-dock.css），demo 为全局规则——一行 CSS 可补齐。
9. **设置对话框形态。** demo 主题样张（雾白/夜松/跟随系统三卡）+ 字号滑块的"轻设置"，生产是四面板全功能设置。可在 AppearancePanel 引入样张卡视觉。
10. **demo 细节装饰**：文档末尾书签装饰线、空间 glyph、状态点——低成本高辨识，随主题迁移一并带入。

## Demo 不能照搬的部分（已有审查结论 + 本次确认)

- contenteditable 编辑器：仅演示用，生产 Milkdown 适配层已完成，不回退。
- 无空状态/无外部文件态/无冲突态：DEMO-FUNCTION-COVERAGE 已列四个必补状态，生产的 StartScreen + CurrentFileBanner 已覆盖其中两个，外部文件冲突与"文件不可用"态仍需端到端固化。
- 单一 `documents + activeId` 数据模型：生产 DocumentRecord/WorkspaceStateBundle 已是超集，以生产为准。
- 标签无 dirty 圆点：迁移视觉时需在 demo 样式上补 dirty 表达（生产 CurrentFileBanner 有，标签上没有）。

## 关键决策点（迁移前需要定）

1. **绿调留白是"替换默认主题"还是"新增主题"？** 建议新增（雾白/夜松），不动现有 7 套主题的兼容矩阵。
2. **MenuBar 去留。** demo 无菜单栏，全部走命令面板 + 更多菜单。生产 MenuBar（371 行）承载最近文件等真实功能——建议保留但默认收起/合并进顶栏三区，而非删除。
3. **页边目录 vs ContextDock。** 建议保留 ContextDock（功能超集），只吸收 demo 的视觉轻量化。

## 改进建议清单（按优先级）

| 优先级 | 事项 | 预期收益 | 依据 |
| --- | --- | --- | --- |
| P1 | 顶栏四层 chrome 收敛为一条三区顶栏 | 正文首屏 +80px；标题/dirty/来源不再三处重复 | 实测 166px vs 86px |
| P1 | 侧栏五段式迁移（搜索触发框 + 快捷导航 + 底部区） | 搜索成为一等入口；侧栏从"只有树"变成完整导航 | 全库检索确认缺失 |
| P1 | 留白主题 token 映射（新增雾白/夜松两套） + 排版尺度落入 typography.css | 视觉语言统一；不动现有主题兼容性 | Roadmap Phase 4 |
| P2 | 收藏功能数据层 + 星标入口 | demo 快捷导航有真实数据支撑 | 当前无任何收藏实现 |
| P2 | 正文头部：面包屑 + 元信息并入阅读流，CurrentFileBanner 退役或瘦身 | 减少一层工具条；信息在阅读位置出现 | DEMO-AUDIT §视觉层 |
| P2 | 窄窗口统一抽屉（侧栏 + 页边共用 scrim 机制） | 小窗口行为一致，键盘可恢复焦点 | REFACTOR-STATUS 未完成项 |
| P3 | 全局 `prefers-reduced-motion` 规则 | 无障碍合规，一行改动 | 实测仅 1 处 |
| P3 | AppearancePanel 引入主题样张卡；ContextDock 大纲窄栏极简模式 | 设置更直观；页边更接近 demo 的轻 | demo settings-dialog |

## 验收建议

迁移每一批后跑 DEMO-FUNCTION-COVERAGE 的 7 条验收用例（已覆盖空状态、外部文件、冲突、重命名同步、命令面板、小窗口抽屉、错误态），并补两条视觉验收：顶栏总高 ≤90px；任一主题下文本/边框/悬停/焦点对比度通过人工冒烟。
