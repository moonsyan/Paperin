import { performance } from 'perf_hooks'
import { readFile } from 'fs/promises'
import { join } from 'path'
import type { BrowserWindow } from 'electron'
import { CHANNELS } from '../../shared/ipc/channels'

export const ELECTRON_PERFORMANCE_THRESHOLDS = {
  largeDocumentOpenMs: 120_000,
  largeDocumentSaveMs: 120_000,
  largeDocumentExportMs: 60_000,
  tabSwitchP95Ms: 10_000,
} as const

const LARGE_DOCUMENT_NAME = '5MiB-性能文档.md'
const LARGE_DOCUMENT_TAIL_MARKER = 'PERF_LARGE_DOCUMENT_TAIL'
const LARGE_DOCUMENT_EDIT_MARKER = 'PERF_LARGE_DOCUMENT_EDITED'
const TAB_COUNT = 20
const TAB_SWITCH_ROUNDS = 2
const PERFORMANCE_STEP_TIMEOUT_MS = 130_000

export type EvaluateSmokeStep = (
  win: BrowserWindow,
  label: string,
  script: string,
  timeoutMs?: number,
) => Promise<Record<string, unknown>>

type SaveShortcutInput = {
  type: 'keyDown'
  keyCode: 'S'
  modifiers: Array<'control' | 'meta'>
}

/**
 * DOM 构造的 KeyboardEvent 不会经过 Electron 的原生输入管线，可能被 Chromium
 * 当成默认行为消费而没有进入应用快捷键监听。性能门禁必须发送真实平台快捷键。
 */
export const createSaveShortcutInput = (platform: NodeJS.Platform): SaveShortcutInput => ({
  type: 'keyDown',
  keyCode: 'S',
  modifiers: [platform === 'darwin' ? 'meta' : 'control'],
})

const asNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const percentile = (values: readonly number[], fraction: number): number => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))
  return sorted[index]
}

export const summarizeElectronPerformance = (latencies: readonly number[]) => ({
  count: latencies.length,
  p50Ms: Math.round(percentile(latencies, 0.5) * 100) / 100,
  p95Ms: Math.round(percentile(latencies, 0.95) * 100) / 100,
  maxMs: Math.round(Math.max(0, ...latencies) * 100) / 100,
})

/** Milkdown 可把正文中的下划线转义为 `\\_`；两种写法读取后是同一文本。 */
const hasMarkdownTextMarker = (markdown: string, marker: string): boolean =>
  markdown.includes(marker) || markdown.includes(marker.split('_').join('\\_'))

export const hasSavedMarkdownMarkers = (
  markdown: string,
  originalTail: string,
  lastEdit: string,
): boolean => hasMarkdownTextMarker(markdown, originalTail) && hasMarkdownTextMarker(markdown, lastEdit)

const waitForSavedMarker = async (path: string, originalTail: string, lastEdit: string): Promise<string | null> => {
  const deadline = Date.now() + ELECTRON_PERFORMANCE_THRESHOLDS.largeDocumentSaveMs
  while (Date.now() < deadline) {
    const content = await readFile(path, 'utf8').catch(() => null)
    if (content && hasSavedMarkdownMarkers(content, originalTail, lastEdit)) return content
    await new Promise<void>((resolve) => setTimeout(resolve, 100))
  }
  return null
}

const waitForActiveDocumentScript = (name: string, marker: string): string => `
  (async () => {
    const deadline = performance.now() + ${ELECTRON_PERFORMANCE_THRESHOLDS.largeDocumentOpenMs}
    while (performance.now() < deadline) {
      const activeTab = document.querySelector('[role="tab"][aria-selected="true"] .tab-name')
      const editor = document.querySelector('.milkdown .editor')
      if (activeTab?.textContent === ${JSON.stringify(name)} && editor?.textContent?.includes(${JSON.stringify(marker)})) {
        return { ok: true }
      }
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    return {
      ok: false,
      active: document.querySelector('[role="tab"][aria-selected="true"] .tab-name')?.textContent,
      editorLength: document.querySelector('.milkdown .editor')?.textContent?.length ?? 0,
    }
  })()
`

