#!/usr/bin/env node
// 性能基线采集：生成本地 Markdown fixture 工作区，测量首屏树、结构索引、
// 全文搜索的耗时与进程峰值内存，输出一行 JSON 到 stdout。
//
// 口径说明：
// - treeMs：递归读目录构建文件树（等价于打开工作区后的首屏树）。
// - indexMs：逐文件 stat + 读取 + 解析标题/标签/链接/图片引用（结构索引），
//   与 WorkspaceIndexService 的单遍解析目标一致。
// - searchMs：对全部文件做行级关键词检索（与工作区搜索同量级操作）。
// - peakRssMb：测量期间进程 RSS 峰值（10ms 采样）。
//
// 约束：只在 os.tmpdir() 下生成 fixture 并在结束后清理；输出为聚合指标，
// 不包含文件正文和绝对路径。可 --save <file> 追加保存指标 JSON。

import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'

const args = process.argv.slice(2)
const readArg = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback
}
const DOCUMENTS = Number(readArg('documents', 1000))
const BYTES_PER_DOC = Number(readArg('bytes-per-doc', readArg('size', 2048)))
const SEARCH_QUERY = readArg('query', '中文正文段落')
const SAVE_PATH = args.includes('--save') && args[args.indexOf('--save') + 1]

const buildDocContent = (index, documents, bytesPerDoc, query) => {
  const lines = [
    '---',
    `title: 性能样例 ${index}`,
    'tags:',
    `  - perf-${index % 20}`,
    '  - 基线',
    '---',
    '',
    `# 性能样例文档 ${index}`,
    '',
    `${query}：这是一个用于性能基线的中文正文段落，同时包含 English words。`,
    '',
    `参考 [[性能样例文档 ${(index + 1) % documents}]] 与相关笔记。`,
    '',
    `![配图](attachments/sample-${index % 8}.png)`,
    '',
  ]
  // 补足目标字节数：一次性计算填充次数，避免逐行 join 的 O(n²) 开销
  const filler = '\n补充段落：记录资料沉淀、连接、写作、检查与发布的完整流程。'
  const head = lines.join('\n')
  const deficit = bytesPerDoc - Buffer.byteLength(head, 'utf-8')
  if (deficit <= 0) return head
  const fillerBytes = Buffer.byteLength(filler, 'utf-8')
  return head + filler.repeat(Math.ceil(deficit / fillerBytes))
}

const writeFixtures = async (root, documents, bytesPerDoc, query) => {
  const dirs = [root, ...Array.from({ length: 10 }, (_, i) => join(root, `目录分组${i}`))]
  await Promise.all(dirs.map((dir) => mkdir(dir, { recursive: true })))
  await Promise.all(
    Array.from({ length: documents }, (_, i) =>
      writeFile(join(dirs[1 + (i % 10)], `性能样例文档-${i}.md`), buildDocContent(i, documents, bytesPerDoc, query), 'utf-8'),
    ),
  )
}

const scanTree = async (root) => {
  const files = []
  const walk = async (dir) => {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.name.endsWith('.md')) {
        files.push(full)
      }
    }
  }
  await walk(root)
  return files.sort()
}

