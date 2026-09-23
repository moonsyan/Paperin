import { describe, expect, it } from 'vitest'
import { PRODUCT_ICON_DARK, PRODUCT_ICON_LIGHT, productIconSrc } from './product-icon'

describe('productIconSrc', () => {
  it('returns dark asset for dark themes', () => {
    expect(productIconSrc('dark')).toBe(PRODUCT_ICON_DARK)
    expect(productIconSrc('pine')).toBe(PRODUCT_ICON_DARK)
  })

  it('returns light asset for light themes', () => {
    expect(productIconSrc('default')).toBe(PRODUCT_ICON_LIGHT)
    expect(productIconSrc('mist')).toBe(PRODUCT_ICON_LIGHT)
  })
})
