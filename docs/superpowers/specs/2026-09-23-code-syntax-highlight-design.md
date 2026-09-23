# 代码块语法高亮与主题色板设计

日期：2026-09-23  
状态：已实现（2026-09-23）  
范围：Renderer 编辑器代码块（Milkdown Prism + Refractor）；不含导出 HTML 的独立高亮引擎（可后续对齐同一变量名）

## 1. 背景与目标

Paperin 已使用 `@milkdown/plugin-prism` + `refractor`，并在 `editor.css` 中为 Prism token 写了颜色。当前问题：

1. **语言覆盖**：默认约 62 种；`toml` / `tsx` / `jsonc` / `dockerfile` 等常见标识未注册。
2. **标识大小写**：浮层改语言未小写归一，Prism 大小写敏感导致「填了语言却无高亮」。
3. **配色可维护性差**：大量写死 hex；仅 `dark` / `github` / `atom` 有深色覆盖，其它主题易发闷或对比不足。
4. **与产品气质**：代码块是文档的一部分，需要舒适、克制，并与各主题 `--accent` 一致。

目标（按优先级）：

- **一致性**：同一套角色映射，所有主题共用；换主题只换变量值。
- **可维护性**：新增主题只补变量表，不复制 token 选择器。
- **可扩展性**：语言包与色板解耦；语言、别名、色板可独立演进。
- **可读性**：JSON/YAML 等配置类「键 / 字符串 / 数字 / 标点」一眼可分。

非目标（本轮不做）：

- 换成 Shiki / VS Code 全量主题引擎。
- 按语言定制不同色板。
- 导出链路强制同源高亮（仅约定变量名，便于以后对齐）。

## 2. 架构（写作台版方案 A）

```text
主题 CSS（每主题一组 --code-*）
        ↓
editor.css（.token.* → var(--code-*)，一处映射）
        ↓
Milkdown Prism 装饰（token 角色）
        ↑
configureCodeBlockRefractor（注册语言 + 别名 + 大小写入口）
```

原则对齐 Obsidian：**引擎只产出角色，主题产出颜色**；色相数量对齐 Typora 式克制；关键字挂钩 `--accent`，保持 Paperin 多主题粘合。

## 3. 语义色板（扩展点）

### 3.1 变量清单（稳定契约）

在主题根（`:root` / `[data-theme='…']`）定义：

| 变量 | 角色 | Prism token（映射层） |
| --- | --- | --- |
| `--code-fg` | 代码默认前景 | `pre code` 默认色（可选） |
| `--code-comment` | 注释、prolog、doctype、cdata | `.token.comment` 等 |
| `--code-keyword` | 关键字、builtin、important | `.token.keyword` 等 → **优先 `var(--accent-h)` 或专用色贴近 accent** |
| `--code-string` | 字符串、char、attr-value、inserted | `.token.string` 等 |
| `--code-number` | 数字、boolean、constant | `.token.number` 等 |
| `--code-function` | 函数名 | `.token.function` 等 |
| `--code-property` | 属性、键名、class-name、type、tag、attr-name、variable | `.token.property` / `.token.attr-name` 等 |
| `--code-punctuation` | 标点、括号、operator（克制） | `.token.punctuation` 等 |
| `--code-deleted` | diff 删除 | `.token.deleted` |

以后若需更细角色（如单独 `--code-tag`），**只增变量 + 映射一行**，不改主题结构。

### 3.2 浅 / 深两套默认 + 主题覆盖

- **`code-palette-light`**：写在 `default`（及浅色主题继承）：低饱和、偏灰，贴合暖白/雾白。
- **`code-palette-dark`**：写在 `dark`（及深色主题继承）：同色相提亮一档。
- 各主题文件：
  - 浅色系（`default` / `ocean` / `rose` / `typewriter` / `mist`）：继承 light，可只覆盖 `--code-keyword`（或字符串）以贴 accent。
  - 深色系（`dark` / `github` / `atom` / `pine`）：继承 dark，同样少量覆盖。

实现组织建议（维护性）：

