# Document Session Domain

`DocumentRecord` in `src/renderer/src/app/document-session/document-record.ts` is the renderer's tab snapshot. Its `content` mirrors the live editor, while `savedContent` is the last confirmed disk baseline. The editor remains the sole mutable body state.

`useDocumentState` keeps one `Record<id, DocumentRecord>` React store. The legacy `contents`, `savedMap`, `fileMtime`, and `encodingMap` shapes are derived compatibility projections for the surrounding hooks; they are no longer independent state containers. Save acknowledgements update `savedContent` even when newer edits keep the record dirty.

Shared `DocumentRef` identifies workspace and external files. IDs remain stable across path migration; source and workspace identity are preserved. Supported encodings are UTF-8, UTF-8 BOM, UTF-16LE, UTF-16BE, and GBK.