const rendererMemoryScript = `(() => {
  const memory = performance.memory
  return memory
    ? { usedJsHeapMb: Math.round(memory.usedJSHeapSize / 1024 / 1024 * 100) / 100, totalJsHeapMb: Math.round(memory.totalJSHeapSize / 1024 / 1024 * 100) / 100 }
    : null
})()`

/**
 * Real Electron performance gate. It only operates on the caller-created
 * temporary workspace: OS-style open event -> preload -> normal tab/session
 * code -> Milkdown DOM edit -> global save shortcut -> main-process bundle
 * writer. Native save dialogs are deliberately avoided so it stays safe and
 * repeatable on unattended Windows runners.
 */
export const runElectronPerformanceSmoke = async (
  win: BrowserWindow,
  workspacePath: string,
  evalStep: EvaluateSmokeStep,
): Promise<string[]> => {
  const largePath = join(workspacePath, LARGE_DOCUMENT_NAME)
  const largeDocument = await readFile(largePath, 'utf8').catch(() => null)
  if (!largeDocument || Buffer.byteLength(largeDocument, 'utf8') < 5 * 1024 * 1024) {
    throw new Error('性能夹具缺少 5 MiB Markdown 文档')
  }

  const results: string[] = []
  const memoryBefore = await evalStep(win, '读取性能前渲染器内存', rendererMemoryScript)
  const largeOpenStartedAt = performance.now()
  win.webContents.send(CHANNELS.WINDOW_OPEN_FILE, largePath)
  const largeOpened = await evalStep(
    win,
    '5 MiB 文档打开并完成 Milkdown 装载',
    waitForActiveDocumentScript(LARGE_DOCUMENT_NAME, LARGE_DOCUMENT_TAIL_MARKER),
    PERFORMANCE_STEP_TIMEOUT_MS,
  )
  const largeOpenMs = performance.now() - largeOpenStartedAt
  if (largeOpened.ok !== true || largeOpenMs > ELECTRON_PERFORMANCE_THRESHOLDS.largeDocumentOpenMs) {
    throw new Error(`5 MiB 文档未在预算内完成真实装载 ${JSON.stringify({ largeOpenMs, largeOpened })}`)
  }

  const edited = await evalStep(
    win,
    '5 MiB 文档在 Milkdown 中编辑',
    `(() => {
      const editor = document.querySelector('.milkdown .editor')
      if (!(editor instanceof HTMLElement)) return { ok: false, reason: 'editor-missing' }
      editor.focus()
      const selection = window.getSelection()
      if (!selection) return { ok: false, reason: 'selection-missing' }
      const range = document.createRange()
      range.selectNodeContents(editor)
      range.collapse(false)
      selection.removeAllRanges()
      selection.addRange(range)
      const inserted = document.execCommand('insertText', false, '\\n${LARGE_DOCUMENT_EDIT_MARKER}\\n')
      // Chromium normally emits this event for execCommand, but an unattended
      // Electron runner can skip it while the editor is still attaching its
      // DOM observer. Re-emit the semantic input signal so Milkdown's model,
      // rather than only the visible DOM, becomes dirty before Ctrl+S.
      editor.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: ${JSON.stringify(LARGE_DOCUMENT_EDIT_MARKER)},
      }))
      return { ok: inserted || editor.textContent?.includes(${JSON.stringify(LARGE_DOCUMENT_EDIT_MARKER)}) === true, inserted }
    })()`,
  )
  if (edited.ok !== true) throw new Error(`Milkdown 大文档编辑失败 ${JSON.stringify(edited)}`)

  const dirty = await evalStep(
    win,
    '确认 5 MiB 文档编辑已经进入会话模型',
    `(() => {
      const deadline = performance.now() + 10_000
      return (async () => {
        while (performance.now() < deadline) {
          const activeTab = document.querySelector('[role="tab"][aria-selected="true"]')
          if (activeTab?.getAttribute('aria-label')?.includes('未保存')) return { ok: true }
          await new Promise(resolve => setTimeout(resolve, 50))
        }
        return { ok: false, activeLabel: document.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('aria-label') }
      })()
    })()`,
    PERFORMANCE_STEP_TIMEOUT_MS,
  )
  if (dirty.ok !== true) throw new Error(`5 MiB 文档编辑未进入会话模型 ${JSON.stringify(dirty)}`)

  const largeSaveStartedAt = performance.now()
  await evalStep(
    win,
    '安装原生保存快捷键观测器',
    `(() => {
      window.__perfSaveProbe = {
        shortcutDispatchedAt: performance.now(),
        shortcutObservedAt: null,
        shortcutObservedDefaultPrevented: null,
      }
      const listener = (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
          window.__perfSaveProbe.shortcutObservedAt = performance.now()
          window.__perfSaveProbe.shortcutObservedDefaultPrevented = event.defaultPrevented
        }
      }
      window.addEventListener('keydown', listener, true)
      return { ok: true }
    })()`,
  )
  win.webContents.sendInputEvent(createSaveShortcutInput(process.platform))
  const saveTriggered = await evalStep(
    win,
    '5 MiB 文档快捷键保存',
    `(() => {
      const deadline = performance.now() + 2_000
      return (async () => {
        while (performance.now() < deadline) {
          if (window.__perfSaveProbe.shortcutObservedAt != null) return { ok: true }
          await new Promise(resolve => setTimeout(resolve, 25))
        }
        return { ok: false, probe: window.__perfSaveProbe }
      })()
    })()`,
  )
  // contextBridge 暴露的 API 对象不可安全包装。直接轮询目标磁盘文件，
  // 同时要求原文尾部和末次编辑都存在，才确认真实 IPC 已成功持久化。
  const savedSnapshot = await waitForSavedMarker(
    largePath,
    LARGE_DOCUMENT_TAIL_MARKER,
    LARGE_DOCUMENT_EDIT_MARKER,
  )
  const largeSaveMs = performance.now() - largeSaveStartedAt
  if (saveTriggered.ok !== true || !savedSnapshot || largeSaveMs > ELECTRON_PERFORMANCE_THRESHOLDS.largeDocumentSaveMs) {
    const diskSnapshot = savedSnapshot ?? await readFile(largePath, 'utf8').catch(() => null)
    throw new Error(`5 MiB 文档保存失败或超预算 ${JSON.stringify({ saveTriggered, largeSaveMs, diskBytes: diskSnapshot ? Buffer.byteLength(diskSnapshot, 'utf8') : null, diskHasTail: diskSnapshot ? hasMarkdownTextMarker(diskSnapshot, LARGE_DOCUMENT_TAIL_MARKER) : false, diskHasEdit: diskSnapshot ? hasMarkdownTextMarker(diskSnapshot, LARGE_DOCUMENT_EDIT_MARKER) : false })}`)
  }

  const largeExportStartedAt = performance.now()
  const exported = await evalStep(
    win,
    '5 MiB 文档导出资源包',
    `(() => {
      const editor = document.querySelector('.milkdown .editor')
      if (!(editor instanceof HTMLElement)) return Promise.resolve({ ok: false, reason: 'editor-missing' })
      const html = '<!doctype html><html><body>' + editor.innerHTML + '</body></html>'
      return window.desktopAPI.document.exportBundle({
        outputDir: ${JSON.stringify(workspacePath)},
        folderName: 'electron-performance-export',
        html,
        assets: [],
      }).then(result => ({ ok: result.ok, code: result.error?.code, path: result.data?.path }))
    })()`,
    PERFORMANCE_STEP_TIMEOUT_MS,
  )
  const largeExportMs = performance.now() - largeExportStartedAt
  const exportPath = typeof exported.path === 'string' ? exported.path : null
  const exportedContent = exportPath ? await readFile(exportPath, 'utf8').catch(() => null) : null
  if (
    exported.ok !== true ||
    !exportedContent?.includes(LARGE_DOCUMENT_EDIT_MARKER) ||
    largeExportMs > ELECTRON_PERFORMANCE_THRESHOLDS.largeDocumentExportMs
  ) {
    throw new Error(`5 MiB 文档资源包导出失败或超预算 ${JSON.stringify({ exported, largeExportMs })}`)
  }

  const tabSpecs = [
    { name: LARGE_DOCUMENT_NAME, marker: LARGE_DOCUMENT_EDIT_MARKER, path: largePath },
    ...Array.from({ length: TAB_COUNT - 1 }, (_, index) => {
      const number = String(index + 1).padStart(2, '0')
      return {
        name: `性能标签-${number}.md`,
        marker: `PERF_TAB_${number}`,
        path: join(workspacePath, `性能标签-${number}.md`),
      }
    }),
  ]
  for (const tab of tabSpecs.slice(1)) {
    win.webContents.send(CHANNELS.WINDOW_OPEN_FILE, tab.path)
    const tabOpened = await evalStep(
      win,
      `打开 ${tab.name}`,
      waitForActiveDocumentScript(tab.name, tab.marker),
      PERFORMANCE_STEP_TIMEOUT_MS,
    )
    if (tabOpened.ok !== true) throw new Error(`性能标签未完成装载 ${JSON.stringify({ tab, tabOpened })}`)
  }

  const switched = await evalStep(
    win,
    '20 个真实标签循环切换',
    `
      (async () => {
        const tabs = ${JSON.stringify(tabSpecs.map(({ name, marker }) => ({ name, marker })))}
        const latencies = []
        for (let round = 0; round < ${TAB_SWITCH_ROUNDS}; round++) {
          for (const tab of tabs) {
            const target = Array.from(document.querySelectorAll('[role="tab"]')).find((node) =>
              node.querySelector('.tab-name')?.textContent === tab.name,
            )
            if (!(target instanceof HTMLElement)) return { ok: false, reason: 'tab-missing', tab: tab.name }
            const startedAt = performance.now()
            target.click()
            const deadline = startedAt + ${ELECTRON_PERFORMANCE_THRESHOLDS.tabSwitchP95Ms}
            let ready = false
            while (performance.now() < deadline) {
              const active = document.querySelector('[role="tab"][aria-selected="true"] .tab-name')?.textContent
              const editorText = document.querySelector('.milkdown .editor')?.textContent ?? ''
              if (active === tab.name && editorText.includes(tab.marker)) {
                ready = true
                break
              }
              await new Promise(resolve => setTimeout(resolve, 16))
            }
            if (!ready) return { ok: false, reason: 'tab-not-ready', tab: tab.name, elapsedMs: performance.now() - startedAt }
            latencies.push(performance.now() - startedAt)
          }
        }
        return { ok: true, latencies, rendererMemory: ${rendererMemoryScript} }
      })()
    `,
    PERFORMANCE_STEP_TIMEOUT_MS,
  )
  const rawLatencies = Array.isArray(switched.latencies)
    ? switched.latencies.map((value) => asNumber(value)).filter((value) => value > 0)
    : []
  const tabMetrics = summarizeElectronPerformance(rawLatencies)
  if (switched.ok !== true || rawLatencies.length !== TAB_COUNT * TAB_SWITCH_ROUNDS || tabMetrics.p95Ms > ELECTRON_PERFORMANCE_THRESHOLDS.tabSwitchP95Ms) {
    throw new Error(`20 标签切换失败或超预算 ${JSON.stringify({ switched, tabMetrics })}`)
  }
  const memoryAfter = await evalStep(win, '读取性能后渲染器内存', rendererMemoryScript)
  const metrics = {
    largeOpenMs: Math.round(largeOpenMs * 100) / 100,
    largeSaveMs: Math.round(largeSaveMs * 100) / 100,
    largeExportMs: Math.round(largeExportMs * 100) / 100,
    tabSwitch: tabMetrics,
    mainRssMb: Math.round(process.memoryUsage().rss / 1024 / 1024 * 100) / 100,
    rendererMemoryBefore: memoryBefore,
    rendererMemoryAfter: memoryAfter,
  }
  console.log(`ELECTRON_PERF_METRICS ${JSON.stringify(metrics)}`)
  results.push(`5 MiB 真实打开/编辑/保存/资源包导出 ok（打开 ${metrics.largeOpenMs}ms，保存 ${metrics.largeSaveMs}ms，导出 ${metrics.largeExportMs}ms）`)
  results.push(`20 标签循环切换 ok（${tabMetrics.count} 次，P50 ${tabMetrics.p50Ms}ms，P95 ${tabMetrics.p95Ms}ms，最大 ${tabMetrics.maxMs}ms）`)
  return results
}
