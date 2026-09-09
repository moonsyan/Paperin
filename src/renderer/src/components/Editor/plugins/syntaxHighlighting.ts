import type { Refractor } from 'refractor/core'

/**
 * Mermaid 代码块由独立预览插件渲染，不应再要求 Prism 语法库。
 * 把它映射为纯文本可保留源码，也避免 Prism 将预期语言误报为不支持。
 */
export const configureCodeBlockRefractor = (refractor: Refractor): void => {
  if (!refractor.registered('mermaid')) {
    refractor.alias('plain', 'mermaid')
  }
}
