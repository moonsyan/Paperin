# 无障碍与主题可读性冒烟报告

更新时间：2026-09-22（Asia/Shanghai）。全量文档同步时重跑 `npm run a11y` 退出 0：九主题 254 项检查、37 项基线豁免、0 失败；焦点扫描 31 个样式表、10 处兜底、1 处豁免、0 违规。下文早期主题表和修复过程是历史证据，不作为当前数量。代码里的输入法 Escape 保护不能代替真机中文输入法、全键盘和缩放人工检查。

本报告保留 quiet-workspace 视觉迁移（`f6c30a6`）之后的机械门禁和修复记录，并维护待执行人工清单。本轮仅更新文案和证据口径，没有修改主题或交互实现。

## 结论摘要

| # | 检查项 | 方式 | 结论 |
| --- | --- | --- | --- |
| 1 | 九套主题 token 完整性 | 机械（`scripts/theme-contrast.mjs`） | 通过 |
| 2 | 九套主题文本/边框/弹层/系统标题栏对比度 | 机械（硬门禁 + 棘轮基线） | 通过；37 项存量债务已登记，新增主题零债务（`--border-m` 除外） |
| 3 | 焦点可见性（`outline: none` 是否有替代） | 机械（`scripts/focus-outline.mjs`） | 当前通过；历史视觉迁移修复 7 处缺陷 |
| 4 | 关键界面的可访问名称与状态语义 | 机械（`src/renderer/src/a11y-smoke.test.tsx` + 弹窗组件测试） | 通过；工作区搜索/发布弹窗具备 dialog 语义与 Tab 陷阱 |
| 5 | 跳转链接（键盘绕过顶栏/侧栏直达正文） | 机械（组件 + 接线契约测试） | 已有实现与回归；非本轮新增功能 |
| 6 | 全局 `prefers-reduced-motion` 降级 | 机械（`global.css` 全局规则，`context-dock.css` 单点保留） | 通过 |
| 7 | 全键盘导航路径 | 人工（见文末清单） | **UNVERIFIED**（真机 Electron） |
| 8 | 焦点不被弹层遮挡 | 自动单测 + 真机矩阵 | **已通过（自动）**：`useModalDialogKeyboard` 关闭后焦点恢复触发器/正文宿主、搜索/发布 Tab 陷阱；**UNVERIFIED**：九主题 × 三档缩放弹层裁切 |
| 9 | 中文输入法组合态 | 自动单测 + 真机矩阵 | **已通过（自动）**：`isImeComposing`/`229`、脚注 orphan 组合态、`math-edit` Enter/Escape、模态 Escape、工作区搜索/发布组合态 Escape；**UNVERIFIED**：Windows 系统拼音 × 100/125/150% × 九主题真机 |

三条机械门禁已进 `npm run test`（随 vitest 全量运行），也可以单独跑：

```
npm run a11y            # 对比度 + 焦点可见性，一次跑完
npm run a11y:contrast   # 只看主题对比度，附完整实测表
npm run a11y:focus      # 只看焦点可见性
```

## 门禁一：主题对比度

### 口径

`scripts/theme-contrast.mjs` 解析 `src/renderer/src/styles/themes/*.css` 里所有 `:root` / `[data-theme=...]` 块，按 WCAG 2.1 计算对比度（`relativeLuminance` → 合成 alpha → 比值）；系统标题栏配色不在主题 CSS 里，另外从 `src/renderer/src/app/constants.ts` 的 `TITLEBAR_COLORS` 解析后并入同一套判定。

