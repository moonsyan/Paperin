# 兼容矩阵

> 2026-09-22 更新：表内“已有”表示当前代码和自动测试里有这条行为，不代表三平台、安装态、性能或用户验收已通过。端到端顺序见 [PRODUCT-WORKFLOW](PRODUCT-WORKFLOW.md)，未验证项见 [PROJECT-STATUS](PROJECT-STATUS.md)。

| 能力 | 当前实现边界 | 现有测试/依据 | 已有行为 | 后续验证 |
|---|---|---|---|---|
| 打开文件/目录/系统关联 | `src/main/window/system-file-open.ts`, `file-handlers.ts`, `workspace-handlers.ts` | 参数/分流单测、Windows Electron smoke、`system-file-open-and-close.md` | 开发态已固化 | Windows 安装包关联、macOS Finder 与 Linux MIME 验证 |
| 保存、另存为、重命名、移动、回收站删除 | Main IPC + save queue | file-io、save-lock、close-save；已有桌面文件保留对象并有 journal/backup 恢复协议；超时/会话切换不写旧快照；等锁期间写入授权消失则拒绝，不当成放行；冲突哈希不跟随链接，记下的基线是刚写出的字节 | 保留；P0 工程闭环 | Q01 故障注入、Q02 时序、进程终止与三平台文件身份验证 |
| 外部修改冲突 | expected mtime 与内容哈希 | document save tests；等长且保留 mtime 的替换会 `CONFLICT`；路径换成链接时拒绝保存 | 保留 | 外部编辑器冒烟 |
| UTF-8/GBK/编码损失 | `file-io.ts`、`text-decoding.ts` + iconv-lite | file-io / text-decoding tests；残缺 UTF-8（含 UTF-8-BOM）、奇数 UTF-16、孤立代理项拒绝宽松替换；合法 GBK/UTF-16/补充平面仍通过；读失败不改原文件字节 | 保留 | 中文路径与不可映射字符 |
| 多标签、dirty、关闭确认 | DocumentRecord store + TabBar | record store、TabBar、document-session、close-save；活动会话序号保护异步保存；关窗超时作废许可但等在途写入结束 | 已迁移；P0 首批回归 | 多窗口、IME、卸载和关闭时序冒烟 |
| 编辑器适配层 | Milkdown `EditorHandle` | adapter、快捷键与应用动作测试 | 已迁移 | 输入法与焦点人工验证 |
| 草稿恢复与会话持久化 | settings store + draft hooks | draft/session tests；settings 写锁不从仍存活的进程抢夺 | 保留 | 重启恢复 |
| 工作区文件树、最近文件、收藏 | workspace hooks/components | workspace tests、收藏行为测试 | 文件树、最近编辑、星标收藏/取消、右键入口和按工作区恢复已实现 | 跨库路径迁移、5000 文件 UI 性能 |
| 工作区壳层、当前文件来源与 dirty 上下文 | `WorkspaceShell` + `CurrentFileBanner` | 组件 Testing Library 契约测试 | 已迁移 | 多窗口、窄窗口与外部文件冒烟 |
| 保存状态文案 | 顶栏、路径条、状态栏共用 `document-save-status.ts` | 保存回执与状态组件测试 | 已有：已保存/未保存、示例、未命名、保存中、冲突、编码、失败 | 九主题与缩放人工看 |
| 工作区全文搜索 | `WorkspaceSearchDialog`、`workspace-search-handler`、`WorkspaceIndexService` 语料 | `workspace-search-coverage.test.ts`、`workspace-index-service.test.ts`（语料复用）、`useWorkspaceSearch.test.ts` | 已有：共享 `WorkspaceCoverage`；暖搜索优先 Main 内存语料（`getSearchSnapshot`），未缓存/超预算读盘 fallback；结构索引缓存不含正文 `lines` | 2026-09-22 P0-02 后本机搜索 P95 约 17 ms（暖语料）；watcher 稳定 P95 仍偶发超 5000 ms；60 题 Hit@5 未测 |
| 插入来源引用 | 搜索结果与反链；`source-citation.ts` | `source-citation`、`insert-citation` 测试 | 已有：片段快照、相对链接、标题锚点、切文档拒绝、回到打开搜索时的位置 | 用户任务耗时未测 |
| 来源健康 | `documentSourceBaselines` + `legacySourceSnapshots` + `evaluateSourceHealth` + `source-relocation` | `source-tracking`、`source-relocation`、`source-health`、QualityPanel、SourceRelocationDialog 测试 | 按引用文档独立基线；旧全局快照迁移为归属未知；复核只更新当前文章；显式重定位默认只更新当前文章基线，可选预览并更新普通 Markdown 链接 | mtime 一致不等于人工复核正文；移动/改名后真人重定位任务 **UNVERIFIED** |
| 重启后的搜索词与阅读位置 | 工作区设置 `lastSearchQuery` / `recentCitations`；文档视图状态 | `workspace-state` 测试 | 已有：缺字段默认为空，可清除且不删正文；选区与滚动随文档视图保存 | 真实重启、改名后回访未测 |
| 打开知识库检查 | `workspace-compatibility.ts`、开始页 | 对应单元测试 | 已有：未扫完、缺附件、断链、残缺脚注只提示 | 来源夹具 hash 与五分钟任务未测 |
| 写作模板 | 命令 `newTemplate:article`、`newTemplate:decision` | 命令注册表测试 | 已有：两份普通 Markdown，不覆盖已打开文件 | 用户无需讲解完成起步未测 |
| HTML/PDF/DOCX/EPUB/LaTeX/发布 | `hooks/exports/`、导出 IPC | `export-preflight`、`review-export` 测试；对话框目标真实路径在写出前复核 | 已有：Markdown、HTML、PDF、Word、Pandoc 导出前检查；说明见 `export-formats.md` | 各平台打开导出文件的人工检查 |
| 发布配置与交付报告 | `publish-profile`、`delivery-report`、`PublishDialog`、export bundle IPC | `publish-profile`、`delivery-report`、`export-handlers`、PublishDialog 测试 | 已有：最多 20 条配置；资源包含脱敏 JSON 报告，拒绝 `../`/空/超过 1 MiB | 接收方阅读报告与集合导出人工检查 |
| GFM、任务列表、表格、代码、公式、Mermaid、脚注、frontmatter | Milkdown plugins | editor plugin tests、`markdownPaste`、`structured-code`、`mermaid-source` | 保留 | 粘贴 Markdown 原文按标记排版；网页 HTML 用 DOMParser 转换，不执行脚本。JSON/YAML 可格式化、压成一行并按缩进折叠，折叠不改文件，复制导出去掉按钮。Mermaid 渲染前清理缩进、零宽字符和 init；主题 CSS 里的 `.error-icon` 不算失败。覆盖中文与异常输入 |
| 性能/兼容夹具 | `src/main/testing/fixtures/`、`shared/testing/r09-fixture-contract.ts` | `fixtures.test.ts`、`document-collection.test.ts`（多结构导出）、`summarizeStability` | 已有：普通、2 MiB±1、长段落/短节点/超长行/中文 emoji/混合语法 5 MiB；稳定性汇总函数 | 8 小时采样与第二台 16 GB 设备为 **UNVERIFIED** |
| 常见来源合成兼容夹具（P1-02） | `src/main/testing/fixtures/compatibility/` | `compatibility-fixtures.test.ts`、`scripts/smoke-electron.mjs --compatibility` | 已有：Typora/标准 MD、Obsidian 子集、Notion MD+CSV、思源、语雀各 ≥10 篇合成样本；Vitest 与 Electron 只读 smoke 均断言 Markdown/附件 hash 不变；路径限制在夹具根内；**不**等同真实用户导出兼容 | 真实导出版本矩阵、五分钟用户任务为 **UNVERIFIED** |
| Renderer CSP | `src/renderer/index.html` | Electron smoke | 保留 | `data:` 仅在 `font-src`/`img-src` 按已知内嵌资源放行；脚本与连接仍只允许显式来源 |
| 图片、附件、图片协议 | `image-file-handlers.ts`、attachment IPC + `mdimg://` | attachment/protocol tests；协议和导出内联都按普通文件句柄读取，图片目录钉住结果会跨重启保留；自定义 CSS 导入不跟随符号链接 | 保留 | 外部文件附件 |
| 标签、Wiki 链接、反向链接、图谱 | shared indexes + panels | tag/link/graph tests；`workspace-index-resources.test.ts`、`workspace-index-service.test.ts`（P0-07 目标失效） | 已有；引用者正文不变时附件/链接目标变化会重验 `resolvedPath`；反链可插入引用 | 大库往返与图谱规模仍按现有上限 |
| 九套主题、字体、Typewriter、快捷键 | renderer settings/styles | theme/menu/shortcut tests | 雾白/夜松已加入；提示由 `formatShortcutHint` 同源渲染 | 真机缩放、弱色文本实际对比度 |
| 质量检查与写作统计 | renderer panels/libs | diagnostics/stats tests | 已有诊断与本机统计；缺图/断链随索引 `resolvedPath` 更新（P0-07） | 大库性能 |
| 安全边界 | preload narrow bridge、trusted paths | trusted-paths、IPC guard tests | 保留 typed API 与真实路径校验 | 打包启动和故障矩阵 |
| 命令中心与面板插槽 | command registry、MenuBar、CommandPalette、ContextDock | registry / Testing Library tests | ContextDock 由注册表驱动 | 插槽、快捷键冲突与跨窗口焦点 |
| 低频能力作用域登记 | `app/actions/commands/`、`useCommandRegistry` | low-frequency-capabilities、菜单及应用动作测试 | scope、菜单灰显与快捷键/右键提示同源 | 三平台菜单实机冒烟 |

