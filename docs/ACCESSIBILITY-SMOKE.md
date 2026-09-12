# 无障碍与主题可读性冒烟报告

更新时间：2026-09-12（Asia/Shanghai）

本报告记录 quiet-workspace 视觉迁移（`f6c30a6`）之后的无障碍冒烟：哪些项目已经变成可机械校验的门禁，哪些必须人工过一遍，以及本轮实际修掉了哪些缺陷。

## 结论摘要

| # | 检查项 | 方式 | 结论 |
| --- | --- | --- | --- |
| 1 | 九套主题 token 完整性 | 机械（`scripts/theme-contrast.mjs`） | 通过 |
| 2 | 九套主题文本/边框/弹层/系统标题栏对比度 | 机械（硬门禁 + 棘轮基线） | 通过；43 项存量债务已登记，新增主题零债务（`--border-m` 除外） |
| 3 | 焦点可见性（`outline: none` 是否有替代） | 机械（`scripts/focus-outline.mjs`） | 通过；本轮修掉 7 处真实缺陷 |
| 4 | 关键界面的可访问名称与状态语义 | 机械（`src/renderer/src/a11y-smoke.test.tsx`） | 通过；补齐 1 处 `aria-current` |
| 5 | 跳转链接（键盘绕过顶栏/侧栏直达正文） | 机械（组件 + 接线契约测试） | 通过；本轮新增，此前 demo 有、生产缺 |
| 6 | 全局 `prefers-reduced-motion` 降级 | 机械（`global.css` 全局规则，`context-dock.css` 单点保留） | 通过 |
| 7 | 全键盘导航路径 | 人工（见文末清单） | **未执行**，需人工冒烟 |
| 8 | 焦点不被弹层遮挡 | 人工（见文末清单） | **未执行**，需人工冒烟 |
| 9 | 中文输入法组合态 | 人工（见文末清单） | **未执行**，需人工冒烟 |

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
- **只记录不门禁**：`--text-3` / `--text-4` 是刻意弱化的三级/四级提示色（同时承担禁用态文字），强行拉到 4.5:1 会破坏全部主题的视觉分层，因此只输出实测值供人工判断。

每套主题 24–25 项，合计 218 项。`TITLEBAR_COLORS` 与主题文件双向核对：主题缺配色条目、或映射表留下已删除主题的残条，都会失败。

### 判定方式：硬门禁 + 棘轮

对比度门禁没有一次性把七套既有主题拉齐到 WCAG 下限，原因是 `--border-m` 在**全部九套主题**都只有 1.16–1.55:1——它承担的是弱分割线/输入框描边角色，把它整体拉亮等于在重构提交里改掉所有主题的视觉密度。因此采用两段判定：

- 未达下限的组合必须登记在 `docs/development/theme-contrast-baseline.json` 的 `accepted` 里，且实测值不得比登记值更差（容差 `0.02`）。新出现的低对比组合会直接失败。
- 未登记的条目一律失败。登记条目已达标时会提示从基线移除（防止债务清单腐化）。
- `mist` / `pine` 作为本次新增主题，不允许靠登记基线绕过门禁：测试显式限定这两个主题只允许登记 `--border-m` 一项。

### 九套主题实测

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

### 本轮修正（新增主题临界值）

新主题接入时实测有四处踩线，已按等色调加深修正，视觉上仅有一档明度差：

| token / 位置 | 设计稿取值 → 实际取值 | 组合 | 修正前 | 修正后 |
| --- | --- | --- | --- | --- |
| `--text-2` | `#667168` → `#616C64` | text-2 on bg-sidebar | 4.47 | 4.80 |
| `--accent` | `#3F7658` → `#3C7154` | accent on accent-bg/bg-sidebar | 4.46 | 4.78 |
| `--accent-line` | `#6AA07A` → `#5A9070` | accent-line on bg-sidebar | 2.66 | 3.26 |
| `TITLEBAR_COLORS.mist.symbol` | `#667168` → `#616C64` | 系统标题栏按钮 | 4.47 | 4.80 |

`pine`（夜松）全部正文组合在 5.37 以上，`accent-line` 6.46，标题栏 8.28，无需修正；唯一债务是与其它八套主题一致的 `--border-m`。

### 存量债务

43 项未达下限的组合已逐项登记在 `theme-contrast-baseline.json`，集中在四类：

1. **`--border-m`（9/9 主题，1.16–1.55:1）** —— 该 token 被搜索框、设置面板输入框、菜单栏、侧栏重命名框等控件当作描边使用，按 WCAG 1.4.11（非文字对比度）本应达到 3:1。这是一处**真实的既有无障碍缺陷**，修法是重定 `--border-m` 与输入框描边的语义（要不要给控件单独一个 `--border-control`），会同时影响九套主题的视觉密度，因此不塞进本次重构提交。
2. **`--accent` 在弱色主题上不足（atom / rose / typewriter / default / ocean）** —— 其中 `typewriter` 最重（最低 2.24），accent 同时承担焦点环描边，属于焦点可见性问题。
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

### 本轮修复的 7 处真实缺陷

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

扫描结果：29 个样式表，抹掉轮廓且已有焦点兜底 10 处，豁免 1 处，违规 0 处。

## 门禁三：组件级无障碍冒烟

`src/renderer/src/a11y-smoke.test.tsx`（13 项）覆盖视觉迁移后的四个关键界面：

