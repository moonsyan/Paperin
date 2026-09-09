import { describe, expect, it } from 'vitest'

import { MAX_PANEL_ID_LENGTH, isPanelId } from './panel-id'

describe('panel id', () => {
  it('accepts stable built-in and extension ids', () => {
    expect(isPanelId('outline')).toBe(true)
    expect(isPanelId('plugin.details-v2')).toBe(true)
    expect(isPanelId(`p${'a'.repeat(MAX_PANEL_ID_LENGTH - 1)}`)).toBe(true)
  })

  it('rejects unsafe, ambiguous, and oversized ids', () => {
    expect(isPanelId('../details')).toBe(false)
    expect(isPanelId('plugin details')).toBe(false)
    expect(isPanelId('plugin..details')).toBe(false)
    expect(isPanelId(`p${'a'.repeat(MAX_PANEL_ID_LENGTH)}`)).toBe(false)
  })
})