- **text 级（4.5:1）**：`--text-1`、`--text-2`、`--accent`、`--danger`、`--success` 分别落在 `--bg-app` / `--bg-surface` / `--bg-sidebar` / `--bg-menu`（弹层：菜单、对话框、命令面板）上，外加 `--accent` 落在侧栏激活行底色（`--accent-bg` 合成到 `--bg-sidebar`）上，以及系统标题栏的按钮图标色落在标题栏底色上。
- **ui 级（3:1）**：`--border-m` 落在 `--bg-surface` 上、`--accent` 落在 `--bg-app` 上（焦点环与激活标记用的就是 accent 描边）、`--accent-line` 落在 `--bg-sidebar` 上（仅定义了该 token 的主题参与）。
- **当前只记录不门禁**：`--text-3` / `--text-4` 输出实测值供人工核对用途。这是现有脚本覆盖边界，不表示所有弱文字都可豁免；用于正常可读说明时仍按 UI 规范检查，不能仅凭 token 名称判断合格。

早期每主题 24–25 项共 218 项；新增四表面 `--border-input` 检查后当前共 254 项。`TITLEBAR_COLORS` 与主题文件双向核对：主题缺配色条目、或映射表留下已删除主题的残条，都会失败。

### 判定方式：硬门禁 + 棘轮

对比度门禁没有一次性把七套既有主题拉齐到 WCAG 下限，原因是 `--border-m` 在**全部九套主题**都只有 1.16–1.55:1。2026-09-12 T12 已完成语义拆分：`--border-m` 收窄为**纯装饰分割线**（WCAG 1.4.11 不要求装饰元素达标，9 条债务继续「只不变差」），输入类控件的静止态描边改由新 token `--border-input` 承担并按 3:1 硬门禁对四个表面校验。因此采用两段判定：

- 未达下限的组合必须登记在 `docs/development/theme-contrast-baseline.json` 的 `accepted` 里，且实测值不得比登记值更差（容差 `0.02`）。新出现的低对比组合会直接失败。
- 未登记的条目一律失败。登记条目已达标时会提示从基线移除（防止债务清单腐化）。
- `mist` / `pine` 作为本次新增主题，不允许靠登记基线绕过门禁：测试显式限定这两个主题只允许登记 `--border-m` 一项。

### 历史九主题实测（输入边框拆分与 typewriter 修复前）

本表保留早期 218 项样本，其中 typewriter 的低值已在 T12 修复，不能与当前 254 项/37 项债务混计。当前逐项值由 `npm run a11y:contrast` 输出，原始基线不在文档同步时改写。

| 主题 | 检查项 | 未达下限（已登记债务） | 最弱正文组合 | 最弱比值 |
| --- | --- | --- | --- | --- |
| atom | 24 | 8/24 | accent on accent-bg/bg-sidebar（激活行） | 3.11 |
| dark | 24 | 2/24 | danger on bg-menu | 4.34 |
| default | 24 | 5/24 | accent on accent-bg/bg-sidebar（激活行） | 3.84 |
| github | 24 | 1/24 | danger on bg-sidebar | 5.16 |
| mist（新） | 25 | 1/25 | success on bg-sidebar | 4.67 |
| ocean | 24 | 6/24 | success on bg-sidebar | 3.51 |
| pine（新） | 25 | 1/25 | danger on bg-surface | 5.37 |
| rose | 24 | 10/24 | success on bg-sidebar | 3.47 |
| typewriter | 24 | 9/24 | accent on accent-bg/bg-sidebar（激活行） | 2.24 |

### 历史修正（新增主题临界值）

新主题接入时实测有四处踩线，已按等色调加深修正，视觉上仅有一档明度差：

| token / 位置 | 设计稿取值 → 实际取值 | 组合 | 修正前 | 修正后 |
| --- | --- | --- | --- | --- |
| `--text-2` | `#667168` → `#616C64` | text-2 on bg-sidebar | 4.47 | 4.80 |
| `--accent` | `#3F7658` → `#3C7154` | accent on accent-bg/bg-sidebar | 4.46 | 4.78 |
| `--accent-line` | `#6AA07A` → `#5A9070` | accent-line on bg-sidebar | 2.66 | 3.26 |
| `TITLEBAR_COLORS.mist.symbol` | `#667168` → `#616C64` | 系统标题栏按钮 | 4.47 | 4.80 |

