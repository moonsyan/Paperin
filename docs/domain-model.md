# 文档会话与工作区领域模型

核对日期：2026-09-22。以下记录当前实现；末节明确区分待实施迁移。行为入口见[文档标签生命周期](document-tab-lifecycle.md)。

## 当前正文与保存模型

`DocumentRecord` in `src/renderer/src/app/document-session/document-record.ts` is the renderer's tab snapshot. Its `content` mirrors the live editor, while `savedContent` is the last confirmed disk baseline. Each record also keeps the `DocumentFileVersion` facts from the last successful read or save (`modifiedTime` / `contentSha256`); saves must send that version, not a process-global baseline another window updated. The editor remains the sole mutable body state.

`useDocumentState` keeps one `Record<id, DocumentRecord>` React store. The legacy `contents`, `savedMap`, `fileMtime`, `contentHashMap`, and `encodingMap` shapes are derived compatibility projections for the surrounding hooks; they are no longer independent state containers. Save acknowledgements update `savedContent` and the confirmed file version even when newer edits keep the record dirty.

For large-document saves, the request captures its target document ID and active session sequence, then waits for the editor's pending input to settle into that document's session snapshot. A timeout or a target-session change does not acknowledge or write the cached text: the document remains dirty and a close request is rejected. A disk acknowledgement only advances `savedContent` for the exact submitted snapshot; later input remains dirty. Late receipts may only confirm the version that was actually written.

Manual Save As follows the same session-identity rule. Its native-dialog result can replace a tab's file identity only when the initiating document path, active session and editor instance are still current; a late result may leave a file on disk but never retarget a newer tab or update an unmounted renderer.

A successful ordinary save acknowledges only its submitted snapshot. If the active editor receives later input before that acknowledgement is applied, including input still pending its session snapshot, the record remains dirty until a later save confirms that input.

The acknowledgement also belongs to the submitted file path. If that tab is renamed or moved while its save is in flight, the old-path result cannot advance the new-path `savedContent`, mtime, content hash, or saved state.

Workspace navigation is not document body. `WorkspaceSettingsState.editor` stores `lastSearchQuery`, up to eight `recentCitations`, per-document `documentSourceBaselines` (`citingDocumentPath` + `sourcePath` + `modifiedTime`), up to 50 `legacySourceSnapshots` from migrated global records (unknown ownership), and up to 20 `publishProfiles` (name, template options, and scope; no document body). Absolute paths, `..` segments, and unknown fields are dropped. Old `sourceSnapshots` migrate to `legacySourceSnapshots` only; they are not copied onto articles. Clearing navigation (search/recent) does not delete source relations or Markdown. Per-file selection and scroll live in `WorkspaceDocumentsState`, restored by `useWorkspaceDocumentView` for files inside the workspace only.


Closing has the same version rule for every document size. `useDocumentCloseSaving` captures the file path, active session sequence and editor instance before it starts, then verifies them again after each asynchronous operation. A close can proceed only when the latest `content` still equals the confirmed saved baseline and the active editor has no pending input. Window close repeats this check after void flushing and workspace-view persistence, so a late edit or newly opened tab cannot inherit an earlier close approval.

Shared `DocumentRef` identifies workspace and external files. IDs remain stable across path migration; source and workspace identity are preserved. Supported encodings are UTF-8, UTF-8 BOM, UTF-16LE, UTF-16BE, and GBK. Shared `DocumentFileVersion` (`src/shared/document-version.ts`) is the cross-process version fact; Main conflict judgment lives in `document-version-check.ts` and compares the request's `expectedContentHash` to current regular-file bytes under lock—never a 500ms mtime tolerance or another window's global cache.

这里的稳定 id 指 Shared `migrateDocumentRef` 的契约，不能等同于所有 Renderer 标签都使用不可变 id；当前文件标签仍存在 `file-<path>` 与迁移映射。新增来源归属必须与真实标签生命周期对齐。

## 当前持久化 schema

Main `WorkspaceStateStore` 是工作区状态文件的读写出口；Renderer 使用 typed API。知识库内 `.paperin` 属于私有元数据，不保存第二份可编辑正文。

| 模型 | 当前版本/内容 | 限制 |
| --- | --- | --- |
| `WorkspaceSettingsState` | schema 1；主题、附件目录、查询、最近引用、按文档来源基线、legacy 快照、发布配置 | 最近引用 8 条；来源基线按文档/总量配额（见 `source-tracking.ts`）；legacy 50 条；发布配置 20 条 |
| `WorkspaceLayoutState` | 接受 schema 1/2；标签、活动项、侧栏、ContextDock | 标签最多 200、折叠目录最多 2000 |
| `WorkspaceDocumentsState` | schema 1；库内文档选区、滚动与更新时间 | 最多 500 篇；未命名/外部文件不进入该表 |

应用全局设置、草稿、版本历史、索引缓存位于应用私有数据目录，详见[隐私说明](../PRIVACY.md)。清除导航只清除查询与最近引用；删除来源关系为单独动作，不删除 Markdown。

## 来源与索引的待实施边界

`documentSourceBaselines` 按引用文档维护来源 mtime；`legacySourceSnapshots` 为旧全局快照，归属未知。质量面板对当前文章评估基线，并提供「复核当前文章」（只更新该文基线；mtime 一致不等于人工复核正文）。`evaluateSourceHealth` 仍只依据 mtime 派生 current/changed/missing/unverified。

| 任务 | 目标契约 | 迁移要求 |
| --- | --- | --- |
| P1-06 | 请求绑定工作区 epoch/记录版本，切库/清除/卸载使旧回包失效 | 两个入口仅凭实际插入成功登记；失败不回滚正文 |
| P1-07 | 每篇引用文档独立来源基线与明确复核 | **已落地**：旧 `sourceSnapshots` → `legacySourceSnapshots`；未保存 citing 键不落盘 |
| P0-07 | 正文解析与引用目标存在性分别失效 | 不改正文也反映目标变化；不原地修改已发布索引 |
| P0-02 | Main-only 有界搜索语料 | 结构索引可缓存，正文语料不落盘；驱逐后安全回退并保留 coverage |
| ~~P1-08~~ | 队列、订阅、cache writer 共用生命周期约束 | **已落地（2026-09-22）**：`lifecycleEpoch`、有界读取、schema/根校验、损坏重建 |

P1-07 已在 Shared DTO、Main store 与 Renderer 质量面板落地；P1-08 已在 Main 索引释放与磁盘缓存边界落地；P1-06/P0-07 等待实施计划中的其余条目。未来 schema 不能被旧代码静默覆写。详细文件与验收见[实施计划](superpowers/plans/2026-09-22-product-workflow-implementation.md)。
