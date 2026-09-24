/** 只有仍挂在当前渲染集合中的、且未被更新代次淘汰的结果才能写回 DOM。 */
export const shouldCommitMermaidRender = (
  isActive: boolean,
  renderVersion: number,
  currentVersion: number,
): boolean => isActive && renderVersion === currentVersion

export type MermaidRenderDecision =
  | { action: 'skip-empty' }
  | { action: 'reuse-inflight' }
  | { action: 'reuse-committed' }
  | { action: 'start' }

/**
 * Obsidian 能画、Electron 直渲也能画的图，在 Paperin 里仍可能永远停在「正在渲染」：
 * 主题 MutationObserver / 视口装饰重建 / 未挂载 rAF 重试会反复 bump renderVersion，
 * 既丢掉已完成的 SVG，又把 8s 看门狗不断清零。同源去重是针对该生命周期的修复，不是语法问题。
 */
export const decideMermaidRender = (input: {
  prepared: string
  force: boolean
  inFlightPrepared: string | null
  hasInFlightPromise: boolean
  committedPrepared: string | null
  hasSvg: boolean
}): MermaidRenderDecision => {
  if (!input.prepared) return { action: 'skip-empty' }
  if (!input.force && input.inFlightPrepared === input.prepared && input.hasInFlightPromise) {
    return { action: 'reuse-inflight' }
  }
  if (!input.force && input.committedPrepared === input.prepared && input.hasSvg) {
    return { action: 'reuse-committed' }
  }
  return { action: 'start' }
}

/** 首次写入不算变化；只有主题 id 真正切换才值得强制重渲全部图。 */
export const shouldRerenderMermaidForTheme = (
  previousTheme: string | null,
  nextTheme: string,
): boolean => previousTheme !== null && previousTheme !== nextTheme

/** Paperin 深色主题 id → Mermaid 内置 dark；浅色一律 default。 */
const MERMAID_DARK_DOCUMENT_THEMES = new Set(['dark', 'github', 'atom', 'pine'])
export const mermaidThemeFromDocument = (documentTheme: string | undefined): 'dark' | 'default' =>
  MERMAID_DARK_DOCUMENT_THEMES.has(documentTheme ?? '') ? 'dark' : 'default'