`pine`（夜松）全部正文组合在 5.37 以上，`accent-line` 6.46，标题栏 8.28，无需修正；唯一债务是与其它八套主题一致的 `--border-m`。

### 存量债务

37 项未达下限的组合已逐项登记在 `theme-contrast-baseline.json`，集中在四类：

1. **`--border-m`（9/9 主题，1.16–1.55:1）** —— ✅ 已于 2026-09-12 T12 解决：该 token 收窄为纯装饰分割线（WCAG 1.4.11 不要求装饰元素达标，债务继续登记以防变差）；输入类控件描边改由新 token `--border-input` 承担（搜索框、设置输入框、图谱搜索、代码块语言输入、状态栏目标输入、侧栏重命名等），九主题全部 ≥3:1 硬门禁达标。
2. **`--accent` 在部分弱色主题组合仍不足（atom / rose / default / ocean）** —— typewriter 的历史最低 2.24 已修复；当前剩余债务按脚本逐项输出，不能沿用旧值。
3. **`--success` / `--danger` 在 rose / ocean / default / atom / dark 上略低于 4.5** —— 多数在 4.1–4.5 之间，差距小。
4. **弹层表面 `--bg-menu`（atom / dark / ocean / rose / typewriter 共 6 项）** —— 多数与第 2、3 类是同一个 token（accent / success / danger）在另一表面上的表现；`dark` 的 `danger on bg-menu` 4.34 是本次新引入的表面暴露出来的。

以上四类都已进入文末跟进项，本轮只保证「不变差」。

## 门禁二：焦点可见性

### 口径

`scripts/focus-outline.mjs` 扫描 `src/renderer/src/styles/**.css`：

1. 任何**基础规则**（选择器不含 `:hover` / `:active` / `:focus` 等状态伪类）里出现 `outline: none|0`，同文件必须存在匹配的 `:focus` / `:focus-visible` / `:focus-within` 规则，且该规则声明了可见替代（非 none 的 `outline` / `outline-color` / `outline-width`、`box-shadow`、`border-color`、`border`）。
2. **焦点规则自己**抹掉轮廓且不给替代，同样判违规。
3. 例外必须写进脚本内的 `EXEMPTIONS` 并给出理由，且例外必须仍命中（防止清单腐化）。

判定用结构化的声明解析（`parseDeclarations`），而不是「值里有没有 `none`」的正则——正则的 `\s*` 允许零宽间隔，会在 `outline: none` 的冒号后空匹配，把「抹掉轮廓」误判成「有轮廓」。

### 历史视觉迁移修复的 7 处缺陷

| 位置 | 问题 | 修法 |
| --- | --- | --- |
| `commandpalette.css` `.palette-item:focus` | 该规则与 `.palette-item:focus-visible` 同优先级但位置更后，等于把面板条目的焦点环**彻底抹掉**（原注释以为是压掉「双重呈现」） | 删除该规则，保留 `:focus-visible` 焦点环并把 `outline-offset` 改为 `-2px` 避免被滚动容器裁切 |
| `context-dock.css` `.context-dock-resizer:focus-visible` | 6px 宽拖拽把手只靠 `--accent-bg` 填充提示，且显式 `outline: none` | 拆分 `:hover` 与 `:focus-visible`，后者补 2px 内描边 |
| `editor.css` `.milkdown .mermaid-source-toggle:focus-visible` | 焦点态显式 `outline: none`，只剩背景/文字色变化 | 改为标准 `outline: 2px solid var(--accent)` |
| `editor.css` `.milkdown .math-edit` | 抹掉轮廓，且边框恒为 accent，聚焦无任何变化 | 补 `:focus { box-shadow: 0 0 0 2px var(--accent-bg) }` |
| `editor.css` `.fm-input` | 同上 | 同上 |
| `sidebar.css` `.tree-rename-input` | 同上 | 同上 |
| `settings.css` `.fine-slider` | `appearance: none` 后抹掉轮廓，滑块无焦点提示 | 补 `:focus-visible { box-shadow: 0 0 0 3px var(--accent-bg) }` |

