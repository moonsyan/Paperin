import type { CmdKey } from '@milkdown/kit/core'
import type { ReactNode } from 'react'
import type { EditorAdapter } from './adapter/editor-adapter'
import type { EditorViewState } from './content/editor-view-state'
import type { WikiSuggestion } from './overlays/WikiAutocomplete'
import type { EditorImageHints } from './useImageInsertion'

/**
 * App-facing editor facade. The shared document lifecycle consumes the narrow
 * EditorAdapter surface; view/export features use the additional methods below.
 */
export interface EditorHandle extends EditorAdapter {
  replaceContent: (markdown: string, onComplete?: () => void) => void
  updateContentPreservingHistory: (markdown: string) => void
  getViewState: () => EditorViewState | null
  restoreViewState: (state: EditorViewState) => void
  insertMd: (markdown: string) => void
  runMilkdownCommand: <T>(key: CmdKey<T>, payload?: T) => boolean
  getHtml: () => string
  getHeadings: () => { level: number; text: string }[]
  getPreviewHtml: () => string
  focusEnd: () => void
  focusLine: (line: number) => void
  isReady: () => boolean
  consumeDirtyChange: () => boolean
  /** 非破坏读取：防抖窗口内是否有输入尚未落账（保存路径用它决定是否等待快照） */
  hasPendingChanges: () => boolean
  startSearch: (
    query: string,
    useRegex: boolean,
    caseSensitive: boolean,
    wholeWord?: boolean,
  ) => { count: number; current: number }
  searchNext: (backwards: boolean) => number
  replaceCurrent: (replacement: string) => { count: number; current: number }
  replaceAllMatches: (replacement: string) => number
  endSearch: () => void
  ensureRichContent: () => Promise<void>
  restoreExportViewport: () => void
}

export interface EditorProps {
  initialContent: string
  onChange: (markdown: string) => void
  imageHints?: EditorImageHints
  onCursorChange?: (
    line: number,
    col: number,
    heading: string,
    headingIndex: number,
    selectedChars: number,
  ) => void
  onRichRender?: () => void
  blankClickToEnd?: boolean
  codeLineNumbers?: boolean
  /** 正文编辑根是否启用拼写检查（默认 false；代码块仍排除） */
  spellcheck?: boolean
  onNotify?: (message: string) => void
  wikiLinkFiles?: WikiSuggestion[]
  onWikiLinkClick?: (target: string) => void
  /** Wiki 链接目标解析判定（未解析的链接显示虚线暗色样式）；不传则不标记 */
  wikiResolveTest?: (target: string) => boolean
  frontmatterPanel?: ReactNode
  onFullscreenChange?: (open: boolean) => void
}
