import type { DocumentFileVersion } from './document-version'

export type DocumentSource = 'workspace' | 'external'
export type DocumentEncoding = 'UTF-8' | 'UTF-8-BOM' | 'UTF-16LE' | 'UTF-16BE' | 'GBK'

export interface DocumentRef {
  id: string
  path: string
  workspaceId?: string
  source: DocumentSource
  title: string
}

export interface DocumentSession {
  ref: DocumentRef
  content: string
  savedContent: string
  dirty: boolean
  encoding: DocumentEncoding
  expectedMtime?: number
  /** 本会话读取/最后确认的内容哈希；保存必须携带，不能用全局最新 hash 代替 */
  expectedContentHash?: string
}

export const createDocumentRef = (input: Omit<DocumentRef, 'title'> & { title?: string }): DocumentRef => ({
  ...input,
  title: input.title ?? input.path.split(/[\\/]/).pop() ?? input.path,
})

export const createDocumentSession = (
  ref: DocumentRef,
  content: string,
  options: {
    encoding?: DocumentEncoding
    expectedMtime?: number
    expectedContentHash?: string
    fileVersion?: DocumentFileVersion
  } = {},
): DocumentSession => ({
  ref,
  content,
  savedContent: content,
  dirty: false,
  encoding: options.encoding ?? 'UTF-8',
  expectedMtime: options.fileVersion?.modifiedTime ?? options.expectedMtime,
  expectedContentHash: options.fileVersion?.contentSha256 ?? options.expectedContentHash,
})

export const updateDocumentSession = (
  session: DocumentSession,
  content: string,
): DocumentSession => ({
  ...session,
  content,
  dirty: content !== session.savedContent,
})

export const markDocumentSessionSaved = (
  session: DocumentSession,
  content: string,
  expectedMtime?: number,
  encoding: DocumentEncoding = session.encoding,
  expectedContentHash?: string,
): DocumentSession => ({
  ...session,
  // A save acknowledges the submitted snapshot. Preserve newer edits.
  content: session.content === content ? content : session.content,
  savedContent: content,
  dirty: session.content !== content,
  expectedMtime,
  expectedContentHash: expectedContentHash ?? session.expectedContentHash,
  encoding,
})

export const migrateDocumentRef = (
  session: DocumentSession,
  path: string,
  title?: string,
): DocumentSession => ({
  ...session,
  ref: {
    ...session.ref,
    path,
    title: title ?? path.split(/[\\/]/).pop() ?? path,
  },
})

export const isExternalDocument = (ref: DocumentRef): boolean => ref.source === 'external'
