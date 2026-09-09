import type { CmdKey } from '@milkdown/kit/core'
import type { ReactNode } from 'react'
import type { WikiSuggestion } from './WikiAutocomplete'
import type { EditorImageHints } from './useImageInsertion'

export interface EditorHandle {
  replaceContent: (markdown: string, onComplete?: () => void) => void
  updateContentPreservingHistory: (markdown: string) => void
  getMarkdown: () => string | null
  getViewState: () => {
    selection: { anchor: number; head: number }
    scrollTop: number
  } | null
  restoreViewState: (state: {
    selection: { anchor: number; head: number }
    scrollTop: number
  }) => void
  insertMd: (markdown: string) => void
  runCommand: <T>(key: CmdKey<T>, payload?: T) => boolean
  getHtml: () => string
  getHeadings: () => { level: number; text: string }[]
  getPreviewHtml: () => string
  focus: () => void
  focusEnd: () => void
  focusLine: (line: number) => void
  isReady: () => boolean
  consumeDirtyChange: () => boolean
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
  onNotify?: (message: string) => void
  wikiLinkFiles?: WikiSuggestion[]
  onWikiLinkClick?: (target: string) => void
  /** Wiki 链接目标解析判定（未解析的链接显示虚线暗色样式）；不传则不标记 */
  wikiResolveTest?: (target: string) => boolean
  frontmatterPanel?: ReactNode
  onFullscreenChange?: (open: boolean) => void
}
