import { relativeMarkdownHref } from './source-citation'
import type { IndexedDocument, WorkspaceIndex } from '../../../shared/workspace-index'
import { workspaceRelativePathsEqual } from '../../../shared/source-tracking'
import {
  normalizeWorkspaceRelativePath,
  relocateCitingDocumentSourceBaseline,
  type WorkspaceSettingsState,
} from '../../../shared/workspace-state'
import type { SourceRegistrationTicket } from './remember-source-snapshot'
import { sourceRegistrationTicketMatches } from './remember-source-snapshot'

export interface SourceRelocationChoice {
  previousPath: string
  selectedPath: string
  selectedModifiedTime: number
  updateMarkdownLink: boolean
}

/** 打开重定位流程时绑定的引用文档与工作区生命周期票据。 */
export interface SourceRelocationBinding {
  citingDocumentKey: string
  ticket: SourceRegistrationTicket
}

export interface SourceRelocationCandidate {
  relativePath: string
  modifiedTime: number
}

export interface MarkdownLinkReplacementPreview {
  before: string
  after: string
  start: number
  end: number
}

const TARGET_BODY = '(?:[^()\\r\\n]|\\([^()\\r\\n]*\\))*'
const PLAIN_LINK_RE = new RegExp(`\\[[^\\]]*\\]\\(\\s*(${TARGET_BODY})\\s*\\)`, 'g')

const linkDestination = (raw: string): string => {
  const trimmed = raw.trim()
  const title = /(?:^|\s+)(?:"[^"]*"|'[^']*'|\([^()]*\))\s*$/.exec(trimmed)
  return trimmed.slice(0, title ? title.index : trimmed.length).trim().replace(/^<|>$/g, '')
}

const basenameOfRelativePath = (relativePath: string): string => {
  const slash = relativePath.replace(/\\/g, '/')
  return slash.split('/').pop() ?? slash
}

const documentByRelativePath = (index: WorkspaceIndex): Map<string, IndexedDocument> => {
  const byRelative = new Map<string, IndexedDocument>()
  for (const document of Object.values(index.documents)) {
    const relative = normalizeWorkspaceRelativePath(document.relativePath.replace(/\\/g, '/'))
    if (relative && !byRelative.has(relative)) byRelative.set(relative, document)
  }
  return byRelative
}

/** 索引中与 previousPath 同文件名的全部候选（不含 previous 自身）。 */
export const listSameBasenameRelocationCandidates = (
  index: WorkspaceIndex | null,
  previousPath: string,
): SourceRelocationCandidate[] => {
  if (!index) return []
  const normalizedPrevious = normalizeWorkspaceRelativePath(previousPath.replace(/\\/g, '/'))
  if (!normalizedPrevious) return []
  const targetName = basenameOfRelativePath(normalizedPrevious).toLocaleLowerCase()
  const byRelative = documentByRelativePath(index)
  const candidates: SourceRelocationCandidate[] = []
  for (const [relativePath, document] of Array.from(byRelative.entries())) {
    if (basenameOfRelativePath(relativePath).toLocaleLowerCase() !== targetName) continue
    if (relativePath === normalizedPrevious) continue
    candidates.push({ relativePath, modifiedTime: document.modifiedTime })
  }
  return candidates.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
}

export const requiresExplicitCandidateSelection = (
  candidates: readonly SourceRelocationCandidate[],
): boolean => candidates.length > 1

export const resolveRelocationCandidate = (
  candidates: readonly SourceRelocationCandidate[],
  selectedPath: string | null,
  caseInsensitive: boolean,
):
  | { ok: true; candidate: SourceRelocationCandidate }
  | { ok: false; reason: 'needs-selection' | 'not-found' } => {
  if (candidates.length === 0) {
    return selectedPath
      ? { ok: false, reason: 'not-found' }
      : { ok: false, reason: 'needs-selection' }
  }
  if (candidates.length === 1) {
    return { ok: true, candidate: candidates[0] }
  }
  if (!selectedPath) return { ok: false, reason: 'needs-selection' }
  const match = candidates.find((item) =>
    workspaceRelativePathsEqual(item.relativePath, selectedPath, caseInsensitive),
  )
  return match ? { ok: true, candidate: match } : { ok: false, reason: 'not-found' }
}

export const sourceRelocationBindingMatches = (
  binding: SourceRelocationBinding,
  current: SourceRelocationBinding,
): boolean =>
  binding.citingDocumentKey === current.citingDocumentKey &&
  sourceRegistrationTicketMatches(binding.ticket, current.ticket)

