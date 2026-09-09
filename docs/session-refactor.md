# Session Refactor Notes

The shared session model now uses the same five encoding values as `DocumentRecord`. Save acknowledgements update the saved baseline and mtime while preserving edits made after the save began, so late saves cannot discard newer editor content. Focused session tests cover dirty transitions, migration, encoding, and this in-flight save case.