// frontmatter tags 提取：对齐 workspace-tag-index.ts 的口径（tags/tag 键 +
// 行内数组或块级列表），脚本内为简化实现，仅覆盖基线 fixture 用到的写法。
const extractFrontmatterTags = (lines) => {
  if (!/^ {0,3}---\s*$/.test(lines[0] ?? '')) return []
  const tags = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (/^ {0,3}---\s*$/.test(line)) break
    const keyMatch = line.match(/^(tags|tag):\s*(.*)$/)
    if (!keyMatch) continue
    const inline = keyMatch[2].trim()
    if (inline.startsWith('[')) {
      for (const item of inline.slice(1, inline.includes(']') ? inline.indexOf(']') : undefined).split(',')) {
        const tag = item.trim().replace(/^["']|["']$/g, '').replace(/^#+/, '').trim()
        if (tag) tags.push(tag)
      }
      break
    }
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j]
      if (/^ {0,3}---\s*$/.test(next)) break
      const item = next.match(/^ {1,}-\s*(.*)$/)
      if (!item) break
      const tag = item[1].trim().replace(/^["']|["']$/g, '').replace(/^#+/, '').trim()
      if (tag) tags.push(tag)
    }
    break
  }
  return tags
}

// 结构索引解析：与 WorkspaceIndexParser 相同的字段粒度（headings/tags/links/images）
const parseDocument = (content) => {
  const headings = []
  const tags = []
  const links = []
  const imageRefs = []
  let inCodeFence = false
  const lines = content.split(/\r?\n/)
  for (const tag of extractFrontmatterTags(lines)) tags.push(tag)
  let insideFrontmatter = /^ {0,3}---\s*$/.test(lines[0] ?? '')
  lines.forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) inCodeFence = !inCodeFence
    if (insideFrontmatter) {
      // index 0 的 --- 是起始分隔符本身，不能当作结束符
      if (index > 0 && /^ {0,3}---\s*$/.test(line)) insideFrontmatter = false
      return
    }
    if (inCodeFence) return
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line)
    if (heading) headings.push(heading[2])
    for (const match of line.matchAll(/\[\[([^\]]+)\]\]/g)) {
      links.push(match[1])
    }
    for (const match of line.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
      imageRefs.push(match[1])
    }
  })
  return { headings, tags, links, imageRefs }
}

/**
 * 生成 fixture 并测量首屏树/结构索引/全文搜索耗时与峰值内存。
 * 供本脚本直接输出，也供 perf-regression.mjs 复用同一测量口径。
 */
export const measureWorkspacePerformance = async ({
  documents = DOCUMENTS,
  bytesPerDoc = BYTES_PER_DOC,
  query = SEARCH_QUERY,
} = {}) => {
  const root = await mkdtemp(join(tmpdir(), 'mkeditor-perf-'))
  const rssSamples = []
  const sampler = setInterval(() => rssSamples.push(process.memoryUsage().rss), 10)
  try {
    await writeFixtures(root, documents, bytesPerDoc, query)

    // 首屏树：冷启动后连续测量三次取中位，减少 GC 抖动
    const treeRuns = []
    for (let run = 0; run < 3; run++) {
      const start = performance.now()
      await scanTree(root)
      treeRuns.push(performance.now() - start)
    }
    treeRuns.sort((a, b) => a - b)
    const treeMs = Math.round(treeRuns[1] * 100) / 100

    // 结构索引
    const indexStart = performance.now()
    const files = await scanTree(root)
    let tagCount = 0
    let linkCount = 0
    let imageCount = 0
    for (const file of files) {
      const info = await stat(file)
      const content = await readFile(file, 'utf-8')
      void info.size
      const parsed = parseDocument(content)
      tagCount += parsed.tags.length
      linkCount += parsed.links.length
      imageCount += parsed.imageRefs.length
    }
    const indexMs = Math.round((performance.now() - indexStart) * 100) / 100

    // 行级全文搜索
    const searchStart = performance.now()
    let resultCount = 0
    for (const file of files) {
      const content = await readFile(file, 'utf-8')
      for (const line of content.split(/\r?\n/)) {
        if (line.includes(query)) resultCount++
      }
    }
    const searchMs = Math.round((performance.now() - searchStart) * 100) / 100

    clearInterval(sampler)
    const peakRssMb =
      Math.round((rssSamples.reduce((max, v) => Math.max(max, v), 0) / (1024 * 1024)) * 10) / 10

    const metrics = {
      generatedAt: new Date().toISOString(),
      documents,
      bytesPerDoc,
      treeMs,
      indexMs,
      searchMs,
      peakRssMb,
      tagCount,
      linkCount,
      imageCount,
      resultCount,
      nodeVersion: process.version,
    }
    return metrics
  } finally {
    clearInterval(sampler)
    await rm(root, { recursive: true, force: true })
  }
}

const main = async () => {
  const metrics = await measureWorkspacePerformance()
  console.log(JSON.stringify(metrics, null, 2))
  if (SAVE_PATH) {
    await writeFile(SAVE_PATH, JSON.stringify(metrics, null, 2), 'utf-8')
    console.error(`指标已保存至 ${SAVE_PATH}`)
  }
}

// 仅直接执行时运行 main（被 perf-regression.mjs 导入时不重复采集）
const scriptUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (scriptUrl === import.meta.url) {
  main().catch((error) => {
    console.error('性能基线执行失败:', error)
    process.exit(1)
  })
}
