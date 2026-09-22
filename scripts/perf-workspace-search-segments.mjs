#!/usr/bin/env node
// 使用生产 runWorkspaceSearch 采集分段指标；仅输出 JSON，不含路径或正文。
import { performance } from 'node:perf_hooks'
import { runWorkspaceSearch } from '../src/main/ipc/workspace-search-handler.ts'

const root = process.env.PAPERIN_PERF_ROOT
const query = process.env.PAPERIN_PERF_QUERY
if (typeof root !== 'string' || !root || typeof query !== 'string' || !query) {
  console.error('缺少 PAPERIN_PERF_ROOT 或 PAPERIN_PERF_QUERY')
  process.exit(1)
}

let workspaceSearchMetrics = null
await runWorkspaceSearch(
  { dir: root, query },
  undefined,
  undefined,
  undefined,
  {
    now: () => performance.now(),
    record: (metrics) => {
      workspaceSearchMetrics = metrics
    },
  },
)
process.stdout.write(`${JSON.stringify(workspaceSearchMetrics)}\n`)
