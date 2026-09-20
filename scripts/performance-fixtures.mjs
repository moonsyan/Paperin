/** @typedef {'ordinary' | 'size-below-threshold' | 'size-above-threshold' | 'large-paragraph-5mib' | 'multi-structure-5mib'} PerformanceFixtureKind */

/** 与 shared/workspace-coverage WORKSPACE_SCAN_MAX_FILE_BYTES 一致 */
export const SCAN_MAX_FILE_BYTES = 2 * 1024 * 1024

export const FIXTURE_MARKERS = {
  originalTail: 'R09_FIXTURE_ORIGINAL_TAIL',
  lastInput: 'R09_FIXTURE_LAST_INPUT',
  largeParagraphTail: 'PERF_LARGE_DOCUMENT_TAIL',
  largeParagraphOriginal: 'PERF_LARGE_DOCUMENT_ORIGINAL',
  multiStructureAnchor: 'R09_MULTI_STRUCTURE_ANCHOR',
}

export const FIXTURE_FILENAMES = {
  ordinary: 'R09-普通文档.md',
  sizeBelow: 'R09-阈值下.md',
  sizeAbove: 'R09-阈值上.md',
  largeParagraph5Mib: '5MiB-性能文档.md',
  multiStructure5Mib: 'R09-多结构-5MiB.md',
}

/** @returns {string} */
export function createOrdinaryDocumentMarkdown() {
  return `# R09 普通夹具

中文段落与 ASCII mixed。末尾保留原文标记。

${FIXTURE_MARKERS.originalTail}

保存后应同时包含末次输入标记（由测试或 Electron 门禁写入）。
`
}

/**
 * @param {number} targetBytes
 * @param {string} uniqueToken
 */
export function padToByteLength(base, targetBytes, uniqueToken) {
  const baseBytes = Buffer.byteLength(base, 'utf8')
  if (baseBytes >= targetBytes) {
    return Buffer.from(base, 'utf8').subarray(0, targetBytes).toString('utf8')
  }
  const filler = Buffer.from(`FILL_${uniqueToken}_\n`, 'ascii')
  const chunks = [Buffer.from(base, 'utf8')]
  let size = baseBytes
  while (size < targetBytes) {
    const remaining = targetBytes - size
    chunks.push(remaining >= filler.length ? filler : filler.subarray(0, remaining))
    size += chunks[chunks.length - 1].length
  }
  return Buffer.concat(chunks, targetBytes).toString('utf8')
}

/** @returns {string} */
export function createBelowScanThresholdMarkdown() {
  const header = `# R09 扫描阈值下侧\n\n唯一词：R09_THRESHOLD_BELOW_TOKEN\n\n${FIXTURE_MARKERS.originalTail}\n\n`
  return padToByteLength(header, SCAN_MAX_FILE_BYTES - 1, 'below')
}

/** @returns {string} */
export function createAboveScanThresholdMarkdown() {
  const header = `# R09 扫描阈值上侧\n\n唯一词：R09_THRESHOLD_ABOVE_TOKEN\n\n${FIXTURE_MARKERS.originalTail}\n\n`
  return padToByteLength(header, SCAN_MAX_FILE_BYTES + 1, 'above')
}

const LARGE_DOCUMENT_BYTES = 5 * 1024 * 1024

/** 与 smoke-electron / electron-performance-smoke 共用：256 段约 20 KiB 段落。 */
export function createLargeParagraph5MibMarkdown() {
  const header = `# 5 MiB 性能文档\n\n${FIXTURE_MARKERS.largeParagraphOriginal}\n\n`
  const tail = `\n${FIXTURE_MARKERS.largeParagraphTail}\n`
  const paragraphCount = 256
  const prefix =
    '真实 Milkdown 性能验证段落：中文 Markdown 内容用于验证大文档的打开、编辑、保存和导出路径。\n'
  const fillerSize =
    Math.ceil((LARGE_DOCUMENT_BYTES - Buffer.byteLength(header) - Buffer.byteLength(tail)) / paragraphCount) -
    Buffer.byteLength(prefix) -
    2
  const filler = 'abcdefghijklmnopqrstuvwxyz0123456789'.repeat(Math.ceil(fillerSize / 36)).slice(0, fillerSize)
  return `${header}${`${prefix}${filler}\n\n`.repeat(paragraphCount)}${tail}`
}

/** @returns {string} */
export function buildMultiStructureSkeleton() {
  return `---
title: R09 多结构夹具
tags: [性能, 中文]
---

# 多结构 5 MiB 夹具

${FIXTURE_MARKERS.multiStructureAnchor}

## 列表与表格

- 中文项一
  - 嵌套 **加粗** 与 \`inline\`
- [x] 任务完成
- [ ] 任务未完成

| 列 A | 列 B |
| --- | --- |
| 表格中文 | \`code\` |

\`\`\`ts
export const threshold = ${SCAN_MAX_FILE_BYTES}
\`\`\`

行内公式 $E=mc^2$ 与块级：

$$
\\int_0^1 x^2 \\, dx
$$

\`\`\`mermaid
flowchart LR
  A[中文节点] --> B{R09}
\`\`\`

脚注示例[^note]

[^note]: 中文脚注定义

> 引用块保留

[不完整链接](missing-target

${FIXTURE_MARKERS.originalTail}
`
}

/** @returns {string} */
export function createMultiStructure5MibMarkdown() {
  const skeleton = buildMultiStructureSkeleton()
  const target = LARGE_DOCUMENT_BYTES
  if (Buffer.byteLength(skeleton, 'utf8') >= target) {
    return Buffer.from(skeleton, 'utf8').subarray(0, target).toString('utf8')
  }
  return padToByteLength(`${skeleton}\n\n`, target, 'multi')
}

/** @param {PerformanceFixtureKind} kind */
export function createPerformanceFixtureMarkdown(kind) {
  switch (kind) {
    case 'ordinary':
      return createOrdinaryDocumentMarkdown()
    case 'size-below-threshold':
      return createBelowScanThresholdMarkdown()
    case 'size-above-threshold':
      return createAboveScanThresholdMarkdown()
    case 'large-paragraph-5mib':
      return createLargeParagraph5MibMarkdown()
    case 'multi-structure-5mib':
      return createMultiStructure5MibMarkdown()
    default:
      throw new Error(`未知夹具：${kind}`)
  }
}

/** @param {PerformanceFixtureKind} kind */
export function fixtureFilename(kind) {
  switch (kind) {
    case 'ordinary':
      return FIXTURE_FILENAMES.ordinary
    case 'size-below-threshold':
      return FIXTURE_FILENAMES.sizeBelow
    case 'size-above-threshold':
      return FIXTURE_FILENAMES.sizeAbove
    case 'large-paragraph-5mib':
      return FIXTURE_FILENAMES.largeParagraph5Mib
    case 'multi-structure-5mib':
      return FIXTURE_FILENAMES.multiStructure5Mib
    default:
      throw new Error(`未知夹具：${kind}`)
  }
}
