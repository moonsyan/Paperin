import type { OpenFile } from '../components/Sidebar'
import { DEMO_FILES, DEFAULT_FILE_ID } from '../data/demo-files'

/** 每套主题对应的标题栏覆盖层颜色（Windows 系统窗口按钮区域） */
export const TITLEBAR_COLORS: Record<string, { bg: string; symbol: string }> = {
  default: { bg: '#F0EDEA', symbol: '#5C5850' },
  dark: { bg: '#1A1918', symbol: '#A09B93' },
  ocean: { bg: '#E6ECF3', symbol: '#4A6070' },
  rose: { bg: '#F5EDED', symbol: '#6B4F4F' },
  github: { bg: '#161B22', symbol: '#8B949E' },
  atom: { bg: '#20242B', symbol: '#8E8E90' },
  typewriter: { bg: '#E4DCC8', symbol: '#595959' },
  mist: { bg: '#EEF1EC', symbol: '#667168' },
  pine: { bg: '#1A201C', symbol: '#B0BAB0' },
}

/** 初始只打开「欢迎」一篇样例文档；其余样例文件留在左侧文件夹树中点击打开，
 * 避免启动时一次性铺开一堆标签页（标签页只在编辑器区域呈现）。 */
export const INITIAL_FILES: OpenFile[] = [{ id: DEFAULT_FILE_ID, name: DEMO_FILES[DEFAULT_FILE_ID].name }]

/** 新窗口模式（#fresh）：跳过会话恢复与写入，避免多窗口间会话互相覆盖 */
export const FRESH_MODE =
  typeof window !== 'undefined' && window.location.hash.includes('fresh')

/** fresh 窗口携带的文件路径（#fresh?file=...）：启动后自动打开（右键"在新窗口打开"，U7） */
export const FRESH_FILE_PATH = ((): string | null => {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash
  if (!hash.includes('fresh')) return null
  const qs = hash.split('?')[1]
  if (!qs) return null
  return new URLSearchParams(qs).get('file')
})()

export const INITIAL_CONTENTS: Record<string, string> = Object.fromEntries(
  Object.values(DEMO_FILES).map((f) => [f.id, f.content]),
)

export const INITIAL_SAVED: Record<string, boolean> = Object.fromEntries(
  Object.values(DEMO_FILES).map((f) => [f.id, true]),
)

export const DEMO_FILE_IDS = new Set(Object.keys(DEMO_FILES))

/** 演示树折叠记录的作用域键（未打开工作区时的侧栏树） */
export const DEMO_TREE_SCOPE = '__demo__'

/** HTML 特殊字符转义（导出 HTML 的 title 来自文件名，可能含 & < >） */
export const escapeHtmlText = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * 3.1：大文档阈值（按字符数）。超过该规模的 Markdown 在切换/打开时，
 * 一次性解析 + 整篇 DOM 重建会阻塞主线程数百毫秒到数秒，导致“点了切文件却像卡死”。
 * 对这类文档把阻塞式替换推迟到下一轮事件循环，先让 React 提交标签切换。
 * 阈值偏保守（约 200KB），普通文档不受影响。
 */
const LARGE_DOC_CHAR_THRESHOLD = 200_000
export const isLargeDocument = (content: string): boolean =>
  content.length > LARGE_DOC_CHAR_THRESHOLD

/** 未命名文档自增计数：模块级状态（会话恢复会把计数推进到已恢复的最大编号） */
let untitledCounter = 1

/** 分配下一个未命名文档的 id 与显示名 */
export const nextUntitled = (): { id: string; name: string } => {
  const n = untitledCounter++
  return { id: `untitled-${n}`, name: `未命名 ${n}.md` }
}

/** 会话恢复的未命名标签可能占用较大编号：推进计数避免 Ctrl+N 创建重复 ID */
export const reserveUntitledCounter = (maxSeen: number) => {
  if (maxSeen >= untitledCounter) untitledCounter = maxSeen + 1
}
