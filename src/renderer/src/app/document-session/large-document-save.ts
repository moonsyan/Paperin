/**
 * Above this size a synchronous ProseMirror → Markdown serialization can block
 * the renderer for an unbounded amount of time on a real Electron DOM. Large
 * document changes are already debounced through the Milkdown listener into
 * contentsRef, so save/close paths should use that snapshot instead of starting
 * a second synchronous serialization.
 */
export const LARGE_DOCUMENT_SNAPSHOT_THRESHOLD = 1_000_000

export const shouldPreferCachedDocumentSnapshot = (content: string): boolean =>
  content.length > LARGE_DOCUMENT_SNAPSHOT_THRESHOLD
