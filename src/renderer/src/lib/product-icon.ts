import { isDarkProductTheme } from '../../../shared/product/theme-appearance'

/** 应用内品牌图路径（Vite public）；系统栏 / 安装器仍用 resources/icons 明亮图标 */
export const PRODUCT_ICON_LIGHT = './icon-light.png'
export const PRODUCT_ICON_DARK = './icon-dark.png'

export function productIconSrc(theme: string): string {
  return isDarkProductTheme(theme) ? PRODUCT_ICON_DARK : PRODUCT_ICON_LIGHT
}
