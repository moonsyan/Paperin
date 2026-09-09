/**
 * 窗口级拖拽打开 Markdown 文件的核心逻辑。
 *
 * 该模块为纯函数、不依赖 React / Electron，可直接进行单元测试。
 * 仅当拖拽数据包含 'Files' 类型时才视为来自操作系统的文件拖拽；
 * 应用内部拖拽（标签重排、侧栏移动）使用自定义数据，不会进入此分支。
 */

/** 拖拽文件的最小结构，便于脱离真实 DOM 进行单元测试 */
export interface DropFileLike {
  name: string
  /** Electron 下被拖入的 File 会暴露绝对路径，浏览器环境下可能为 undefined */
  path?: string
}

/**
 * 拖拽事件携带的最小化 DataTransfer 结构。
 * `files` 使用 ArrayLike 以同时兼容真实 DOM 的 `FileList`
 * 与测试中的普通数组替身（真实 `DataTransfer` 无法直接构造）。
 */
export interface MarkdownDropDataTransfer<T extends DropFileLike = DropFileLike> {
  types: readonly string[]
  files: ArrayLike<T>
}

const MARKDOWN_EXT_RE = /\.(md|markdown)$/i

/**
 * 从操作系统拖拽事件中筛选出 Markdown 文件对象。
 *
 * 路径授权不在渲染层判断：File 对象交给 `desktopAPI.document.readDropped`，
 * 由预加载层 webUtils 解析真实路径（伪造 File 解析为空被拒绝）。
 * 此处 `file.path` 仅用于过滤浏览器环境（无路径）的文件。
 *
 * @param dataTransfer 拖拽事件携带的 DataTransfer（或其最小结构）
 * @returns Markdown 文件对象数组；无匹配时返回空数组
 */
export function extractMarkdownFiles<
  T extends DropFileLike,
>(dataTransfer: MarkdownDropDataTransfer<T>): T[] {
  // 内部拖拽（标签重排 / 侧栏移动）不含 'Files' 类型，直接放行
  if (!dataTransfer.types.includes('Files')) {
    return []
  }
  const result: T[] = []
  for (let i = 0; i < dataTransfer.files.length; i++) {
    const file = dataTransfer.files[i]
    if (!file || !MARKDOWN_EXT_RE.test(file.name) || !file.path) {
      continue
    }
    result.push(file)
  }
  return result
}

/**
 * 从操作系统拖拽事件中筛选出需要打开的 Markdown 文件绝对路径。
 *
 * @param dataTransfer 拖拽事件携带的 DataTransfer（或其最小结构）
 * @returns Markdown 文件绝对路径数组；无匹配时返回空数组
 */
export function extractMarkdownPaths(
  dataTransfer: MarkdownDropDataTransfer,
): string[] {
  return extractMarkdownFiles(dataTransfer)
    .map((file) => file.path ?? '')
    .filter(Boolean)
}