/**
 * Above this size a synchronous ProseMirror → Markdown serialization can block
 * the renderer for an unbounded amount of time on a real Electron DOM. Large
 * document changes are already debounced through the Milkdown listener into
 * contentsRef, so save/close paths should use that snapshot instead of starting
 * a second synchronous serialization.
 *
 * 单位口径：字符串长度 = UTF-16 code unit 数。BMP 内中文字符占 1 个 unit，
 * emoji 等增补平面字符占 2 个 unit（代理对）——阈值比较按 unit 计，
 * 中文文档的实际字节量约为该值的 3 倍（UTF-8）。
 */
export const LARGE_DOCUMENT_SNAPSHOT_CHARS = 1_000_000

export const shouldPreferCachedDocumentSnapshot = (content: string): boolean =>
  content.length > LARGE_DOCUMENT_SNAPSHOT_CHARS
