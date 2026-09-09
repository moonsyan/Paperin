#!/usr/bin/env node
// 大工作区性能回归：复用 perf-baseline.mjs 的测量口径，对阈值文件声明的
// 工作区场景执行首屏树 / 结构索引 / 简单搜索耗时断言。
//
// 用法：
//   node scripts/perf-regression.mjs
//   node scripts/perf-regression.mjs --documents 5000 --size 2048
//   node scripts/perf-regression.mjs --update-baseline   # 采集并把实际值写入基线文件
//
// 任一指标超过 docs/development/performance-baseline.json 的 targets 时
// 以非零退出并打印聚合指标（不打印 fixture 正文）。

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { measureWorkspacePerformance } from './perf-baseline.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const DEFAULT_THRESHOLD_FILE = join(scriptDir, '..', 'docs', 'development', 'performance-baseline.json')

const args = process.argv.slice(2)
const readArg = (name) => {
  const i = args.indexOf(`--${name}`)
  return i !== -1 && args[i + 1] ? args[i + 1] : undefined
}
const DOCUMENTS_ARG = readArg('documents')
const SIZE_ARG = readArg('size') ?? readArg('bytes-per-doc')
const THRESHOLD_FILE = readArg('thresholds') ?? DEFAULT_THRESHOLD_FILE
const UPDATE_BASELINE = args.includes('--update-baseline')

const METRIC_KEYS = ['treeMs', 'indexMs', 'searchMs']

const readPositiveInteger = (value, label) => {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} 必须是正整数，当前值：${String(value)}`)
  }
  return parsed
}

const main = async () => {
  let thresholdDoc
  try {
    thresholdDoc = JSON.parse(await readFile(THRESHOLD_FILE, 'utf-8'))
  } catch {
    console.error(`阈值文件缺失或无法解析：${THRESHOLD_FILE}`)
    console.error('请先在 docs/development/performance-baseline.json 中定义 targets。')
    process.exit(1)
  }
  const targets = thresholdDoc?.targets ?? {}
  for (const key of METRIC_KEYS) {
    if (typeof targets[key] !== 'number' || targets[key] <= 0) {
      console.error(`阈值文件缺少有效目标值：targets.${key}`)
      process.exit(1)
    }
  }

  const documents = readPositiveInteger(
    DOCUMENTS_ARG ?? thresholdDoc?.scenario?.documents ?? 5000,
    'documents',
  )
  const bytesPerDoc = readPositiveInteger(
    SIZE_ARG ?? thresholdDoc?.scenario?.bytesPerDoc ?? 2048,
    'bytesPerDoc',
  )

  const metrics = await measureWorkspacePerformance({ documents, bytesPerDoc })
  const { treeMs, indexMs, searchMs } = metrics

  if (UPDATE_BASELINE) {
    thresholdDoc.scenario = {
      documents: metrics.documents,
      bytesPerDoc: metrics.bytesPerDoc,
    }
    thresholdDoc.baseline = {
      generatedAt: metrics.generatedAt,
      documents: metrics.documents,
      bytesPerDoc: metrics.bytesPerDoc,
      treeMs,
      indexMs,
      searchMs,
      peakRssMb: metrics.peakRssMb,
      nodeVersion: metrics.nodeVersion,
    }
    await writeFile(THRESHOLD_FILE, `${JSON.stringify(thresholdDoc, null, 2)}\n`, 'utf-8')
    console.error(`基线已更新至 ${THRESHOLD_FILE}`)
  }

  const exceeded = METRIC_KEYS.filter((key) => metrics[key] > targets[key])
  console.log(JSON.stringify(metrics, null, 2))
  if (exceeded.length > 0) {
    const detail = exceeded.map((key) => `${key}=${metrics[key]}ms > 阈值 ${targets[key]}ms`).join('；')
    console.log(`性能回归未通过（超阈值）：${detail}`)
    process.exit(1)
  }
  console.log(
    `性能回归通过（${metrics.documents} 文档 × ${metrics.bytesPerDoc}B）：` +
      METRIC_KEYS.map((key) => `${key}=${metrics[key]}ms`).join('，') +
      `，峰值内存 ${metrics.peakRssMb}MB`,
  )
}

main().catch((error) => {
  console.error('性能回归执行失败:', error)
  process.exit(1)
})