### 唯一豁免

| 选择器 | 理由 |
| --- | --- |
| `components/editor.css` `.milkdown .editor` | 正文编辑区是持续聚焦的写作区，焦点由主题色光标（`caret-color: var(--accent)`）体现，绘制轮廓会干扰排版 |

2026-09-22 重跑：31 个样式表，抹掉轮廓且已有焦点兜底 10 处，豁免 1 处，违规 0 处。

## 2026-09-20 工作区搜索与发布弹窗基线

共享 hook `src/renderer/src/hooks/useModalDialogKeyboard.ts` 统一：`role="dialog"`、`aria-modal`、初始焦点、捕获阶段 Tab 循环、Escape（`isImeComposing`）与关闭后焦点恢复（触发器失联时落到 `#editor-content`）。

| 弹窗 | 可访问名称 | 初始焦点 | 单测文件 |
| --- | --- | --- | --- |
| 工作区搜索 | `aria-labelledby` → 标题「在工作区中搜索 · …」 | 搜索输入框 | `WorkspaceSearchDialog/index.test.tsx` |
| 发布 | `aria-labelledby` → 「发布」 | 关闭按钮（与帮助弹窗一致） | `PublishDialog/index.test.tsx` |

导出进行中（`busy`）时 Escape 与遮罩点击仍不关闭，与现有导出取消策略一致。

### 主题豁免复核（37 项基线）

本轮**未**机械删除 `theme-contrast-baseline.json` 登记项。对照后仅做核心任务相关的视觉修正：

- 发布弹窗模板说明由 `--text-3` 改为 `--text-2`，保证九主题下说明文字可读（仍可能低于 4.5:1 的 `--text-3` 债务保留在基线「只记录」项，不冒充全面达标）。
- 搜索/发布弹窗内按钮与分段控件补 `:focus-visible` 描边，避免仅依赖 `--accent` 在弱色主题上对比不足时失去焦点线索。
- `--border-m` 九主题装饰线债务维持登记；输入描边继续走 `--border-input` 硬门禁。

### 九主题 × 缩放矩阵（UNVERIFIED）

目标设备人工矩阵（100% / 125% / 150% 缩放、1280×800 / 820px / 640×600、九主题）**未在 Electron 真窗执行**，状态标 **UNVERIFIED**。自动化已通过：`npm run a11y`（对比度 + 焦点扫描）、`footnote.test.ts` / `mathEditable.test.ts` 组合态与合法 `TextSelection`、`useModalDialogKeyboard.test.tsx` 焦点恢复、既有弹窗 IME Escape 单测。未测组合示例：`rose`/`ocean` @ 150% 发布弹窗滚动区焦点环裁切；640px 长中文标签顶栏溢出；Windows 系统拼音误提交/误关闭。真机清单见文末 A/B/C。

### P1-03 自动门禁（2026-09-22）

| 范围 | 命令 / 测试 | 结果 |
| --- | --- | --- |
| 脚注 IME + 选区 | `footnote.test.ts` | 通过；无 `TextSelection`  stderr 噪声 |
| 公式 IME + KaTeX 夹具 | `mathEditable.test.ts` | 通过；中文用 `\text{}`，未屏蔽未知 KaTeX 警告 |
| 弹层焦点恢复 | `useModalDialogKeyboard.test.tsx` | 通过 |
| 组件 a11y 冒烟 | `a11y-smoke.test.tsx` | 通过 |
| 主题/焦点机械扫描 | `npm run a11y` | 退出 0（随全量 `npm run test`） |
| 缩放 / 系统拼音 / 九主题真机 | 人工 | **UNVERIFIED** |

