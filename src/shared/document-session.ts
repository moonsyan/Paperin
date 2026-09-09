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
}

export const createDocumentRef = (input: Omit<DocumentRef, 'title'> & { title?: string }): DocumentRef => ({
  ...input,
  title: input.title ?? input.path.split(/[\\/]/).pop() ?? input.path,
})

export const createDocumentSession = (
  ref: DocumentRef,
  content: string,
  options: { encoding?: DocumentEncoding; expectedMtime?: number } = {},
): DocumentSession => ({
  ref,
  content,
  savedContent: content,
  dirty: false,
  encoding: options.encoding ?? 'UTF-8',
  expectedMtime: options.expectedMtime,
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
): DocumentSession => ({
  ...session,
  // A save acknowledges the submitted snapshot. Preserve newer edits.
  content: session.content === content ? content : session.content,
  savedContent: content,
  dirty: session.content !== content,
  expectedMtime,
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
