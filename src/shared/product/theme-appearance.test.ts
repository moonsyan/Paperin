import { describe, expect, it } from 'vitest'
import { isDarkProductTheme } from './theme-appearance'

describe('isDarkProductTheme', () => {
  it('marks built-in dark themes', () => {
    for (const theme of ['dark', 'github', 'atom', 'pine'] as const) {
      expect(isDarkProductTheme(theme)).toBe(true)
    }
  })

  it('marks built-in light themes and unknown ids as light', () => {
    for (const theme of ['default', 'ocean', 'rose', 'typewriter', 'mist', 'custom-x'] as const) {
      expect(isDarkProductTheme(theme)).toBe(false)
    }
  })
})
