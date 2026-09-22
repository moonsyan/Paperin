/** 常见来源工具的合成导出夹具契约（非真实用户库，不宣称完整兼容）。 */
export type CompatibilitySource = 'markdown' | 'obsidian' | 'notion' | 'siyuan' | 'yuque'

export interface CompatibilityFixtureManifest {
  source: CompatibilitySource
  /** 来源工具版本或「合成」标记，便于矩阵记录 */
  sourceVersion: string
  /** 导出方式说明（合成 / 未验证真实导出时为 synthetic） */
  exportMethod: string
  /** 相对夹具根的路径（Markdown、CSV、图片等） */
  documents: string[]
  /** 预期无法完整还原、应保留原文或提示的语法特征 */
  expectedUnsupported: string[]
}

export const MIN_DOCUMENTS_PER_SOURCE = 10

export const COMPATIBILITY_FIXTURE_MANIFESTS: readonly CompatibilityFixtureManifest[] = [
  {
    source: 'markdown',
    sourceVersion: 'synthetic-gfm-1',
    exportMethod: 'synthetic-typora-like-gfm',
    documents: [],
    expectedUnsupported: [],
  },
  {
    source: 'obsidian',
    sourceVersion: 'synthetic-obsidian-1',
    exportMethod: 'synthetic-vault-subset',
    documents: [],
    expectedUnsupported: ['obsidian-callout', 'obsidian-embed', 'obsidian-tag-inline'],
  },
  {
    source: 'notion',
    sourceVersion: 'synthetic-notion-1',
    exportMethod: 'synthetic-notion-md-csv-export',
    documents: [],
    expectedUnsupported: ['notion-toggle', 'notion-database-ref', 'notion-sync-block'],
  },
  {
    source: 'siyuan',
    sourceVersion: 'synthetic-siyuan-1',
    exportMethod: 'synthetic-siyuan-markdown-export',
    documents: [],
    expectedUnsupported: ['siyuan-block-ref', 'siyuan-widget'],
  },
  {
    source: 'yuque',
    sourceVersion: 'synthetic-yuque-1',
    exportMethod: 'synthetic-yuque-lake-export',
    documents: [],
    expectedUnsupported: ['yuque-lake-card', 'yuque-formula-block'],
  },
] as const