### 工作区扫描预算（文件数和深度的口径不同）

| 场景 | 文件树 UI | 全文搜索 | 后台索引 |
|---|---|---|---|
| Markdown 文件数 | 最多展示 **2000 节点**（含目录节点） | 最多扫描 **5000** 篇 `.md` | 最多索引 **5000** 篇 |
| 目录深度 | **5** 层（超出标记 `truncated`） | 同左 | 无深度上限（仅文件数） |
| 单文件大小 | 打开/编辑不受此限 | 超过 **2 MiB** 跳过并计 `file-size` | 超过 **2 MiB** 跳过并计 `file-size` |
| 命中/结果 | — | 最多 **200** 条匹配（`matchCapped`） | — |

总文件数未知时不展示百分比；跳过计数仅本地诊断，不进遥测。

### 待实施的正确性与兼容门禁

| 任务 | 未完成的边界 | 验收重点 |
| --- | --- | --- |
| ~~P0-02~~ | Main 搜索语料总预算 | **已落地（2026-09-22）**：64/128 MiB 预算、语料复用与 fallback |
| P1-06/07 | 来源生命周期和逐篇关系 | 切库/清除/卸载旧回包不登记；A/B 文章基线不互相覆盖；旧记录归属未知 |
| ~~P1-08~~ | 索引释放与缓存 DTO | **已落地（2026-09-22）**：生命周期 epoch、有界读取、schema/根校验、损坏回退重建 |
| ~~P1-02~~ / P2-03 | 来源工具与接收方软件矩阵 | **P1-02 合成夹具与 hash 门禁已落地**；真实导出与接收方阅读器检查仍 **UNVERIFIED** |

以上是计划，不改变当前 schema 或声明新增支持。详细任务见[实施计划](superpowers/plans/2026-09-22-product-workflow-implementation.md)。

## 基线命令

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run smoke
```

涉及性能、UI、发行或安装的变更还必须按 [2026-09-22 实施计划](superpowers/plans/2026-09-22-product-workflow-implementation.md)运行对应专项门禁，以上命令不能替代性能和安装证据。
