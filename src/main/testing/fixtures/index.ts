import type { PerformanceFixtureKind } from './markdown-builders'
import {
  FIXTURE_FILENAMES,
  FIXTURE_MARKERS,
  SCAN_MAX_FILE_BYTES,
  createPerformanceFixtureMarkdown,
  fixtureFilename,
} from './markdown-builders'
import {
  R09_MULTI_STRUCTURE_EXPORT_ANCHORS,
  buildR09OrdinaryDocumentMarkdown,
  buildR09MultiStructureSkeleton,
} from '../../../shared/testing/r09-fixture-contract'

export type { PerformanceFixtureKind }
export {
  FIXTURE_FILENAMES,
  FIXTURE_MARKERS,
  SCAN_MAX_FILE_BYTES,
  fixtureFilename,
  createPerformanceFixtureMarkdown,
  buildR09MultiStructureSkeleton,
  buildR09OrdinaryDocumentMarkdown,
  R09_MULTI_STRUCTURE_EXPORT_ANCHORS,
}

/** R09 普通编辑/保存/导出正确性夹具 */
export class OrdinaryDocumentFixture {
  readonly kind = 'ordinary' as const
  readonly filename = FIXTURE_FILENAMES.ordinary

  createMarkdown(): string {
    return createPerformanceFixtureMarkdown('ordinary')
  }
}

/** R05 扫描预算：2 MiB 阈值两侧（含唯一检索词） */
export class FileSizeThresholdFixtures {
  readonly belowFilename = FIXTURE_FILENAMES.sizeBelow
  readonly aboveFilename = FIXTURE_FILENAMES.sizeAbove
  readonly thresholdBytes = SCAN_MAX_FILE_BYTES

  createBelowThresholdMarkdown(): string {
    return createPerformanceFixtureMarkdown('size-below-threshold')
  }

  createAboveThresholdMarkdown(): string {
    return createPerformanceFixtureMarkdown('size-above-threshold')
  }
}

/** M01 / Electron perf：固定长段落 5 MiB（256×~20KiB） */
export class LargeParagraphDocumentFixture {
  readonly kind = 'large-paragraph-5mib' as const
  readonly filename = FIXTURE_FILENAMES.largeParagraph5Mib
  readonly targetBytes = 5 * 1024 * 1024

  createMarkdown(): string {
    return createPerformanceFixtureMarkdown('large-paragraph-5mib')
  }
}

/** M01 多结构 5 MiB：中文、列表、表格、代码、公式、Mermaid、脚注、frontmatter、不完整输入 */
export class MultiStructureDocumentFixture {
  readonly kind = 'multi-structure-5mib' as const
  readonly filename = FIXTURE_FILENAMES.multiStructure5Mib
  readonly targetBytes = 5 * 1024 * 1024

  createMarkdown(): string {
    return createPerformanceFixtureMarkdown('multi-structure-5mib')
  }

  requiredExportAnchors(): readonly string[] {
    return R09_MULTI_STRUCTURE_EXPORT_ANCHORS
  }
}

export const createFixtureMarkdown = createPerformanceFixtureMarkdown
