# Session Refactor Notes

The shared session model now uses the same five encoding values as `DocumentRecord`. Save acknowledgements update the saved baseline and mtime while preserving edits made after the save began, so late saves cannot discard newer editor content. Focused session tests cover dirty transitions, migration, encoding, and this in-flight save case.

The mounted Milkdown editor now implements `EditorAdapter` directly. Document-facing consumers can read, replace, focus, run stable semantic commands, and subscribe to Markdown changes without importing Milkdown command keys. Subscriptions are cleared when the editor unmounts; specialized view, search, and export operations remain on the extended `EditorHandle` facade.
