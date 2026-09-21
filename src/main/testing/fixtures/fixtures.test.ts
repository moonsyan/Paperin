import { describe, expect, it } from 'vitest'
import { WORKSPACE_SCAN_MAX_FILE_BYTES } from '../../../shared/workspace-coverage'
import { hasSavedMarkdownMarkers } from '../electron-performance-smoke'
import {
  FileSizeThresholdFixtures,
  FIXTURE_MARKERS,
  LargeParagraphDocumentFixture,
  MultiStructureDocumentFixture,
  OrdinaryDocumentFixture,
  STABILITY_FIXTURE_KINDS,
  STABILITY_FIXTURE_MARKERS,
  createPerformanceFixtureMarkdown,
} from './index'

describe('R09 performance fixtures', () => {
  it('阈值夹具字节数紧贴 shared 扫描预算两侧', () => {
    const thresholds = new FileSizeThresholdFixtures()
    expect(thresholds.thresholdBytes).toBe(WORKSPACE_SCAN_MAX_FILE_BYTES)
    const below = thresholds.createBelowThresholdMarkdown()
    const above = thresholds.createAboveThresholdMarkdown()
    expect(Buffer.byteLength(below, 'utf8')).toBe(WORKSPACE_SCAN_MAX_FILE_BYTES - 1)
    expect(Buffer.byteLength(above, 'utf8')).toBe(WORKSPACE_SCAN_MAX_FILE_BYTES + 1)
    expect(below).toContain('R09_THRESHOLD_BELOW_TOKEN')
    expect(above).toContain('R09_THRESHOLD_ABOVE_TOKEN')
  })

  it('5 MiB 长段落夹具尺寸与 smoke 标记一致', () => {
    const large = new LargeParagraphDocumentFixture()
    const markdown = large.createMarkdown()
    expect(Buffer.byteLength(markdown, 'utf8')).toBeGreaterThanOrEqual(large.targetBytes)
    expect(markdown).toContain(FIXTURE_MARKERS.largeParagraphOriginal)
    expect(markdown).toContain(FIXTURE_MARKERS.largeParagraphTail)
  })

  it('多结构 5 MiB 夹具包含协议要求的语法与不完整输入', () => {
    const multi = new MultiStructureDocumentFixture()
    const markdown = multi.createMarkdown()
    expect(Buffer.byteLength(markdown, 'utf8')).toBeGreaterThanOrEqual(multi.targetBytes)
    expect(markdown.startsWith('---\n')).toBe(true)
    expect(markdown).toContain('```ts')
    expect(markdown).toContain('```mermaid')
    expect(markdown).toContain('[^note]')
    expect(markdown).toContain('[不完整链接](missing-target')
    for (const anchor of ['R09_MULTI_STRUCTURE_ANCHOR', '表格中文', '中文脚注', FIXTURE_MARKERS.originalTail]) {
      expect(markdown).toContain(anchor)
    }
  })

  it('稳定性五结构夹具都达到 5 MiB，并保留首尾标记与不完整语法', () => {
    for (const kind of STABILITY_FIXTURE_KINDS) {
      const markdown = createPerformanceFixtureMarkdown(kind)
      expect(Buffer.byteLength(markdown, 'utf8'), kind).toBeGreaterThanOrEqual(5 * 1024 * 1024)
      expect(markdown).toContain(STABILITY_FIXTURE_MARKERS[kind].original)
      expect(markdown).toContain(STABILITY_FIXTURE_MARKERS[kind].tail)
      expect(markdown.includes('missing-target') || markdown.includes('[[未闭合')).toBe(true)
    }
  })

  it('R02 保存验收：原文尾部与末次输入同时存在才判成功（允许 Milkdown 转义）', () => {
    const ordinary = new OrdinaryDocumentFixture()
    const base = ordinary.createMarkdown()
    const saved = `${base}\n${FIXTURE_MARKERS.lastInput}\n`
    expect(hasSavedMarkdownMarkers(saved, FIXTURE_MARKERS.originalTail, FIXTURE_MARKERS.lastInput)).toBe(true)
  })
})
