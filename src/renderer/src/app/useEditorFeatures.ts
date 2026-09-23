import { useMemo, useCallback } from 'react'
import type { RefObject } from 'react'
import type { EditorHandle } from '../components/Editor'
import { inspectChineseTypography, applyTypographyFixes } from '../lib/chinese-typography'
import type { TypographyIssue } from '../lib/chinese-typography'
import {
  getFrontmatterPropertyKeys,
  isValidFrontmatterPropertyKey,
  parseFrontmatterYaml,
  setFrontmatterProperty,
  deleteFrontmatterProperty,
  extractFrontmatterRaw,
} from '../lib/frontmatter-parser'
import { resolveWikiTarget, collectMdFiles } from '../lib/wiki-resolver'
import { listDemoWikiLinkFiles, resolveDemoWikiTarget } from '../lib/demo-wiki'
import { DEMO_FILES } from '../data/demo-files'
import type { WorkspaceInfo } from '../components/Sidebar'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseEditorFeaturesOptions {
  editorRef: RefObject<EditorHandle>
  editorAreaRef: RefObject<HTMLDivElement>
  activeFileId: string
  activeContent: string
  /** 延后值，避免逐键全量重扫 */
  deferredContent: string
  activeFilePath: string | undefined
  workspace: WorkspaceInfo | null
  liveContentOf: (id: string) => string
  replaceEditorContent: (id: string, content: string, mode?: 'ignore' | 'initialize' | 'update') => void
  setToast: (message: string) => void
  handleSelectWorkspaceFile: (path: string, pinned?: boolean) => Promise<boolean>
  handleSelectDemoFile: (id: string, pinned?: boolean) => void
}

