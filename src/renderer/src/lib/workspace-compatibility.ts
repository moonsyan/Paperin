export interface WorkspaceCompatibilityInput {
  complete: boolean
  truncated: boolean
  diagnostics: ReadonlyArray<{ code: string }>
}

/**
 * 打开知识库时的只读检查。只描述覆盖和缺件，不改原文、不写副本。
 */
export function workspaceCompatibilityNotes(index: WorkspaceCompatibilityInput | null): string[] {
  if (!index) return []
  const notes: string[] = []
  if (!index.complete || index.truncated) {
    notes.push('索引没有覆盖全部文件，搜索和检查不能当成完整结果。')
  }
  const missing = index.diagnostics.filter((item) => item.code === 'MISSING_ASSET').length
  if (missing > 0) notes.push(`${missing} 个附件在库里找不到，原文不会被改写。`)
  const broken = index.diagnostics.filter((item) => item.code === 'BROKEN_LINK' || item.code === 'UNRESOLVED_WIKI').length
  if (broken > 0) notes.push(`${broken} 个链接暂时对不上。`)
  const footnotes = index.diagnostics.filter((item) => item.code === 'FOOTNOTE_ERROR').length
  if (footnotes > 0) notes.push(`${footnotes} 处脚注不完整，按原文保留。`)
  return notes
}

export function workspaceCompatibilityToast(notes: readonly string[]): string | null {
  if (notes.length === 0) return null
  return `打开检查：${notes.join('')}原文没有被修改。`
}
