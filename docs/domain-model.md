# Document Session Domain

`DocumentRecord` in `src/renderer/src/app/document-session/document-record.ts` is the renderer's tab snapshot. Its `content` mirrors the live editor, while `savedContent` is the last confirmed disk baseline. The editor remains the sole mutable body state.

Shared `DocumentRef` identifies workspace and external files. IDs remain stable across path migration; source and workspace identity are preserved. Supported encodings are UTF-8, UTF-8 BOM, UTF-16LE, UTF-16BE, and GBK.
