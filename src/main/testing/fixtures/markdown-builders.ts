import {
  R09_FIXTURE_FILENAMES,
  R09_FIXTURE_MARKERS,
  R09_SCAN_THRESHOLD_BYTES,
  buildR09MultiStructureSkeleton,
  buildR09OrdinaryDocumentMarkdown,
} from '../../../shared/testing/r09-fixture-contract'

export const STABILITY_FIXTURE_KINDS = [
  'large-paragraph',
  'many-short-nodes',
  'long-line',
  'cjk-emoji',
  'mixed-syntax',
] as const

export type StabilityFixtureKind = (typeof STABILITY_FIXTURE_KINDS)[number]

export type PerformanceFixtureKind =
  | 'ordinary'
  | 'size-below-threshold'
  | 'size-above-threshold'
  | 'large-paragraph-5mib'
  | 'multi-structure-5mib'
  | StabilityFixtureKind

export const FIXTURE_MARKERS = R09_FIXTURE_MARKERS
export const FIXTURE_FILENAMES = {
  ...R09_FIXTURE_FILENAMES,
  largeParagraph: '5MiB-长段落.md',
  manyShortNodes: '5MiB-短节点.md',
  longLine: '5MiB-超长行.md',
  cjkEmoji: '5MiB-中文emoji.md',
  mixedSyntax: '5MiB-混合语法.md',
} as const
export const SCAN_MAX_FILE_BYTES = R09_SCAN_THRESHOLD_BYTES

export const STABILITY_FIXTURE_MARKERS: Record<StabilityFixtureKind, { original: string; tail: string }> = {
  'large-paragraph': {
    original: R09_FIXTURE_MARKERS.largeParagraphOriginal,
    tail: R09_FIXTURE_MARKERS.largeParagraphTail,
  },
  'many-short-nodes': {
    original: 'STAB_SHORT_NODES_ORIGINAL',
    tail: 'STAB_SHORT_NODES_TAIL',
  },
  'long-line': {
    original: 'STAB_LONG_LINE_ORIGINAL',
    tail: 'STAB_LONG_LINE_TAIL',
  },
  'cjk-emoji': {
    original: 'STAB_CJK_EMOJI_ORIGINAL',
    tail: 'STAB_CJK_EMOJI_TAIL',
  },
  'mixed-syntax': {
    original: R09_FIXTURE_MARKERS.multiStructureAnchor,
    tail: R09_FIXTURE_MARKERS.originalTail,
  },
}

const LARGE_DOCUMENT_BYTES = 5 * 1024 * 1024
const INCOMPLETE_MARKDOWN = '[不完整链接](missing-target\n'

export function padToByteLength(base: string, targetBytes: number, uniqueToken: string): string {
  const baseBytes = Buffer.byteLength(base, 'utf8')
  if (baseBytes >= targetBytes) {
    return Buffer.from(base, 'utf8').subarray(0, targetBytes).toString('utf8')
  }
  const filler = Buffer.from(`FILL_${uniqueToken}_\n`, 'ascii')
  const chunks: Buffer[] = [Buffer.from(base, 'utf8')]
  let size = baseBytes
  while (size < targetBytes) {
    const remaining = targetBytes - size
    chunks.push(remaining >= filler.length ? filler : filler.subarray(0, remaining))
    size += chunks[chunks.length - 1].length
  }
  return Buffer.concat(chunks, targetBytes).toString('utf8')
}

export function createBelowScanThresholdMarkdown(): string {
  const header = `# R09 扫描阈值下侧\n\n唯一词：R09_THRESHOLD_BELOW_TOKEN\n\n${R09_FIXTURE_MARKERS.originalTail}\n\n`
  return padToByteLength(header, SCAN_MAX_FILE_BYTES - 1, 'below')
}

export function createAboveScanThresholdMarkdown(): string {
  const header = `# R09 扫描阈值上侧\n\n唯一词：R09_THRESHOLD_ABOVE_TOKEN\n\n${R09_FIXTURE_MARKERS.originalTail}\n\n`
  return padToByteLength(header, SCAN_MAX_FILE_BYTES + 1, 'above')
}

/** 与 smoke-electron / electron-performance-smoke 共用：256 段约 20 KiB 段落。 */
export function createLargeParagraph5MibMarkdown(): string {
  const header = `# 5 MiB 性能文档\n\n${R09_FIXTURE_MARKERS.largeParagraphOriginal}\n\n${INCOMPLETE_MARKDOWN}\n`
  const tail = `\n${R09_FIXTURE_MARKERS.largeParagraphTail}\n`
  const paragraphCount = 256
  const prefix =
    '真实 Milkdown 性能验证段落：中文 Markdown 内容用于验证大文档的打开、编辑、保存和导出路径。\n'
  const fillerSize =
    Math.ceil((LARGE_DOCUMENT_BYTES - Buffer.byteLength(header) - Buffer.byteLength(tail)) / paragraphCount) -
    Buffer.byteLength(prefix) -
    2
  const filler = 'abcdefghijklmnopqrstuvwxyz0123456789'.repeat(Math.ceil(fillerSize / 36)).slice(0, Math.max(1, fillerSize))
  return `${header}${`${prefix}${filler}\n\n`.repeat(paragraphCount)}${tail}`
}

