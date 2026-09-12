#!/usr/bin/env node
// 校验 CI workflow 的质量门禁：每个平台 job 必须按固定顺序执行
// npm ci → typecheck → lint → test:ci → build。
// 失败时打印缺失/乱序步骤并返回非零退出码，供本地与 CI 使用。

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workflowPath = resolve(root, '.github', 'workflows', 'build.yml')

const JOBS = ['build-win:', 'build-mac:', 'build-linux:']
const REQUIRED_STEPS = [
  'npm ci',
  'npm run typecheck',
  'npm run lint',
  'npm run test:ci',
  'npm run build',
]

let content
try {
  content = readFileSync(workflowPath, 'utf8')
} catch {
  console.error(`未找到 CI workflow：${workflowPath}`)
  console.error('质量门禁无法校验——恢复 CI 前不得宣称三平台验证已配置。')
  process.exit(1)
}

const jobSections = JOBS.map((marker) => {
  const start = content.indexOf(marker)
  return { marker, start }
}).map(({ marker, start }) => {
  const next = JOBS
    .map((m) => content.indexOf(m))
    .filter((i) => i > start)
    .reduce((min, i) => Math.min(min, i), content.length)
  return { marker, text: content.slice(start, next) }
})

let failed = false

for (const { marker, text } of jobSections) {
  const positions = REQUIRED_STEPS.map((step) => ({ step, index: text.indexOf(step) }))
  const missing = positions.filter(({ index }) => index === -1).map(({ step }) => step)
  if (missing.length > 0) {
    console.error(`${marker} 缺少步骤: ${missing.join('、')}`)
    failed = true
    continue
  }
  let previous = -1
  for (const { step, index } of positions) {
    if (index < previous) {
      console.error(`${marker} 步骤乱序: "${step}" 应位于前一个门禁之后`)
      failed = true
      break
    }
    previous = index
  }
}

if (failed) {
  console.error(`\n${workflowPath} 未满足质量门禁要求:`)
  console.error('每个平台 job 必须按序包含:')
  console.error(`  ${REQUIRED_STEPS.join(' → ')}`)
  process.exit(1)
}

console.log('CI 配置校验通过: 三平台 job 均包含完整质量门禁且顺序正确。')
