# 兼容矩阵

| 能力 | 旧实现 | 现有测试/依据 | 第一批状态 | 后续验证 |
|---|---|---|---|---|
| 打开文件/目录/系统关联 | `src/main/ipc/file-handlers.ts`, `workspace-handlers.ts` | IPC 与窗口测试 | 保留 | Electron 冒烟 |
| 保存、另存为、重命名、移动、回收站删除 | Main IPC + save queue | file-io、save-lock、close-save | 保留 | 冲突/权限手工验证 |
| 外部修改冲突 | expected mtime 保存协议 | document save tests | 保留 | 外部编辑器冒烟 |
| UTF-8/GBK/编码损失 | `file-io.ts` + iconv-lite | file-io tests | 保留 | 中文路径与不可映射字符 |
| 多标签、dirty、关闭确认 | document-session + TabBar | TabBar、document-session、close-save | 保留 | 多窗口冒烟 |
| 草稿恢复与会话持久化 | settings store + draft hooks | draft/session tests | 保留 | 重启恢复 |
| 工作区文件树、最近文件、收藏 | workspace hooks/components | workspace tests | 保留 | 5000 文件性能 |
| 全文搜索与当前文档查找替换 | search IPC + renderer search | search/keyboard tests | 保留 | 搜索结果定位 |
| 标签、Wiki 链接、反向链接、图谱 | shared indexes + panels | tag/link/graph tests | 保留 | 工作区往返 |
| GFM、任务列表、表格、代码、公式、Mermaid、脚注、frontmatter | Milkdown plugins | editor plugin tests | 保留 | 中文与异常输入 |
| 图片、附件、图片协议 | attachment IPC + `mdimg://` | attachment/protocol tests | 保留 | 外部文件附件 |
| HTML/PDF/DOCX/EPUB/LaTeX/发布 | export IPC/components | export tests | 保留 | 各平台打印 |
| 七套主题、字体、Typewriter、快捷键 | renderer settings/styles | theme/menu/shortcut tests | 保留 | 小窗口与对比度 |
| 质量检查与写作统计 | renderer panels/libs | diagnostics/stats tests | 保留 | 大工作区性能 |
| 安全边界 | preload narrow bridge、trusted paths | trusted-paths、IPC guard tests | 保留 | 打包启动验证 |

## 基线命令

```bash
npm run typecheck
npm run test
npm run build
```