export function createManyShortNodes5MibMarkdown(): string {
  const header = `# 短节点 5 MiB\n\n${STABILITY_FIXTURE_MARKERS['many-short-nodes'].original}\n\n${INCOMPLETE_MARKDOWN}`
  const node = '## 短标题\n短段。\n\n- 项\n\n'
  const tail = `\n${STABILITY_FIXTURE_MARKERS['many-short-nodes'].tail}\n`
  return padToByteLength(`${header}${node.repeat(200)}${tail}`, LARGE_DOCUMENT_BYTES, 'short')
}

export function createLongLine5MibMarkdown(): string {
  const header = `# 超长行 5 MiB ${STABILITY_FIXTURE_MARKERS['long-line'].original} ${INCOMPLETE_MARKDOWN.replace('\n', ' ')}`
  const tail = `\n${STABILITY_FIXTURE_MARKERS['long-line'].tail}\n`
  const line = '中文长行'.repeat(200)
  return padToByteLength(`${header}${line}${tail}`, LARGE_DOCUMENT_BYTES, 'longline')
}

export function createCjkEmoji5MibMarkdown(): string {
  const header = `# 中文与 emoji 5 MiB\n\n${STABILITY_FIXTURE_MARKERS['cjk-emoji'].original}\n\n维护 ✅ 来源 📎 交付 🚀\n\n[[未闭合\n`
  const body = '中文段落与 emoji 😊 用于稳定性夹具。\n\n'
  const tail = `\n${STABILITY_FIXTURE_MARKERS['cjk-emoji'].tail}\n`
  return padToByteLength(`${header}${body}${tail}`, LARGE_DOCUMENT_BYTES, 'cjk')
}

export function createMultiStructure5MibMarkdown(): string {
  const skeleton = buildR09MultiStructureSkeleton()
  if (Buffer.byteLength(skeleton, 'utf8') >= LARGE_DOCUMENT_BYTES) {
    return Buffer.from(skeleton, 'utf8').subarray(0, LARGE_DOCUMENT_BYTES).toString('utf8')
  }
  return padToByteLength(`${skeleton}\n\n`, LARGE_DOCUMENT_BYTES, 'multi')
}

export function createPerformanceFixtureMarkdown(kind: PerformanceFixtureKind): string {
  switch (kind) {
    case 'ordinary':
      return buildR09OrdinaryDocumentMarkdown()
    case 'size-below-threshold':
      return createBelowScanThresholdMarkdown()
    case 'size-above-threshold':
      return createAboveScanThresholdMarkdown()
    case 'large-paragraph':
    case 'large-paragraph-5mib':
      return createLargeParagraph5MibMarkdown()
    case 'many-short-nodes':
      return createManyShortNodes5MibMarkdown()
    case 'long-line':
      return createLongLine5MibMarkdown()
    case 'cjk-emoji':
      return createCjkEmoji5MibMarkdown()
    case 'mixed-syntax':
    case 'multi-structure-5mib':
      return createMultiStructure5MibMarkdown()
    default: {
      const exhaustive: never = kind
      throw new Error(`未知夹具：${exhaustive}`)
    }
  }
}

export function fixtureFilename(kind: PerformanceFixtureKind): string {
  switch (kind) {
    case 'ordinary':
      return FIXTURE_FILENAMES.ordinary
    case 'size-below-threshold':
      return FIXTURE_FILENAMES.sizeBelow
    case 'size-above-threshold':
      return FIXTURE_FILENAMES.sizeAbove
    case 'large-paragraph':
      return FIXTURE_FILENAMES.largeParagraph
    case 'large-paragraph-5mib':
      return FIXTURE_FILENAMES.largeParagraph5Mib
    case 'many-short-nodes':
      return FIXTURE_FILENAMES.manyShortNodes
    case 'long-line':
      return FIXTURE_FILENAMES.longLine
    case 'cjk-emoji':
      return FIXTURE_FILENAMES.cjkEmoji
    case 'mixed-syntax':
      return FIXTURE_FILENAMES.mixedSyntax
    case 'multi-structure-5mib':
      return FIXTURE_FILENAMES.multiStructure5Mib
    default: {
      const exhaustive: never = kind
      throw new Error(`未知夹具：${exhaustive}`)
    }
  }
}
