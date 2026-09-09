# 命令与面板扩展

LastFileHome 的菜单、快捷键和命令面板共享 `app/commands/app-command-registry.ts`。命令使用稳定 `id`、中文 `title`、可选 `shortcut`、`keywords` 和作用域 `scope`，执行前由 `CommandContext` 统一判断当前应用、工作区或文档是否可用。

命令面板的 `>` 模式会优先展示当前注册表中可用的命令，并保留旧版内置动作作为兼容回退。宿主调用 `runCommand` 时仍可传入旧动作字符串，因此旧菜单和快捷键无需一次性迁移。

面板通过 `app/panels/panel-registry.ts` 注册到固定 slot：

| slot | 用途 |
| --- | --- |
| `sidebar.primary` | 文件、最近、收藏 |
| `sidebar.secondary` | 大纲、关系、标签、属性、检查 |
| `editor.margin` | 属性、关联笔记、版本信息 |
| `statusbar.end` | 字数、编码、保存状态 |

同一面板 id 的后续注册会替换旧定义；开发环境抛出冲突提示，生产环境保留最新定义。列表先按 `order`，再按注册顺序稳定排序。面板可声明 `scope` 和 `enabled`，从而在没有工作区或当前文档时自动隐藏。ID 必须是 1–64 位的小写 ASCII 分段标识，可使用字母、数字、点、下划线和连字符；这一限制保证 ID 可安全进入布局持久化和 DOM。

`ContextDock` 的按钮顺序、标题和可用性直接来自 `PanelRegistry`，不再维护第二份静态面板清单。内置面板的作用域如下：

- `outline`、`properties` 是文档级面板；直接打开外部 Markdown、没有知识库时仍可用。
- `links`、`tags`、`quality` 是工作区级面板；没有知识库时不会显示。

若持久化的当前面板在新上下文中不可用，Dock 会展示注册表中的第一个可用面板，而不会渲染空白内容。完全隐藏时仍保留“显示上下文面板”按钮；面板内容获得焦点后按 Escape 会收起 Dock，并把焦点恢复到当前面板按钮。

扩展面板通过 `render(context)` 返回 React 内容；同一入口也可覆盖内置面板视图。没有内置视图且未提供 `render` 的定义不会进入 Dock。当前上下文没有任何可渲染面板时，Dock 自动缩为 44px rail 并隐藏无效的展开/收起按钮。拖拽调宽支持 `pointercancel`，组件卸载时会移除全局监听并恢复页面光标与选区样式；键盘用户可在分隔器上用左右方向键调宽。