const resolveHrefToWorkspaceRelative = (
  citingDocumentPath: string,
  rawHref: string,
): string | null => {
  const href = linkDestination(rawHref)
  if (!href || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(href) || href.startsWith('data:')) return null
  const citingSlash = citingDocumentPath.replace(/\\/g, '/')
  const citingDir = citingSlash.includes('/')
    ? citingSlash.slice(0, citingSlash.lastIndexOf('/'))
    : ''
  const joined = href.replace(/\\/g, '/').startsWith('/')
    ? href.replace(/\\/g, '/').replace(/^\/+/, '')
    : citingDir
      ? `${citingDir}/${href.replace(/\\/g, '/')}`
      : href.replace(/\\/g, '/')
  const segments = joined.split('/')
  const resolved: string[] = []
  for (const segment of segments) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (resolved.length > 0) resolved.pop()
      continue
    }
    resolved.push(segment)
  }
  return normalizeWorkspaceRelativePath(resolved.join('/'))
}

const maskNonLinkRegions = (markdown: string): string => {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  let inFence = false
  return lines
    .map((line) => {
      const trimmed = line.trimStart()
      if (trimmed.startsWith('```')) {
        inFence = !inFence
        return '\u0000'.repeat(line.length)
      }
      if (inFence) return '\u0000'.repeat(line.length)
      return line.replace(/`[^`]*`/g, (segment) => '\u0000'.repeat(segment.length))
    })
    .join('\n')
}

/** 只处理普通 Markdown 链接（非图片、非 Wiki），指向 previousPath 的链接触发替换预览。 */
export const planPlainMarkdownLinkUpdates = (
  markdown: string,
  citingDocumentPath: string,
  previousPath: string,
  selectedPath: string,
  caseInsensitive: boolean,
): MarkdownLinkReplacementPreview[] => {
  const masked = maskNonLinkRegions(markdown)
  const replacements: MarkdownLinkReplacementPreview[] = []
  PLAIN_LINK_RE.lastIndex = 0
  for (;;) {
    const match = PLAIN_LINK_RE.exec(masked)
    if (!match) break
    const full = match[0]
    const rawTarget = match[1] ?? ''
    if (full.startsWith('![')) continue
    const resolved = resolveHrefToWorkspaceRelative(citingDocumentPath, rawTarget)
    if (!resolved || !workspaceRelativePathsEqual(resolved, previousPath, caseInsensitive)) continue
    const anchorIndex = rawTarget.indexOf('#')
    const anchor = anchorIndex >= 0 ? rawTarget.slice(anchorIndex) : ''
    const afterHref = `${relativeMarkdownHref(citingDocumentPath, selectedPath)}${anchor}`
    const beforeTarget = rawTarget.trim()
    const afterTarget = afterHref
    const openParen = full.lastIndexOf('(')
    const before = `${full.slice(0, openParen + 1)}${beforeTarget})`
    const after = `${full.slice(0, openParen + 1)}${afterTarget})`
    replacements.push({
      before,
      after,
      start: match.index,
      end: match.index + full.length,
    })
  }
  PLAIN_LINK_RE.lastIndex = 0
  return replacements
}

export const applyPlainMarkdownLinkUpdates = (
  markdown: string,
  replacements: readonly MarkdownLinkReplacementPreview[],
): string => {
  if (replacements.length === 0) return markdown
  const ordered = [...replacements].sort((left, right) => right.start - left.start)
  let out = markdown
  for (const item of ordered) {
    out = out.slice(0, item.start) + item.after + out.slice(item.end)
  }
  return out
}

export const applySourceRelocationToSettings = (
  settings: WorkspaceSettingsState,
  binding: SourceRelocationBinding,
  currentBinding: SourceRelocationBinding,
  choice: SourceRelocationChoice,
  caseInsensitive: boolean,
): WorkspaceSettingsState | null => {
  if (!sourceRelocationBindingMatches(binding, currentBinding)) return null
  const previousPath = normalizeWorkspaceRelativePath(choice.previousPath.replace(/\\/g, '/'))
  const selectedPath = normalizeWorkspaceRelativePath(choice.selectedPath.replace(/\\/g, '/'))
  if (!previousPath || !selectedPath) return null
  return {
    ...settings,
    editor: {
      ...settings.editor,
      documentSourceBaselines: relocateCitingDocumentSourceBaseline(
        settings.editor.documentSourceBaselines,
        binding.citingDocumentKey,
        previousPath,
        selectedPath,
        choice.selectedModifiedTime,
        caseInsensitive,
      ),
    },
  }
}
