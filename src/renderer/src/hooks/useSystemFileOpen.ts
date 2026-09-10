import { useEffect } from 'react'

/** Route OS association/open-file events through the normal document-tab path. */
export function useSystemFileOpen(
  openDocumentPath: (path: string, pinned?: boolean) => Promise<boolean>,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return
    const subscribe = window.desktopAPI?.window.onOpenFile
    if (!subscribe) return
    return subscribe((path) => {
      void openDocumentPath(path, true)
    })
  }, [enabled, openDocumentPath])
}
