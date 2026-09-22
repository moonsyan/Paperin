import { mkdir, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import {
  COMPATIBILITY_FIXTURE_MANIFESTS,
  type CompatibilityFixtureManifest,
  type CompatibilitySource,
  MIN_DOCUMENTS_PER_SOURCE,
} from './manifest'

/** 1×1 PNG（合成，非用户图片） */
export const COMPATIBILITY_FIXTURE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAD0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const moduleDir = dirname(fileURLToPath(import.meta.url))
export const COMPATIBILITY_FIXTURE_ROOT = join(moduleDir, 'generated')

const sourceFolder = (source: CompatibilitySource): string => {
  switch (source) {
    case 'markdown':
      return 'markdown'
    case 'obsidian':
      return 'obsidian'
    case 'notion':
      return 'notion'
    case 'siyuan':
      return 'siyuan'
    case 'yuque':
      return 'yuque'
    default:
      return source
  }
}

export const listDocumentPathsForSource = (source: CompatibilitySource): string[] => {
  const folder = sourceFolder(source)
  const paths: string[] = []
  for (let index = 1; index <= 12; index += 1) {
    paths.push(`${folder}/doc-${String(index).padStart(2, '0')}.md`)
  }
  if (source === 'notion') {
    paths.push(`${folder}/table-export-01.csv`, `${folder}/table-export-02.csv`)
  }
  if (source === 'markdown') {
    paths.push('中文路径/标准样本.md')
  }
  paths.push('assets/compatibility-pixel.png')
  return Array.from(new Set(paths))
}

export const resolveCompatibilityManifests = (): CompatibilityFixtureManifest[] =>
  COMPATIBILITY_FIXTURE_MANIFESTS.map((entry) => ({
    ...entry,
    documents: listDocumentPathsForSource(entry.source),
  }))

const markdownBody = (source: CompatibilitySource, index: number): string => {
  const id = `${source}-${index}`
  const lines: string[] = []
  if (index === 1) {
    lines.push('---', 'title: 合成夹具', 'tags: [compat, synthetic]', '---', '')
  }
  lines.push(`# ${source} 合成样本 ${index}`, '')
  lines.push(`COMPAT_MARKER_${id}`, '')
  lines.push('中文段落：打开检查不应改写正文。', '')

  if (index === 2) {
    lines.push('[[Wiki未解析]] 与 [[doc-03|别名链接]]。', '')
  }
  if (index === 3) {
    lines.push('![相对图片存在](./../assets/compatibility-pixel.png)', '')
    lines.push('![相对图片缺失](./missing-attachment.png)', '')
  }
  if (index === 4) {
    lines.push('[普通链接](other-doc.md) 与 [不完整](missing-target', '')
  }
  if (index === 5) {
    lines.push('[^note] 脚注引用', '', '[^note]: 脚注正文', '')
  }
  if (index === 6) {
    lines.push('::: unknown-block', '未知块语法保留', ':::', '')
  }

  switch (source) {
    case 'obsidian':
      if (index === 7) lines.push('> [!note] Obsidian 标注', '> 合成 callout', '')
      if (index === 8) lines.push('![[embed-missing.md]]', '')
      if (index === 9) lines.push('#inline/tag 保留', '')
      break
    case 'notion':
      if (index === 7) lines.push('<details><summary>Notion 折叠</summary>正文</details>', '')
      if (index === 8) lines.push('{{database: synthetic-id}}', '')
      if (index === 9) lines.push('<!-- notion sync block placeholder -->', '')
      break
    case 'siyuan':
      if (index === 7) lines.push('((block-ref-synthetic))', '')
      if (index === 8) lines.push('{{widget synthetic}}', '')
      break
    case 'yuque':
      if (index === 7) lines.push('{% card synthetic %}', '')
      if (index === 8) lines.push('$$\\n\\text{语雀公式块}\\n$$', '')
      break
    default:
      break
  }

  if (index >= 10) {
    lines.push('- [ ] 任务项', '| 列 | 值 |', '| --- | --- |', '| 合成 | 表格 |', '')
  }

  return lines.join('\n')
}

const notionCsv = (index: number): string =>
  ['名称,状态,备注', `行${index},开放,合成 CSV 导出`, '中文列,完成,不写入真实库'].join('\n')

const writeRelative = async (root: string, relativePath: string, content: string | Buffer): Promise<void> => {
  const full = join(root, relativePath)
  await mkdir(dirname(full), { recursive: true })
  await writeFile(full, content)
}

/** 在 `generated/` 下写入全部合成夹具（可重复调用，覆盖同路径）。 */
export const materializeCompatibilityFixtures = async (
  root: string = COMPATIBILITY_FIXTURE_ROOT,
): Promise<void> => {
  await writeRelative(root, 'assets/compatibility-pixel.png', COMPATIBILITY_FIXTURE_PNG)

  for (const manifest of resolveCompatibilityManifests()) {
    for (const docPath of manifest.documents) {
      if (docPath.endsWith('.csv')) {
        const index = docPath.includes('02') ? 2 : 1
        await writeRelative(root, docPath, notionCsv(index))
        continue
      }
      if (docPath.endsWith('.png')) continue
      const match = docPath.match(/doc-(\d+)\.md$/)
      const index = match ? Number(match[1]) : 1
      const body =
        docPath.includes('中文路径/')
          ? `# 中文路径样本\n\nCOMPAT_CHINESE_PATH\n\n![图](../assets/compatibility-pixel.png)\n`
          : markdownBody(manifest.source, index)
      await writeRelative(root, docPath, body)
    }
  }
}

export const validateManifestCounts = (): void => {
  for (const manifest of resolveCompatibilityManifests()) {
    const mdCount = manifest.documents.filter((path) => path.endsWith('.md')).length
    if (mdCount < MIN_DOCUMENTS_PER_SOURCE) {
      throw new Error(`MANIFEST_TOO_SMALL:${manifest.source}`)
    }
  }
}