## 门禁三：组件级无障碍冒烟

`src/renderer/src/a11y-smoke.test.tsx`（13 项）覆盖视觉迁移后的四个关键界面：

- **可访问名称**：把每个 `button` / `a[href]` / 表单控件 / `[role=button|textbox|link|switch|checkbox]` / `[tabindex]` 收集起来，用 accname 的简化实现（`aria-label` → `aria-labelledby` → 文本 → `title`）逐个求名，任何空名称即失败；并先断言「确实扫到了 > 4 个控件」，避免选择器失配导致的空扫通过。
- **顶栏三区**：侧栏切换 / 专注模式 / 设置三个纯图标按钮都可被读屏定位；文档标题是可命名的 `role="textbox"` 而不是匿名 `contentEditable`；工作区上下文点把「已打开 / 未打开」写进无障碍名。
- **侧栏五段式**：搜索触发框、快捷导航、集合标题、底部设置入口都有名称；当前视图用 `aria-pressed` 暴露（不是只靠 `.selected` 类名）。
- **扁平列表（最近编辑 / 收藏）**：行是键盘可达的（`tabIndex=0`），Enter 与空格都能打开；空集合给出空状态文案而不是一片空白。
- **当前文件标识**：保留 `role="status"` + `aria-live="polite"`，朗读文本含文件名/来源/保存状态；2026-09-15 的无盘状态复核要求示例和未命名不得读作“已保存”，顶栏、路径条、状态栏三处一致。紧凑形态裁掉的工作区名与文件名留在 `.sr-only` 里。
- **工作区壳层**：`role="region"` + `aria-label="工作区"`，open/empty 状态可从 `data-workspace-state` 读出。

历史视觉迁移还补齐两处：

- 侧栏集合标题在激活态下输出 `aria-current`，此前只有 `.selected` 类名，读屏用户无法得知当前处于哪个集合视图。
- **跳转链接**（`app/SkipLink.tsx`）：demo 有 `跳到正文`，生产此前缺失。已补为应用内第一个可聚焦元素，指向正文宿主容器 `#editor-content`；落点容器带 `tabIndex={-1}`（否则锚点只滚动不移动焦点，跳转链接等于失效）。样式上用 `transform` 把链接常态移出视口上方、`:focus` 时滑入——**不能**用 `display: none` / `visibility: hidden`，那会让它掉出 Tab 序列。`a11y-smoke.test.tsx` 同时锁住组件行为与三处接线（容器 id、根节点渲染、样式滑入规则），防止后续漂移。

## 人工冒烟清单（待执行）

以下三项无法机械判定，需要在真实 Electron 窗口里过一遍。每条都给了可复现的操作路径与期望结果。

### A. 全键盘导航

0. 打开应用后用 `Tab` 按第一下：应从窗口顶部滑入一条「跳到正文」链接；按 `Enter` 后焦点应落到正文区，光标可直接进入编辑（已有功能，仍需真机确认滑入动画与落点位置）。
1. `Ctrl+J` 收起 / 展开侧栏 → 焦点不应丢失，仍停在触发按钮上。
2. 在侧栏里 `Tab`：搜索触发框 → 最近编辑 → 我的收藏 → 集合标题 → 新建 → 文件树行 → 底部设置入口；每一步都应看到焦点环。
3. 文件树行上按 `Enter` 打开文件、按 `Space` 同样能打开；方向键展开/折叠文件夹。
4. `Ctrl+P` 打开快速打开，输入 `>` 进入命令模式 → 输入关键词 → `↑`/`↓` 移动 → `Enter` 执行；`Esc` 后焦点回到触发位置。`Ctrl+K` 是插入链接，用户自定义键位以映射为准。
5. `F11` 进入/退出专注模式后，焦点不应落到已隐藏的顶栏控件上。
6. `Tab` 走进命令面板结果列表时，条目应显示焦点环（已有修复，需确认 `outline-offset: -2px` 在滚动容器里没有被裁切）。

