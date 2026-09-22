# 命令与面板扩展

Paperin 的菜单、快捷键和命令面板共享 `app/commands/app-command-registry.ts`。命令使用稳定 `id`、中文 `title`、可选 `shortcut`、`keywords` 和作用域 `scope`，执行前由 `CommandContext` 统一判断当前应用、工作区或文档是否可用。

命令面板的 `>` 模式会优先展示当前注册表中可用的命令，并保留旧版内置动作作为兼容回退。宿主调用 `runCommand` 时仍可传入旧动作字符串，因此旧菜单和快捷键无需一次性迁移。面板本身是模态对话框：Escape 在捕获阶段关闭且不再冒泡，当前项通过 `aria-activedescendant` 暴露给读屏。

搜索结果和反链都可以「插入引用」：把当时的片段和相对来源链接写进当前文章，标题行会带普通 Markdown 锚点，可单步撤销，不修改来源文件。工作区搜索对话框与侧栏「关系」面板都会标注该动作；开始页也用同一任务语言说明入口。从搜索插入后关闭搜索并回到打开搜索时的写作位置。若搜索期间换成了另一篇文档，旧结果不会插进去。搜索词和最近引用的库内路径会记在工作区设置里，下次打开同一知识库时填回，可以清除，不保存正文。插入成功后还会记下该来源当时的 `mtime`（不存正文或哈希）；质量面板据此显示「来源已变化 / 来源缺失 / 索引未完成」。来源被移动或改名时不会自动改正文链接，只提供重新定位和打开搜索。

发布对话框保存的是模板、目录选项和发布范围，最多 20 条，写在工作区设置里，不含正文。导出 HTML 资源包时会在 `reports/paperin-delivery-report.json` 写入诊断计数和相对路径；报告失败则整个资源包失败。复制富文本只适用于当前文档。

**当前来源边界：** `documentSourceBaselines` 按引用文档维护来源 mtime；旧全局 `sourceSnapshots` 迁移为最多 50 条 `legacySourceSnapshots`（归属未知，不当作当前文章已复核）。质量面板只展示当前文章来源异常，并提供「复核当前文章」（更新该文基线为索引 mtime，不等于正文已人工复核）。「重新定位」仍只打开来源文件名搜索。清除导航与删除来源关系分开：前者清搜索词/最近引用，后者清持久基线与 legacy 记录，均不改正文。P2-02 显式重定位迁移仍待办。支持摘要命令 `supportSummary`（设置 → 高级 →「打开预览…」同源）：先预览脱敏 JSON（含本地事件计数与近期错误码），再复制或导出；不自动上传。

默认键：快速打开 `Ctrl+P`，输入 `>` 切命令模式；`Ctrl+K` 是插入链接；`Ctrl+J` 切侧栏；`Ctrl+Shift+L` 切大纲。用户改键后以实际映射为准。新增复核/支持摘要命令前必须登记 scope、可访问名称、冲突处理及无上下文提示，不预占默认键。

写作模板通过 `newTemplate:article`（技术文章）和 `newTemplate:decision`（决策记录）创建新的未保存文档。内容是普通 Markdown，不写品牌署名，也不覆盖已经打开的文件。README、API、设计文档和变更日志模板仍然保留。

`json`、`jsonc`、`json5`、`yaml`、`yml`，以及没有语言标记但内容本身是 JSON 的代码块，右下角可以格式化或压成一行。`jsonc` 会去掉字符串以外的注释；尾逗号和 json5 的无引号键暂不支持，点了会提示不是合法 JSON。YAML 排齐时保留注释，压成一行时注释会去掉。有缩进的代码块可以在行首折叠一段，至少盖住两行。折叠只改变显示，正文一变就丢掉折叠，不改文件里的文字。复制和导出时去掉这些按钮，被盖住的代码仍保留。

Mermaid 代码块在渲染前去掉共同缩进、零宽字符、误包的围栏和 `%%{init}%%`，不改文件。主题样式自带的 `.error-icon`，以及节点里的 “Syntax error” 文字，不算画失败。结果 SVG 会经 DOM 解析去掉脚本、事件属性、iframe 和不安全 URL，再用节点插入预览，避免 `innerHTML` 把未清洗的标记写进页面。画不出来时切回源码再看图表。

面板通过 `app/panels/panel-registry.ts` 注册到固定 slot：

| slot                | 用途             |
| ------------------- | -------------- |
| `sidebar.primary`   | 文件、最近、收藏       |
| `sidebar.secondary` | 大纲、关系、标签、属性、检查 |
| `editor.margin`     | 属性、关联笔记、版本信息   |
| `statusbar.end`     | 字数、编码、保存状态     |

