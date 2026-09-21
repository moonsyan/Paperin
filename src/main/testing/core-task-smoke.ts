import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { BrowserWindow, dialog } from 'electron'
import { CHANNELS } from '../../shared/ipc/channels'
import { R11_FIXTURE_MARKERS } from '../../shared/product/r11-demo-markers'
import { buildR11SourceAMarkdown, buildR11TechNoteMarkdown } from '../../shared/testing/r11-fixture-contract'
import { allowExportDirectory } from '../ipc/export-dirs'
import { createSaveShortcutInput, type EvaluateSmokeStep } from './electron-performance-smoke'
import { formatCoreTaskFail, type CoreTaskStep } from '../../shared/testing/core-task-contract'
import { buildCompactMenuPathScript } from './core-task-smoke-ui'

export { CORE_TASK_STEPS, formatCoreTaskFail } from '../../shared/testing/core-task-contract'
export type { CoreTaskStep } from '../../shared/testing/core-task-contract'
export { buildCompactMenuPathScript } from './core-task-smoke-ui'

export const CORE_TASK_DRAFT_NAME = 'API 网关技术说明.md'
export const CORE_TASK_SOURCE_NAME = '缓存失效策略.md'
export const CORE_TASK_EXPORT_FOLDER = 'core-task-export'

