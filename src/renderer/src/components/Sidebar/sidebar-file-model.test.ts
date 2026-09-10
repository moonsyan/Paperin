import { describe, expect, it } from 'vitest'
import { collectExternalOpenFiles, isPathWithinRoot } from './sidebar-file-model'

describe('sidebar file model', () => {
  it('recognizes files inside a workspace without allowing sibling prefixes', () => {
    expect(isPathWithinRoot('C:/notes', 'c:/notes/today.md')).toBe(true)
    expect(isPathWithinRoot('C:/notes', 'C:/notes-archive/today.md')).toBe(false)
  })

  it('keeps opened files outside the workspace for the external group', () => {
    const files = collectExternalOpenFiles(
      [
        { id: 'in', name: 'in.md', path: 'C:/notes/in.md' },
        { id: 'out', name: 'out.md', path: 'D:/drafts/out.md' },
        { id: 'untitled', name: 'Untitled' },
      ],
      'C:/notes',
    )
    expect(files.map((file) => file.id)).toEqual(['out'])
  })
})
