# Document Session Domain

`DocumentRecord` in `src/renderer/src/app/document-session/document-record.ts` is the renderer's tab snapshot. Its `content` mirrors the live editor, while `savedContent` is the last confirmed disk baseline. Each record also keeps the `DocumentFileVersion` facts from the last successful read or save (`modifiedTime` / `contentSha256`); saves must send that version, not a process-global baseline another window updated. The editor remains the sole mutable body state.

`useDocumentState` keeps one `Record<id, DocumentRecord>` React store. The legacy `contents`, `savedMap`, `fileMtime`, `contentHashMap`, and `encodingMap` shapes are derived compatibility projections for the surrounding hooks; they are no longer independent state containers. Save acknowledgements update `savedContent` and the confirmed file version even when newer edits keep the record dirty.

For large-document saves, the request captures its target document ID and active session sequence, then waits for the editor's pending input to settle into that document's session snapshot. A timeout or a target-session change does not acknowledge or write the cached text: the document remains dirty and a close request is rejected. A disk acknowledgement only advances `savedContent` for the exact submitted snapshot; later input remains dirty. Late receipts may only confirm the version that was actually written.

Manual Save As follows the same session-identity rule. Its native-dialog result can replace a tab's file identity only when the initiating document path, active session and editor instance are still current; a late result may leave a file on disk but never retarget a newer tab or update an unmounted renderer.

A successful ordinary save acknowledges only its submitted snapshot. If the active editor receives later input before that acknowledgement is applied, including input still pending its session snapshot, the record remains dirty until a later save confirms that input.

The acknowledgement also belongs to the submitted file path. If that tab is renamed or moved while its save is in flight, the old-path result cannot advance the new-path `savedContent`, mtime, content hash, or saved state.

Workspace navigation is not document body. `WorkspaceSettingsState.editor` stores `lastSearchQuery`, up to eight `recentCitations`, up to 50 `sourceSnapshots` (`path` + `modifiedTime` only), and up to 20 `publishProfiles` (name, template options, and scope; no document body). Absolute paths, `..` segments, and unknown fields are dropped. Old settings without these arrays parse to empty lists. Clearing search text, citations, and snapshots does not delete Markdown. Per-file selection and scroll live in `WorkspaceDocumentsState`, restored by `useWorkspaceDocumentView` for files inside the workspace only.


Closing has the same version rule for every document size. `useDocumentCloseSaving` captures the file path, active session sequence and editor instance before it starts, then verifies them again after each asynchronous operation. A close can proceed only when the latest `content` still equals the confirmed saved baseline and the active editor has no pending input. Window close repeats this check after void flushing and workspace-view persistence, so a late edit or newly opened tab cannot inherit an earlier close approval.

Shared `DocumentRef` identifies workspace and external files. IDs remain stable across path migration; source and workspace identity are preserved. Supported encodings are UTF-8, UTF-8 BOM, UTF-16LE, UTF-16BE, and GBK. Shared `DocumentFileVersion` (`src/shared/document-version.ts`) is the cross-process version fact; Main conflict judgment lives in `document-version-check.ts` and compares the request's `expectedContentHash` to current regular-file bytes under lock—never a 500ms mtime tolerance or another window's global cache.