同一面板 id 的后续注册会替换旧定义；开发环境抛出冲突提示，生产环境保留最新定义。列表先按 `order`，再按注册顺序稳定排序。面板可声明 `scope` 和 `enabled`，从而在没有工作区或当前文档时自动隐藏。ID 必须是 1–64 位的小写 ASCII 分段标识，可使用字母、数字、点、下划线和连字符；这一限制保证 ID 可安全进入布局持久化和 DOM。

`ContextDock` 的按钮顺序、标题和可用性直接来自 `PanelRegistry`，不再维护第二份静态面板清单。内置面板的作用域如下：

* `outline`、`properties` 是文档级面板；直接打开外部 Markdown、没有知识库时仍可用。
* `links`、`tags`、`quality` 是工作区级面板；没有知识库时不会显示。

若持久化的当前面板在新上下文中不可用，Dock 会展示注册表中的第一个可用面板，而不会渲染空白内容。完全隐藏时仍保留“显示上下文面板”按钮；面板内容获得焦点后按 Escape 会收起 Dock，并把焦点恢复到当前面板按钮。

扩展面板通过 `render(context)` 返回 React 内容；同一入口也可覆盖内置面板视图。没有内置视图且未提供 `render` 的定义不会进入 Dock。当前上下文没有任何可渲染面板时，Dock 自动缩为 44px rail 并隐藏无效的展开/收起按钮。拖拽调宽支持 `pointercancel`，组件卸载时会移除全局监听并恢复页面光标与选区样式；键盘用户可在分隔器上用左右方向键调宽。

## 低频能力登记表

图片、发布、导出、版本历史、设置、写作统计、关系图谱、工作区全文搜索这些能力平时不占界面，只靠菜单、快捷键和命令面板触达，最容易在重构中「悄悄失去入口」或「失去作用域判断」。它们统一登记为命令，作用域由 `CommandContext` 在**执行前**判定：

| 能力                                       | 命令 id                                                                         | scope       | 无上下文的入口表现      |
| ---------------------------------------- | ----------------------------------------------------------------------------- | ----------- | -------------- |
| 图片管理                                     | `images`                                                                      | `app`       | 始终可用（弹层自带空状态）  |
| 设置                                       | `settings`                                                                    | `app`       | 始终可用           |
| 支持摘要                                     | `supportSummary`                                                              | `app`       | 始终可用（预览后复制/导出） |
| 写作统计                                     | `stats`                                                                       | `app`       | 始终可用（无内容时展示零值） |
| 发布                                       | `publish`                                                                     | `document`  | 菜单灰显；快捷键给提示    |
| 导出 PDF / HTML / Markdown / DOCX / Pandoc | `exportPdf` / `exportHtml` / `exportMarkdown` / `exportDocx` / `exportPandoc` | `document`  | 同上             |
| 版本历史                                     | `versionHistory`                                                              | `document`  | 同上（快照按文件路径归档）  |
| 另存为                                      | `saveAs`                                                                      | `document`  | 同上             |
| 关系图谱                                     | `graph`                                                                       | `workspace` | 菜单灰显；快捷键/右键给提示 |
| 工作区全文搜索                                  | `wsSearch`                                                                    | `workspace` | 同上（要求打开工作区，当前搜索独立读盘） |

三档 `scope` 的判定口径（`app/commands/command-context.ts`）：

* `app`：恒可用。
* `workspace`：要求 `hasWorkspace`（工作区路径存在）。
* `document`：要求 `activeFileId`。**直接打开外部 Markdown、没有知识库时仍算完整文档上下文**——要求工作区会把保存与编辑器类面板一起藏起来，因此这里只认活动文件 id。

三处入口共用同一份判断，只是「不可用」的表达方式不同：

* **菜单**（`components/MenuBar`）在点击之前就把条目灰掉：`disabled` + `aria-disabled="true"` + `.is-disabled`，键盘下拉导航用 `.dd-item:not([disabled])` 跳过禁用项，`handleItemClick` 再挡一次以防键盘路径绕过 `disabled`。灰显样式用最弱一级的 `--text-4`（禁用态文字不受 WCAG 对比度约束）。
* **命令面板**只列出当前注册表中可用的命令，不可用的不会出现。
* **快捷键与右键菜单**没有灰显可依赖，因此每个需要运行期守卫的命令都带 `unavailableHint`。命中注册表命令时，`useActionDispatcher` 先用 `isActionAvailable` 判定，被挡下就调用 `onCommandUnavailable(hint, id)`（当前接 toast）并直接返回，不进入 `execute`——避免一次静默无响应。

`isActionAvailable` 来自 `useCommandRegistry`，与菜单灰显、命令面板过滤同源；未登记的动作（编辑器命令、`openRecent:*`、布局预设等）一律返回 `true`，交回原分发路径。这张登记表由 `src/renderer/src/app/actions/low-frequency-capabilities.test.ts` 固化：新增或改名低频能力时，要么补上登记，要么显式改这张表，不能默默漂移。
