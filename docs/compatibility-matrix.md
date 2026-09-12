# 兼容矩阵

> 2026-09-12 复核：表内“保留/已迁移”表示能力或契约存在，不代表当前版本已通过所有发布验证。最新普通 Electron smoke 因旧标题选择器失效而失败；当前收藏缺少重启读取。完整复核结果见 [REFACTOR-STATUS](REFACTOR-STATUS.md)，修复顺序见 [NEXT-DEVELOPMENT-PLAN](NEXT-DEVELOPMENT-PLAN.md)。

| 能力 | 旧实现 | 现有测试/依据 | 第一批状态 | 后续验证 |
|---|---|---|---|---|
| 打开文件/目录/系统关联 | `src/main/window/system-file-open.ts`, `file-handlers.ts`, `workspace-handlers.ts` | 参数/分流单测、Windows Electron smoke、`system-file-open-and-close.md` | 开发态已固化 | Windows 安装包关联、macOS Finder 与 Linux MIME 验证 |
| 保存、另存为、重命名、移动、回收站删除 | Main IPC + save queue | file-io、save-lock、close-save | 保留 | 冲突/权限手工验证 |
| 外部修改冲突 | expected mtime 保存协议 | document save tests | 保留 | 外部编辑器冒烟 |
| UTF-8/GBK/编码损失 | `file-io.ts` + iconv-lite | file-io tests | 保留 | 中文路径与不可映射字符 |
| 多标签、dirty、关闭确认 | DocumentRecord store + TabBar | record store、TabBar、document-session、close-save | 已迁移 | 多窗口冒烟 |
| 编辑器适配层 | Milkdown `EditorHandle` | adapter、快捷键与应用动作测试 | 已迁移 | 输入法与焦点人工验证 |
| 草稿恢复与会话持久化 | settings store + draft hooks | draft/session tests | 保留 | 重启恢复 |
| 工作区文件树、最近文件、收藏 | workspace hooks/components | workspace tests | 树与导航存在；收藏当前会话可用，重启恢复未完成 | 收藏读回/跨库合并/路径迁移、5000 文件 UI 性能 |
| 工作区壳层、当前文件来源与 dirty 上下文 | `WorkspaceShell` + `CurrentFileBanner` | 组件 Testing Library 契约测试 | 已迁移 | 多窗口、窄窗口与外部文件冒烟 |
| 全文搜索与当前文档查找替换 | search IPC + renderer search | search/keyboard tests | 保留 | 搜索结果定位 |
| 标签、Wiki 链接、反向链接、图谱 | shared indexes + panels | tag/link/graph tests | 保留 | 工作区往返 |
| GFM、任务列表、表格、代码、公式、Mermaid、脚注、frontmatter | Milkdown plugins | editor plugin tests | 保留 | Mermaid 由预览插件渲染，Prism 按纯文本处理其源码；覆盖中文与异常输入 |
| Renderer CSP | `src/renderer/index.html` | Electron smoke | 保留 | `data:` 仅在 `font-src`/`img-src` 按已知内嵌资源放行；脚本与连接仍只允许显式来源 |
| 图片、附件、图片协议 | attachment IPC + `mdimg://` | attachment/protocol tests | 保留 | 外部文件附件 |
| HTML/PDF/DOCX/EPUB/LaTeX/发布 | export IPC/components | export tests | 保留 | 各平台打印 |
| 九套主题、字体、Typewriter、快捷键 | renderer settings/styles | theme/menu/shortcut tests | 保留；雾白/夜松已加入 | 小窗口、实际文字使用对比度、快捷键提示同源 |
| 质量检查与写作统计 | renderer panels/libs | diagnostics/stats tests | 保留 | 大工作区性能 |
| 安全边界 | preload narrow bridge、trusted paths | trusted-paths、IPC guard tests | 保留 | 打包启动验证 |
| 命令中心与面板插槽 | `app-command-registry`、MenuBar、CommandPalette、ContextDock | command registry、panel registry、ContextDock Testing Library tests | ContextDock 已由注册表驱动 | Sidebar/StatusBar 插槽、快捷键冲突与跨窗口焦点 |
| 低频能力作用域登记（图片/发布/导出/历史/另存为/设置/统计/图谱/全文搜索） | `app/actions/commands/`、`useCommandRegistry`、`MenuBar` | `low-frequency-capabilities.test.ts`、`useCommandRegistry.test.ts`、`MenuBar/index.test.tsx`、`useAppActions.test.ts` | 已登记为命令；scope + 菜单灰显 + 快捷键/右键提示三处同源 | 三平台菜单实机冒烟、命令面板过滤与 toast 文案复核 |

## 基线命令

```bash
npm run typecheck
npm run test
npm run build
```
