/**
 * 内置主题的明暗分类：与代码高亮调色板、产品品牌图标保持一致。
 * 暗色主题用暗色产品图标；其余（含未知自定义主题 id）默认明亮图标。
 */
const DARK_PRODUCT_THEMES = new Set(['dark', 'github', 'atom', 'pine'])

export function isDarkProductTheme(theme: string): boolean {
  return DARK_PRODUCT_THEMES.has(theme)
}
