import {
  markDocumentSessionSaved,
  migrateDocumentRef,
  updateDocumentSession,
  type DocumentEncoding,
  type DocumentSession,
} from '../../../../shared/document-session'

export interface DocumentSessionController {
  get(): DocumentSession
  update(content: string): DocumentSession
  markSaved(content: string, expectedMtime?: number, encoding?: DocumentEncoding): DocumentSession
  migrate(path: string, title?: string): DocumentSession
}

/**
 * Keeps document session transitions in one small, side-effect-free boundary.
 * File I/O, debounce and React lifecycle remain owned by their existing layers.
 */
export const createDocumentSessionController = (
  initial: DocumentSession,
): DocumentSessionController => {
  let current = initial
  return {
    get: () => current,
    update: (content) => {
      current = updateDocumentSession(current, content)
      return current
    },
    markSaved: (content, expectedMtime, encoding) => {
      current = markDocumentSessionSaved(current, content, expectedMtime, encoding)
      return current
    },
    migrate: (path, title) => {
      current = migrateDocumentRef(current, path, title)
      return current
    },
  }
}