- **可访问名称**：把每个 `button` / `a[href]` / 表单控件 / `[role=button|textbox|link|switch|checkbox]` / `[tabindex]` 收集起来，用 accname 的简化实现（`aria-label` → `aria-labelledby` → 文本 → `title`）逐个求名，任何空名称即失败；并先断言「确实扫到了 > 4 个控件」，避免选择器失配导致的空扫通过。
- **顶栏三区**：侧栏切换 / 专注模式 / 设置三个纯图标按钮都可被读屏定位；文档标题是可命名的 `role="textbox"` 而不是匿名 `contentEditable`；工作区上下文点把「已打开 / 未打开」写进无障碍名。
- **侧栏五段式**：搜索触发框、快捷导航、集合标题、底部设置入口都有名称；当前视图用 `aria-pressed` 暴露（不是只靠 `.selected` 类名）。
- **扁平列表（最近编辑 / 收藏）**：行是键盘可达的（`tabIndex=0`），Enter 与空格都能打开；空集合给出空状态文案而不是一片空白。
- **当前文件标识**：保留 `role="status"` + `aria-live="polite"`，朗读文本含文件名/来源/保存状态；紧凑形态裁掉的工作区名与文件名留在 `.sr-only` 里。
- **工作区壳层**：`role="region"` + `aria-label="工作区"`，open/empty 状态可从 `data-workspace-state` 读出。

本轮顺带补齐两处：

- 侧栏集合标题在激活态下输出 `aria-current`，此前只有 `.selected` 类名，读屏用户无法得知当前处于哪个集合视图。
- **跳转链接**（`app/SkipLink.tsx`）：demo 有 `跳到正文`，生产此前缺失。已补为应用内第一个可聚焦元素，指向正文宿主容器 `#editor-content`；落点容器带 `tabIndex={-1}`（否则锚点只滚动不移动焦点，跳转链接等于失效）。样式上用 `transform` 把链接常态移出视口上方、`:focus` 时滑入——**不能**用 `display: none` / `visibility: hidden`，那会让它掉出 Tab 序列。`a11y-smoke.test.tsx` 同时锁住组件行为与三处接线（容器 id、根节点渲染、样式滑入规则），防止后续漂移。

## 人工冒烟清单（待执行）

以下三项无法机械判定，需要在真实 Electron 窗口里过一遍。每条都给了可复现的操作路径与期望结果。

### A. 全键盘导航

0. 打开应用后用 `Tab` 按第一下：应从窗口顶部滑入一条「跳到正文」链接；按 `Enter` 后焦点应落到正文区，光标可直接进入编辑（本轮新增，需确认滑入动画与落点位置）。
1. `Ctrl+J` 收起 / 展开侧栏 → 焦点不应丢失，仍停在触发按钮上。
2. 在侧栏里 `Tab`：搜索触发框 → 最近编辑 → 我的收藏 → 集合标题 → 新建 → 文件树行 → 底部设置入口；每一步都应看到焦点环。
3. 文件树行上按 `Enter` 打开文件、按 `Space` 同样能打开；方向键展开/折叠文件夹。
4. `Ctrl+K` 打开命令面板 → 输入关键词 → `↑`/`↓` 移动 → `Enter` 执行；`Esc` 关闭后焦点回到命令面板的触发位置。
5. `F11` 进入/退出专注模式后，焦点不应落到已隐藏的顶栏控件上。
6. `Tab` 走进命令面板结果列表时，条目应显示焦点环（本轮修复项，需确认 `outline-offset: -2px` 在滚动容器里没有被裁切）。

### B. 焦点不被弹层遮挡

1. 打开设置（顶栏齿轮 / 底部设置入口）→ `Tab` 到最靠下、最靠右的控件，焦点环不应被弹层边缘裁掉。
2. 打开任一对话框（关闭确认、图片插入、版本历史、工作区搜索）→ `Tab` 循环不应跑到背景内容里；`Esc` 关闭后焦点回到打开它的按钮。
3. 命令面板与右键菜单在顶栏下方弹出时，顶栏 52px 高度不应压住焦点环（顶栏 `overflow` 已确认为默认可见，`.tab:focus-visible` 用的是 `outline-offset: -2px` 内描边，理论上无裁切）。
4. 窄窗口（< 900px）侧栏变为抽屉时，`Tab` 进抽屉后焦点环不应被抽屉边缘裁切。

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

- 重定 `--border-m` 语义（或为控件新增 `--border-control`），让输入框/搜索框描边达到 WCAG 1.4.11 的 3:1；需同时评估九套主题的视觉密度变化，并清空对照基线里对应的 9 条债务。
- 修 `typewriter` 主题的 accent（最低 2.24，同时是焦点环描边色），至少把 `accent on bg-app（图形元素）` 拉到 3:1。

### P2

- 把 `rose` / `ocean` 的 `--success`（3.47–4.17）与 `atom` / `default` 的 accent 激活行（3.11–3.84）拉齐到 4.5:1。
- 侧栏扁平列表与文件树行目前是 `role="listitem"` + `tabIndex=0` + Enter/Space，读屏不会把它朗读成可激活元素；建议改为 `role="option"` + `role="listbox"`，或直接换成 `<button>`。改动会波及现有树组件测试，宜独立提交。
- 命令面板结果列表当前不在输入框的焦点陷阱内（`Tab` 会走到条目上）。本轮已修好条目焦点环，但更彻底的做法是把焦点维持在输入框并用 `aria-activedescendant` 表达当前位置。

### P3

- 把人工冒烟清单里的 A/B/C/D 四组做成 Playwright/Electron 级自动化，纳入 `npm run smoke` 的扩展场景。
- `--text-3` / `--text-4` 目前只记录不门禁，实测最低到 1.5:1（`default` / `atom` 的 text-4）。若后续认为三级提示文字也需要可读性保证，需先统一九套主题的视觉分层再上提门禁。
