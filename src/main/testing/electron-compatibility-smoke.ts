import { join } from 'path'
import type { BrowserWindow } from 'electron'
import { hashCompatibilityFixtureTree } from './fixtures/compatibility/compatibility-hash'
import { resolveCompatibilityManifests } from './fixtures/compatibility/materialize'
import { summarizeCompatibilityOpen } from './fixtures/compatibility/compatibility-diagnostics'
import type { EvaluateSmokeStep } from './electron-performance-smoke'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** 合成来源夹具只读冒烟：打开工作区、搜索与读取，不保存；前后 hash 必须一致。 */
export const runElectronCompatibilitySmoke = async (
  workspacePath: string,
  evaluate: EvaluateSmokeStep,
  win: BrowserWindow,
): Promise<string[]> => {
  const results: string[] = []
  const before = await hashCompatibilityFixtureTree(workspacePath)
  const wsArg = JSON.stringify(workspacePath)

  const opened = await evaluate(
    win,
    '打开兼容夹具工作区',
    `window.desktopAPI.document.openFolder(${wsArg}).then(r => ({ok: r.ok, code: r.error?.code, count: r.data?.tree?.length ?? 0}))`,
  )
  if (!opened.ok) {
    throw new Error(`SMOKE_FAIL 打开兼容夹具失败 ${JSON.stringify(opened)}`)
  }
  results.push(`打开兼容夹具 ok（树节点 ${opened.count as number}）`)

  await sleep(800)

  const searched = await evaluate(
    win,
    '兼容夹具搜索',
    `window.desktopAPI.workspace.search(${wsArg}, 'COMPAT_MARKER_markdown-1').then(r => ({ok: r.ok, code: r.error?.code, matches: r.data?.matches?.length ?? 0}))`,
  )
  if (!searched.ok || (searched.matches as number) < 1) {
    throw new Error(`SMOKE_FAIL 兼容夹具搜索未命中 ${JSON.stringify(searched)}`)
  }
  results.push(`兼容夹具搜索 ok（命中 ${searched.matches as number} 处）`)

  const samplePath = join(workspacePath, 'markdown', 'doc-01.md')
  const sampleArg = JSON.stringify(samplePath)
  const readSample = await evaluate(
    win,
    '只读打开样本',
    `window.desktopAPI.document.read(${sampleArg}).then(r => ({ok: r.ok, code: r.error?.code, hasMarker: typeof r.data?.content === 'string' && r.data.content.includes('COMPAT_MARKER_markdown-1')}))`,
  )
  if (!readSample.ok || readSample.hasMarker !== true) {
    throw new Error(`SMOKE_FAIL 只读读取样本失败 ${JSON.stringify(readSample)}`)
  }
  results.push('只读读取 markdown/doc-01.md ok（正文未写入）')

  const indexRefresh = await evaluate(
    win,
    '只读索引刷新',
    `window.desktopAPI.workspace.index.refresh(${wsArg}).then(r => ({
      ok: r.ok,
      code: r.error?.code,
      docCount: r.data?.index ? Object.keys(r.data.index.documents ?? {}).length : 0,
      index: r.data?.index ?? null,
    }))`,
    60_000,
  )
  if (!indexRefresh.ok || (indexRefresh.docCount as number) < 1 || !indexRefresh.index) {
    throw new Error(`SMOKE_FAIL 索引未就绪 ${JSON.stringify(indexRefresh)}`)
  }
  results.push(`只读索引 ok（文档 ${indexRefresh.docCount as number}）`)

  const indexPayload = indexRefresh.index
  if (!indexPayload || typeof indexPayload !== 'object') {
    throw new Error('SMOKE_FAIL 无法读取索引 DTO')
  }
  for (const manifest of resolveCompatibilityManifests()) {
    const summary = summarizeCompatibilityOpen(manifest, indexPayload as never)
    if (JSON.stringify(summary).match(/Users[/\\]|\\\\|\/home\//)) {
      throw new Error('SMOKE_FAIL 兼容诊断含绝对路径')
    }
  }
  results.push('兼容诊断 ok（无绝对路径泄漏）')

  const after = await hashCompatibilityFixtureTree(workspacePath)
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    throw new Error('SMOKE_FAIL 兼容夹具 hash 在只读打开后发生变化')
  }
  results.push('兼容夹具 hash 不变 ok（合成样本，非真实用户导出兼容）')

  return results
}