1. `styles/code-syntax.css`：仅 `.token.* { color: var(--code-*); }`，**禁止写死业务 hex**。
2. `styles/themes/_code-palette-light.css` / `_code-palette-dark.css`：默认色值。
3. 各 `themes/*.css`：按需覆盖 0～N 个 `--code-*`。

删除现有 `editor.css` 中大段 `[data-theme=dark|github|atom] .token…` 重复选择器。

### 3.3 默认色值方向（实现时微调对比度）

浅色（示意，非最终像素级）：

- comment → 近 `--text-3`
- keyword → 近 `--accent-h`
- string → 柔和绿灰
- number → 暖褐
- function → 冷静蓝灰
- property → 柔和棕/紫灰（与 string 分离，服务 JSON 键）
- punctuation → `--text-3`

深色：同角色提高亮度，保持色相；keyword 跟深色 `--accent-h`。

验收：在 default / dark / ocean / pine / github 下打开含 JSON、YAML、TS、Python 的代码块，键值可辨、不刺眼、不与正文抢对比。

## 4. 语言包（与色板解耦）

### 4.1 注册入口

扩展 `configureCodeBlockRefractor`：

1. 注册 **常用语言包**（显式 import `refractor/lang/*`，可列清单于同文件或 `code-languages.ts`）。
2. 声明 **别名表**（如 `yml→yaml`、`jsonc→json` 或独立 jsonc、`dockerfile→docker`、`ts→typescript` 等，以 refractor 实际模块为准）。
3. 保持 mermaid → plain 的现有策略。
4. **幂等**：重复调用安全（已有测试延续）。

### 4.2 常用包范围（首轮）

在 refractor 默认集之上，优先补齐技术文档高频且当前缺失的，例如：

`toml`, `tsx`, `jsx`, `graphql`, `docker`/`dockerfile`, `powershell`, `vue`, `dart`, `kotlin`（若未在默认中则以 list 为准）, `jsonc`, `http`, `nginx`, `protobuf`/`proto`, `cmake`, `wasm` 等——**以「标识常被用户填写」为准**，不追求全量 300 种。

清单维护在单一数组/`registerCommonCodeLanguages(refractor)`，增语言 = 改一处 + 单测断言 `registered`。

### 4.3 标识归一化

- 浮层 `applyLanguage`：写入 attrs 前 `trim().toLowerCase()`，并可选过别名表。
- 围栏输入规则：已有 toLowerCase，保持。
- Prism 匹配前可再兜底 normalize（防御其它入口），避免 `JSON` / `Yaml` 无高亮。

## 5. 一致性与扩展规则

| 场景 | 规则 |
| --- | --- |
| 新主题 | 选 light 或 dark 底，覆盖需要的 `--code-*`；禁止在组件 CSS 写主题分支 hex |
| 新 token 角色 | 先加变量，再加映射；主题未定义时回退 `--text-2` |
| 新语言 | 只改语言注册模块 + 测试；不改 CSS |
| 对比度 | 主题 PR 需在浅/深代码块截图或 a11y 相关人工看一眼；不强制每 token WCAG AAA |

## 6. 测试与文档

- 单测：`configureCodeBlockRefractor` 对 json/yaml/toml/tsx 等 `registered`；重复调用；mermaid 仍为 plain。
- 单测：语言 normalize / 别名（纯函数）。
- 文档：`CHANGELOG`；`UI-INTERACTION-SPEC` 或编辑器相关说明中一句「代码块高亮随主题语义色」。
- 不把导出 HTML 高亮列为本轮门禁。

## 7. 风险

- 注册过多语言增加渲染包体积：用常用包而非全量；若后续体积吃紧再改为按语言动态 import（另开任务）。
- Prism `listLanguages().includes` 大小写：必须归一化，否则回归。
- soft-workbench 等皮肤层不得再次写死 token 色。

## 8. 实现顺序（确认后进计划）

1. 抽出 `--code-*` 映射 CSS + light/dark 默认色板，删重复主题选择器。
2. 各主题按需覆盖。
3. 语言包注册 + 别名 + applyLanguage 归一化。
4. 测试与 CHANGELOG。

---

确认本设计后，再拆实施计划并编码。