const fail = (step: CoreTaskStep, reason: string): never => {
  throw new Error(formatCoreTaskFail(step, reason))
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const setInputValueScript = (selector: string, value: string, submitSelector?: string): string => `
(() => {
  const input = document.querySelector(${JSON.stringify(selector)})
  if (!(input instanceof HTMLInputElement)) return { ok: false, reason: 'input-missing' }
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, ${JSON.stringify(value)})
  input.dispatchEvent(new Event('input', { bubbles: true }))
  ${submitSelector ? `const submit = document.querySelector(${JSON.stringify(submitSelector)}); if (submit instanceof HTMLElement) submit.click()` : ''}
  return { ok: true }
})()
`

const OPEN_FOLDER_MENU = ['更多菜单', '文档与知识库', '打开文件夹'] as const
const WORKSPACE_SEARCH_MENU = ['更多菜单', '文档与知识库', '全工作区搜索…'] as const

/**
 * 冒烟里的 `desktopAPI.document.openFolder(path)` 只登记主进程根，不更新 React 工作区。
 * 全文搜索依赖渲染层 `workspace`，因此这里走真实「打开文件夹」菜单，并用目录对话框替身回填路径。
 */
const bindRendererWorkspace = async (
  evaluate: EvaluateSmokeStep,
  win: BrowserWindow,
  workspaceRoot: string,
): Promise<void> => {
  const originalShowOpenDialog = dialog.showOpenDialog
  dialog.showOpenDialog = (async () => ({
    canceled: false,
    filePaths: [workspaceRoot],
  })) as typeof dialog.showOpenDialog
  try {
    const bound = await evaluate(
      win,
      '绑定渲染层工作区',
      buildCompactMenuPathScript(
        OPEN_FOLDER_MENU,
        'document.querySelector(\'[role="region"][aria-label="工作区"]\')?.getAttribute("data-workspace-state") === "open"',
      ),
    )
    if (bound.ok !== true) fail('find-source', `WORKSPACE_UI_MISSING ${JSON.stringify(bound)}`)
  } finally {
    dialog.showOpenDialog = originalShowOpenDialog
  }
}

/**
 * 按真实 UI 走完：找到合成来源 → 插入引用 → 保存并重开 → 导出资源包。
 * 任一步失败抛出 `CORE_TASK_FAIL <step> <reason>`，不只看最终 toast。
 */
export const runCoreTaskSmoke = async (
  evaluate: EvaluateSmokeStep,
  workspaceRoot: string,
): Promise<void> => {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) fail('find-source', 'NO_WINDOW')

  const sourceDir = join(workspaceRoot, '资料来源')
  const sourcePath = join(sourceDir, CORE_TASK_SOURCE_NAME)
  const draftPath = join(workspaceRoot, CORE_TASK_DRAFT_NAME)
  await mkdir(sourceDir, { recursive: true })
  await writeFile(sourcePath, `${buildR11SourceAMarkdown().trimEnd()}\n\n末尾来源 ${R11_FIXTURE_MARKERS.sourceAAnchor}\n`, 'utf8')
  await writeFile(draftPath, buildR11TechNoteMarkdown(), 'utf8')

  await bindRendererWorkspace(evaluate, win, workspaceRoot)

  win.webContents.send(CHANNELS.WINDOW_OPEN_FILE, draftPath)
  const opened = await evaluate(
    win,
    '打开技术说明草稿',
    `(async () => {
      const deadline = Date.now() + 8000
      while (Date.now() < deadline) {
        const name = document.querySelector('[role="tab"][aria-selected="true"] .tab-name')?.textContent
        const editor = document.querySelector('.milkdown .editor')
        if (name === ${JSON.stringify(CORE_TASK_DRAFT_NAME)} && editor?.textContent?.includes(${JSON.stringify(R11_FIXTURE_MARKERS.techNoteAnchor)})) {
          return { ok: true }
        }
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      return { ok: false, tab: document.querySelector('[role="tab"][aria-selected="true"] .tab-name')?.textContent ?? null }
    })()`,
  )
  if (opened.ok !== true) fail('find-source', `DRAFT_NOT_OPEN ${JSON.stringify(opened)}`)

  const menuOpened = await evaluate(
    win,
    '打开工作区搜索',
    buildCompactMenuPathScript(
      WORKSPACE_SEARCH_MENU,
      'Boolean(document.querySelector(\'[aria-label="工作区搜索关键词"]\'))',
    ),
  )
  if (menuOpened.ok !== true) fail('find-source', `SEARCH_UI_MISSING ${JSON.stringify(menuOpened)}`)

  const queried = await evaluate(
    win,
    '搜索合成来源',
    setInputValueScript('[aria-label="工作区搜索关键词"]', R11_FIXTURE_MARKERS.sourceAAnchor, '.ws-search-row .dialog-btn'),
  )
  if (queried.ok !== true) fail('find-source', 'QUERY_INPUT_FAILED')

  const found = await evaluate(
    win,
    '等待来源命中',
    `(async () => {
      const deadline = Date.now() + 8000
      while (Date.now() < deadline) {
        const error = document.querySelector('.ws-error')?.textContent?.trim() ?? ''
        if (error) return { ok: false, reason: error }
        const items = [...document.querySelectorAll('.ws-result-item')]
        const hit = items.find((item) => item.textContent?.includes(${JSON.stringify(R11_FIXTURE_MARKERS.sourceAAnchor)}))
        if (hit) return { ok: true, count: items.length }
        await new Promise((resolve) => setTimeout(resolve, 80))
      }
      return { ok: false, reason: 'NO_MATCH' }
    })()`,
  )
  if (found.ok !== true) fail('find-source', String(found.reason ?? 'NO_MATCH'))

  const inserted = await evaluate(
    win,
    '插入来源引用',
    `(async () => {
      const button = [...document.querySelectorAll('.ws-result-insert')].find((node) =>
        node.closest('.ws-result-item')?.textContent?.includes(${JSON.stringify(R11_FIXTURE_MARKERS.sourceAAnchor)}),
      )
      if (!(button instanceof HTMLElement)) return { ok: false, reason: 'INSERT_BUTTON_MISSING' }
      button.click()
      const closeBtn = document.querySelector('.ws-dialog [aria-label="关闭"]')
      if (closeBtn instanceof HTMLElement) closeBtn.click()
      const deadline = Date.now() + 5000
      while (Date.now() < deadline) {
        const editor = document.querySelector('.milkdown .editor')?.textContent ?? ''
        if (editor.includes(${JSON.stringify(R11_FIXTURE_MARKERS.sourceAAnchor)}) && editor.includes('来源')) {
          return { ok: true }
        }
        await new Promise((resolve) => setTimeout(resolve, 80))
      }
      return { ok: false, reason: 'CITATION_NOT_IN_EDITOR' }
    })()`,
  )
  if (inserted.ok !== true) fail('insert-citation', String(inserted.reason ?? 'INSERT_FAILED'))

  win.webContents.sendInputEvent(createSaveShortcutInput(process.platform))
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'S', modifiers: createSaveShortcutInput(process.platform).modifiers })
  const savedDeadline = Date.now() + 8000
  let savedMarkdown = ''
  while (Date.now() < savedDeadline) {
    savedMarkdown = await readFile(draftPath, 'utf8').catch(() => '')
    if (savedMarkdown.includes(R11_FIXTURE_MARKERS.sourceAAnchor) && savedMarkdown.includes('来源')) break
    await sleep(100)
  }
  if (!savedMarkdown.includes(R11_FIXTURE_MARKERS.sourceAAnchor)) fail('save-reopen', 'SAVE_MISSING_CITATION')

  const switched = await evaluate(
    win,
    '切换后重开技术说明',
    `(async () => {
      const clickTab = (name) => {
        const tab = [...document.querySelectorAll('[role="tab"]')].find((node) =>
          node.querySelector('.tab-name')?.textContent === name,
        )
        tab?.click()
        return Boolean(tab)
      }
      const other = [...document.querySelectorAll('[role="tab"] .tab-name')]
        .map((node) => node.textContent)
        .find((name) => name && name !== ${JSON.stringify(CORE_TASK_DRAFT_NAME)})
      if (!other || !clickTab(other)) return { ok: false, reason: 'OTHER_TAB_MISSING' }
      await new Promise((resolve) => setTimeout(resolve, 200))
      if (!clickTab(${JSON.stringify(CORE_TASK_DRAFT_NAME)})) return { ok: false, reason: 'DRAFT_TAB_MISSING' }
      const deadline = Date.now() + 5000
      while (Date.now() < deadline) {
        const editor = document.querySelector('.milkdown .editor')?.textContent ?? ''
        const active = document.querySelector('[role="tab"][aria-selected="true"] .tab-name')?.textContent
        if (active === ${JSON.stringify(CORE_TASK_DRAFT_NAME)} && editor.includes(${JSON.stringify(R11_FIXTURE_MARKERS.sourceAAnchor)})) {
          return { ok: true }
        }
        await new Promise((resolve) => setTimeout(resolve, 80))
      }
      return { ok: false, reason: 'REOPEN_MISSING_CITATION' }
    })()`,
  )
  if (switched.ok !== true) fail('save-reopen', String(switched.reason ?? 'REOPEN_FAILED'))

  if (!(await allowExportDirectory(workspaceRoot))) fail('export-bundle', 'EXPORT_DIR_DENIED')
  const exported = await evaluate(
    win,
    '导出 HTML 资源包',
    `(() => {
      const editor = document.querySelector('.milkdown .editor')
      if (!(editor instanceof HTMLElement)) return Promise.resolve({ ok: false, reason: 'editor-missing' })
      const html = '<!doctype html><html><body>' + editor.innerHTML + '</body></html>'
      return window.desktopAPI.document.exportBundle({
        outputDir: ${JSON.stringify(workspaceRoot)},
        folderName: ${JSON.stringify(CORE_TASK_EXPORT_FOLDER)},
        html,
        assets: [],
      }).then((result) => ({ ok: result.ok, code: result.error?.code, path: result.data?.path }))
    })()`,
  )
  const exportPath = typeof exported.path === 'string' ? exported.path : null
  const bundleHtml = exportPath ? await readFile(exportPath, 'utf8').catch(() => null) : null
  if (exported.ok !== true || !bundleHtml?.includes(R11_FIXTURE_MARKERS.sourceAAnchor)) {
    fail('export-bundle', `EXPORT_MISSING_SOURCE ${JSON.stringify({ exported, hasHtml: Boolean(bundleHtml) })}`)
  }
}
