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

同一面板 id 的后续注册会替换旧定义；开发环境抛出冲突提示，生产环境保留最新定义。列表先按 `order`，再按注册顺序稳定排序。面板可声明 `scope` 和 `enabled`，从而在没有工作区或当前文档时自动隐藏。
