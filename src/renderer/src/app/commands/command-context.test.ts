import { describe, expect, it } from 'vitest'
import { createCommandContext, isCommandAvailable } from './command-context'

describe('command context', () => {
  it('normalizes missing document and workspace values for app-level commands', () => {
    expect(createCommandContext({})).toEqual({
      activeFileId: '',
      workspaceId: '',
      hasWorkspace: false,
      hasUnsavedChanges: false,
      source: 'app',
    })
  })

  it('derives the most specific scope from the active workspace state', () => {
    expect(createCommandContext({ workspaceId: 'ws' }).source).toBe('workspace')
    expect(createCommandContext({ workspaceId: 'ws', activeFileId: 'file' }).source).toBe('document')
  })

  it('uses explicit availability guards without requiring a command implementation', () => {
    const context = createCommandContext({ activeFileId: 'file', workspaceId: 'ws' })
    expect(isCommandAvailable(context, { requires: 'document' })).toBe(true)
    expect(isCommandAvailable(createCommandContext({ workspaceId: 'ws' }), { requires: 'document' })).toBe(false)
    expect(isCommandAvailable(createCommandContext({}), { requires: 'app' })).toBe(true)
  })

  it('allows document-scoped actions for an external file without a workspace', () => {
    const externalDocument = createCommandContext({ activeFileId: 'external-file' })
    expect(externalDocument.source).toBe('document')
    expect(isCommandAvailable(externalDocument, { requires: 'document' })).toBe(true)
  })
})