### B. 焦点不被弹层遮挡

1. 打开设置（顶栏齿轮 / 底部设置入口）→ `Tab` 到最靠下、最靠右的控件，焦点环不应被弹层边缘裁掉。
2. 打开任一对话框（关闭确认、图片插入、版本历史、**工作区搜索、发布**）→ `Tab` 循环不应跑到背景内容里；`Esc` 关闭后焦点回到打开它的按钮（触发器已卸载时应落到正文区）。
3. 命令面板与右键菜单在顶栏下方弹出时，顶栏 52px 高度不应压住焦点环（顶栏 `overflow` 已确认为默认可见，`.tab:focus-visible` 用的是 `outline-offset: -2px` 内描边，理论上无裁切）。
4. 在 820px 断点两侧以及 640×600 窗口检查侧栏抽屉，`Tab` 进入后焦点环不应被边缘裁切；900px 可作为中间样本，不是当前抽屉断点。

### C. 中文输入法组合态

1. 文档标题（`contentEditable`）：拼音组合中不应触发保存/重命名；`Esc` 取消组合不应误关窗口。
2. 文件树内联重命名：输入拼音过程中不应把未上屏字符当作文件名提交；`Enter` 确认后名称正确。
3. 侧栏标签筛选框、搜索框、公式编辑框（`.math-edit`）、属性值输入框（`.fm-input`）：组合态下不应触发行内解析或浮层跳动。
4. 命令面板输入框：组合态下 `↑`/`↓` 不应被输入法吞掉或误触发列表滚动。

### D. 减少动态效果

1. 系统开启「减少动态效果」（Windows：设置 → 辅助功能 → 视觉效果 → 动画效果关闭）后启动应用：过渡与动画应被压缩到 0.01ms，`scroll-behavior` 变为 `auto`。
2. 侧栏折叠、标签切换、弹层出现不应有可见滑动/淡入。

## 跟进项

### P1

- ~~重定 `--border-m` 语义（或为控件新增 `--border-control`），让输入框/搜索框描边达到 WCAG 1.4.11 的 3:1~~ ✅ 已完成（2026-09-12 T12）：新增 `--border-input`，九主题达标，`--border-m` 保留装饰线角色与其 9 条「不变差」债务登记。
- ~~修 `typewriter` 主题的 accent（最低 2.24，同时是焦点环描边色），至少把 `accent on bg-app（图形元素）` 拉到 3:1~~ ✅ 已完成（2026-09-12 T12）：accent #519d5c→#276634，四表面 ≥4.5:1，清除 6 条豁免。

### P2

- 把 `rose` / `ocean` 的 `--success`（3.47–4.17）与 `atom` / `default` 的 accent 激活行（3.11–3.84）拉齐到 4.5:1。
- 侧栏扁平列表与文件树行目前是 `role="listitem"` + `tabIndex=0` + Enter/Space，读屏不会把它朗读成可激活元素；建议改为 `role="option"` + `role="listbox"`，或直接换成 `<button>`。改动会波及现有树组件测试，宜独立提交。
- 命令面板已使用 combobox/listbox 和 `aria-activedescendant`，不能再把这项语义列为未实现。按钮仍可被 Tab 聚焦，继续验证真实键盘/读屏是否保持活动项、焦点与选择一致。

### P3

- 把人工冒烟清单里的 A/B/C/D 四组做成 Playwright/Electron 级自动化，纳入 `npm run smoke` 的扩展场景。
- `--text-3` / `--text-4` 当前只记录，重跑最低约 1.39:1；正常说明文本的用途检查仍须执行，禁用/装饰例外不能扩展到所有辅助文字。

来源复核、支持摘要等计划界面实施后须补可访问名称、取消、Escape、焦点恢复及真实 IME 检查；本报告不预先标记 P1-04/P1-06/P1-07 的新界面通过。
