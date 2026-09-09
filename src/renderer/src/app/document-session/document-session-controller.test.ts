import { describe, expect, it } from 'vitest'
import { createDocumentRef, createDocumentSession } from '../../../../shared/document-session'
import { createDocumentSessionController } from './document-session-controller'

describe('document session controller', () => {
  it('serializes edit, save and path migration transitions', () => {
    const controller = createDocumentSessionController(
      createDocumentSession(createDocumentRef({
        id: 'doc',
        path: 'notes/a.md',
        source: 'workspace',
        workspaceId: 'vault',
      }), '旧内容'),
    )

    expect(controller.update('新内容').dirty).toBe(true)
    expect(controller.markSaved('新内容', 100, 'UTF-8').dirty).toBe(false)
    expect(controller.migrate('archive/a.md').ref.path).toBe('archive/a.md')
    expect(controller.get().expectedMtime).toBe(100)
  })

  it('does not mutate the initial session object', () => {
    const initial = createDocumentSession(
      createDocumentRef({ id: 'doc', path: 'a.md', source: 'external' }),
      '内容',
    )
    const controller = createDocumentSessionController(initial)
    controller.update('修改')
    expect(initial.content).toBe('内容')
  })
})
