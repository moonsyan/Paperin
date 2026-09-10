import { describe, expect, it } from 'vitest'
import { planTabRemoval } from './tab-close-plan'

const tabs = [
  { id: 'one', name: 'One' },
  { id: 'two', name: 'Two' },
  { id: 'three', name: 'Three' },
]

describe('planTabRemoval', () => {
  it('keeps the active document when it is not being closed', () => {
    expect(planTabRemoval(tabs, 'two', ['one'], 'untitled-1')).toEqual({
      nextOpenFiles: [tabs[1], tabs[2]],
      nextActiveFileId: 'two',
      activeTabWasClosed: false,
    })
  })

  it('selects the first remaining tab when the active document closes', () => {
    expect(planTabRemoval(tabs, 'two', ['two'], 'untitled-1')).toEqual({
      nextOpenFiles: [tabs[0], tabs[2]],
      nextActiveFileId: 'one',
      activeTabWasClosed: true,
    })
  })

  it('falls back to the untitled document after the final tab closes', () => {
    expect(planTabRemoval(tabs, 'two', ['one', 'two', 'three'], 'untitled-1')).toEqual({
      nextOpenFiles: [],
      nextActiveFileId: 'untitled-1',
      activeTabWasClosed: true,
    })
  })
})