export interface UseEditorFeaturesResult {
  /** 中文排版检查结果 */
  typographyIssues: TypographyIssue[]
  handleOpenTypographyIssue: (issue: TypographyIssue) => void
  handleFixTypography: () => void
  /** Frontmatter 属性面板 */
  activeProperties: ReturnType<typeof parseFrontmatterYaml> | null
  handleUpdateProperty: (key: string, value: string) => void
  handleDeleteProperty: (key: string) => void
  handleAddProperty: (key: string, value: string) => void
  /** 大纲导航 */
  handleOutlineClick: (index: number) => void
  /** Wiki 链接 */
  wikiLinkFileList: Array<{ name: string; path: string }>
  handleWikiLinkClick: (target: string) => void
  wikiResolveTest: ((target: string) => boolean) | undefined
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * 编辑器增强功能：排版检查、Frontmatter 属性操作、大纲导航、Wiki 链接解析。
 *
 * 职责边界：
 * - 基于文档内容计算派生数据（排版问题、属性、wiki 候选）
 * - 提供操作回调（修复排版、编辑属性、跳转大纲、打开链接）
 * - 所有操作通过 editorRef 或 replaceEditorContent 间接修改文档
 *
 * 不包含：编辑器实例管理、内容同步、保存逻辑
 */
export function useEditorFeatures({
  editorRef,
  editorAreaRef,
  activeFileId,
  activeContent,
  deferredContent,
  activeFilePath,
  workspace,
  liveContentOf,
  replaceEditorContent,
  setToast,
  handleSelectWorkspaceFile,
  handleSelectDemoFile,
}: UseEditorFeaturesOptions): UseEditorFeaturesResult {
  // --- 中文排版检查 ---
  const typographyIssues = useMemo(
    () => inspectChineseTypography(deferredContent),
    [deferredContent],
  )

  const handleOpenTypographyIssue = useCallback((issue: TypographyIssue) => {
    editorRef.current?.focusLine(issue.line)
  }, [editorRef])

  const handleFixTypography = useCallback(() => {
    const editor = editorRef.current
    if (!editor?.isReady()) return
    const content = editor.getMarkdown()
    if (content == null) return
    const issues = inspectChineseTypography(content)
    if (issues.length === 0) {
      setToast('没有可修复的排版问题')
      return
    }
    const fixed = applyTypographyFixes(content, issues)
    if (fixed === content) {
      setToast('没有可自动修复的排版问题')
      return
    }
    editor.updateContentPreservingHistory(fixed)
    setToast(`已修复 ${issues.length} 处排版问题`)
  }, [editorRef, setToast])

  // --- Frontmatter 属性 ---
  const activeProperties = useMemo(() => {
    if (!activeFilePath || !activeContent) return null
    const extracted = extractFrontmatterRaw(activeContent)
    return extracted ? parseFrontmatterYaml(extracted.text) : null
  }, [activeContent, activeFilePath])

  const handleUpdateProperty = useCallback((key: string, value: string) => {
    replaceEditorContent(
      activeFileId,
      setFrontmatterProperty(liveContentOf(activeFileId), key, value),
      'update',
    )
  }, [activeFileId, liveContentOf, replaceEditorContent])

  const handleDeleteProperty = useCallback((key: string) => {
    replaceEditorContent(
      activeFileId,
      deleteFrontmatterProperty(liveContentOf(activeFileId), key),
      'update',
    )
  }, [activeFileId, liveContentOf, replaceEditorContent])

  const handleAddProperty = useCallback((key: string, value: string) => {
    if (!isValidFrontmatterPropertyKey(key)) {
      setToast('属性名只能包含字母、数字、下划线和连字符')
      return
    }
    const current = liveContentOf(activeFileId)
    const extracted = extractFrontmatterRaw(current)
    if (extracted && getFrontmatterPropertyKeys(extracted.text).includes(key)) {
      setToast(`属性"${key}"已存在；请编辑现有属性或正文 YAML`)
      return
    }
    replaceEditorContent(activeFileId, setFrontmatterProperty(current, key, value), 'update')
  }, [activeFileId, liveContentOf, replaceEditorContent, setToast])

  // --- 大纲导航 ---
  const handleOutlineClick = useCallback((index: number) => {
    const root = editorAreaRef.current
    if (!root) return
    const headings = Array.from(root.querySelectorAll('h1, h2, h3, h4')).filter(
      (element) => !element.closest('li'),
    )
    const target = headings[index] as HTMLElement | undefined
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    target.style.transition = 'background 300ms'
    target.style.background = 'var(--accent-bg)'
    setTimeout(() => { target.style.background = '' }, 800)
  }, [editorAreaRef])

  // --- Wiki 链接 ---
  const demoWikiFiles = useMemo(
    () => Object.values(DEMO_FILES).map((file) => ({ id: file.id, name: file.name })),
    [],
  )

  const wikiLinkFileList = useMemo(() => {
    if (workspace?.tree) {
      const files = collectMdFiles(workspace.tree)
      return files.map((path) => ({
        name: path.replace(/\\/g, '/').split('/').pop()?.replace(/\.(md|markdown)$/i, '') ?? '',
        path,
      }))
    }
    return listDemoWikiLinkFiles(demoWikiFiles)
  }, [demoWikiFiles, workspace?.tree])

  const wikiClickOpenRef = useCallback(
    (path: string) => { void handleSelectWorkspaceFile(path) },
    [handleSelectWorkspaceFile],
  )

  const handleWikiLinkClick = useCallback(
    (target: string) => {
      if (workspace?.tree) {
        const result = resolveWikiTarget(target, workspace.path, activeFilePath, workspace.tree)
        if (result.resolved) {
          wikiClickOpenRef(result.path)
          return
        }
        setToast(`无法找到链接的目标文件：${target}`)
        return
      }
      const demo = resolveDemoWikiTarget(target, demoWikiFiles)
      if (demo.resolved) {
        handleSelectDemoFile(demo.id)
        return
      }
      setToast(`无法找到链接的目标文件：${target}`)
    },
    [activeFilePath, demoWikiFiles, handleSelectDemoFile, setToast, wikiClickOpenRef, workspace],
  )

  const wikiResolveTest = useMemo(() => {
    if (workspace?.tree) {
      const tree = workspace.tree
      const rootPath = workspace.path
      return (target: string) => resolveWikiTarget(target, rootPath, activeFilePath, tree).resolved
    }
    return (target: string) => resolveDemoWikiTarget(target, demoWikiFiles).resolved
  }, [activeFilePath, demoWikiFiles, workspace])

  return {
    typographyIssues,
    handleOpenTypographyIssue,
    handleFixTypography,
    activeProperties,
    handleUpdateProperty,
    handleDeleteProperty,
    handleAddProperty,
    handleOutlineClick,
    wikiLinkFileList,
    handleWikiLinkClick,
    wikiResolveTest,
  }
}
