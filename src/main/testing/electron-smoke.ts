import { app, BrowserWindow } from 'electron'
import { mkdtempSync } from 'fs'
import { readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { CHANNELS } from '../../shared/ipc/channels'
import { trustDirectory } from '../trusted-paths'

/**
 * Electron 级端到端冒烟（`--smoke <工作区>` 启动参数触发）。
 *
 * 与单元测试的区别：走真实产品路径——渲染层 desktopAPI → 预加载桥 →
 * 主进程 IPC → 磁盘，覆盖"打开工作区 → 创建 → 保存 → 外部修改冲突 →
 * 重命名 → 搜索 → 状态读取"主链路。仅供 `scripts/smoke-electron.mjs`
 * 与 CI 调用；不改变任何生产逻辑（信任登记仅针对临时冒烟工作区）。
 */

const SMOKE_STEP_TIMEOUT_MS = 15_000
const SMOKE_WATCHDOG_MS = 120_000

/** 解析 --smoke 启动参数，返回冒烟工作区路径（无则返回 null） */
export const parseSmokeWorkspace = (argv = process.argv): string | null => {
  const index = argv.indexOf('--smoke')
  if (index === -1 || !argv[index + 1]) return null
  return argv[index + 1]
}

/** 冒烟模式必须在 app ready 前调用：把 userData 指向一次性临时目录，
 *  避免读写真实用户设置/信任清单，也让单实例锁与真实实例互不干扰 */
export const applySmokeUserData = (): void => {
  const dir = mkdtempSync(join(tmpdir(), 'mkeditor-smoke-user-'))
  app.setPath('userData', dir)
}

/** 在渲染层执行一段返回 Promise 的脚本并施加超时保护 */
const evalStep = async (
  win: BrowserWindow,
  label: string,
  script: string,
): Promise<Record<string, unknown>> => {
  const result = (await Promise.race([
    win.webContents.executeJavaScript(script),
    new Promise((_resolve, reject) =>
      setTimeout(() => reject(new Error(`步骤超时：${label}`)), SMOKE_STEP_TIMEOUT_MS),
    ),
  ])) as Record<string, unknown>
  return result
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** 等待主窗口加载完成且 desktopAPI 可用 */
const waitForReadyWindow = async (): Promise<BrowserWindow> => {
  const deadline = Date.now() + 30_000
  for (;;) {
    const win = BrowserWindow.getAllWindows()[0]
    if (win && !win.webContents.isLoading()) {
      const ready = await win.webContents
        .executeJavaScript('Boolean(window.desktopAPI)')
        .catch(() => false)
      if (ready) return win
    }
    if (Date.now() > deadline) {
      throw new Error('等待窗口与 desktopAPI 就绪超时')
    }
    await sleep(250)
  }
}

/** 运行冒烟场景；任何步骤失败都以非零退出码结束进程 */
export const runElectronSmoke = async (
  workspacePath: string,
  associatedFilePath?: string,
): Promise<void> => {
  const results: string[] = []
  const finish = async (code: 0 | 1, message: string): Promise<never> => {
    if (message) console.error(message.trimEnd())
    clearTimeout(watchdog)
    // 清理冒烟 userData（冒烟工作区由调用方脚本清理）
    await rm(app.getPath('userData'), { recursive: true, force: true }).catch(() => undefined)
    app.exit(code)
    return undefined as never
  }
  const watchdog = setTimeout(() => {
    console.error('SMOKE_FAIL 冒烟总超时')
    app.exit(1)
  }, SMOKE_WATCHDOG_MS)
  watchdog.unref()
  try {
    // 冒烟工作区登记为信任根（等价于用户经对话框打开的授权路径）
    trustDirectory(workspacePath, { essential: true })
    const win = await waitForReadyWindow()
    const wsArg = JSON.stringify(workspacePath)

    // 0. 启动 argv → Main 授权 → preload 窄事件 → Renderer 现有标签路径。
    // 重发同一路径后标签数保持不变，覆盖关联打开的去重契约。
    if (associatedFilePath) {
      const expectedName = associatedFilePath.split(/[/\\]/).pop() ?? associatedFilePath
      const association = await evalStep(
        win,
        '系统文件关联',
        `(async () => {
          const deadline = Date.now() + 10000
          while (Date.now() < deadline) {
            const banner = document.querySelector('.current-file-banner')
            const title = document.querySelector('.current-file-banner-title')?.textContent
            if (banner?.getAttribute('data-source') === 'external' && title === ${JSON.stringify(expectedName)}) {
              return { ok: true, tabs: document.querySelectorAll('[role="tab"]').length }
            }
            await new Promise(resolve => setTimeout(resolve, 100))
          }
          const banner = document.querySelector('.current-file-banner')
          return {
            ok: false,
            hash: window.location.hash,
            hasOnOpenFile: typeof window.desktopAPI?.window?.onOpenFile === 'function',
            source: banner?.getAttribute('data-source'),
            title: document.querySelector('.current-file-banner-title')?.textContent,
            tabs: document.querySelectorAll('[role="tab"]').length,
          }
        })()`,
      )
      if (!association.ok) {
        return await finish(1, `SMOKE_FAIL 系统关联文件未进入外部标签 ${JSON.stringify(association)}`)
      }
      win.webContents.send(CHANNELS.WINDOW_OPEN_FILE, associatedFilePath)
      await sleep(300)
      const duplicate = await evalStep(
        win,
        '关联文件去重',
        `Promise.resolve({ tabs: document.querySelectorAll('[role="tab"]').length })`,
      )
      if (duplicate.tabs !== association.tabs) {
        return await finish(1, `SMOKE_FAIL 同路径关联打开产生重复标签 ${JSON.stringify(duplicate)}`)
      }
      results.push('系统文件关联 ok（外部临时标签，同路径去重）')
    }

    // 1. 打开工作区
    const opened = await evalStep(
      win,
      '打开工作区',
      `window.desktopAPI.document.openFolder(${wsArg}).then(r => ({ok: r.ok, code: r.error?.code, count: r.data?.tree?.length ?? 0}))`,
    )
    if (!opened.ok) return await finish(1, `SMOKE_FAIL 打开工作区失败 ${JSON.stringify(opened)}`)
    results.push(`打开工作区 ok（树节点 ${opened.count}）`)

    // 2. 新建文档
    const created = await evalStep(
      win,
      '新建文档',
      `window.desktopAPI.workspace.createFile(${wsArg}, '冒烟文档').then(r => ({ok: r.ok, code: r.error?.code, path: r.data?.path}))`,
    )
    if (!created.ok || typeof created.path !== 'string') {
      return await finish(1, `SMOKE_FAIL 新建文档失败 ${JSON.stringify(created)}`)
    }
    results.push(`新建文档 ok：${created.path as string}`)
    const docPath = created.path as string
    const docPathArg = JSON.stringify(docPath)

    // 3. 保存内容 → 主进程校验磁盘
    const saveContent = '# 冒烟\n\n中文内容一\n'
    const saved = await evalStep(
      win,
      '保存文档',
      `window.desktopAPI.document.save(${docPathArg}, ${JSON.stringify(saveContent)}).then(r => ({ok: r.ok, code: r.error?.code}))`,
    )
    if (!saved.ok) return await finish(1, `SMOKE_FAIL 保存失败 ${JSON.stringify(saved)}`)
    const onDisk = await readFile(docPath, 'utf-8')
    if (onDisk !== saveContent) return await finish(1, `SMOKE_FAIL 磁盘内容不一致：${JSON.stringify(onDisk)}`)
    results.push('保存文档 ok（磁盘内容一致）')

    // 4. 外部修改后用过期 mtime 保存 → 必须返回 CONFLICT，不得静默覆盖
    const externalContent = `${saveContent}外部修改\n`
    await writeFile(docPath, externalContent, 'utf-8')
    const conflict = await evalStep(
      win,
      '外部修改冲突',
      `window.desktopAPI.document.save(${docPathArg}, '旧内容', 1).then(r => ({ok: r.ok, code: r.error?.code}))`,
    )
    if (conflict.ok || conflict.code !== 'CONFLICT') {
      return await finish(1, `SMOKE_FAIL 外部修改未被拦截 ${JSON.stringify(conflict)}`)
    }
    const afterConflict = await readFile(docPath, 'utf-8')
    if (afterConflict !== externalContent) {
      return await finish(1, 'SMOKE_FAIL 冲突后磁盘内容被覆盖')
    }
    results.push('外部修改冲突 ok（旧 mtime 保存被拒绝，磁盘内容未覆盖）')

    // 5. 重新读取 → 拿到外部内容
    const reread = await evalStep(
      win,
      '重新读取',
      `window.desktopAPI.document.read(${docPathArg}).then(r => ({ok: r.ok, code: r.error?.code, content: r.data?.content}))`,
    )
    if (!reread.ok || !(reread.content as string | undefined)?.includes('外部修改')) {
      return await finish(1, `SMOKE_FAIL 重新读取未拿到外部内容 ${JSON.stringify(reread)}`)
    }
    results.push('重新读取 ok（内容为外部修改版本）')

    // 6. 重命名
    const renamed = await evalStep(
      win,
      '重命名',
      `window.desktopAPI.workspace.renameFile(${docPathArg}, '冒烟改名.md').then(r => ({ok: r.ok, code: r.error?.code, path: r.data?.path}))`,
    )
    if (!renamed.ok) return await finish(1, `SMOKE_FAIL 重命名失败 ${JSON.stringify(renamed)}`)
    const renamedPath = join(workspacePath, '冒烟改名.md')
    await readFile(renamedPath, 'utf-8')
    results.push(`重命名 ok：${renamedPath}`)

    // 7. 工作区搜索命中外部修改内容
    const searched = await evalStep(
      win,
      '工作区搜索',
      `window.desktopAPI.workspace.search(${wsArg}, '外部修改').then(r => ({ok: r.ok, code: r.error?.code, matches: r.data?.matches?.length ?? 0}))`,
    )
    if (!searched.ok || (searched.matches as number) < 1) {
      return await finish(1, `SMOKE_FAIL 搜索未命中 ${JSON.stringify(searched)}`)
    }
    results.push(`工作区搜索 ok（命中 ${searched.matches} 处）`)

    // 8. 工作区状态与设置读取
    const stateLoaded = await evalStep(
      win,
      '工作区状态读取',
      'window.desktopAPI.workspaceState.load().then(r => ({ok: r.ok, code: r.error?.code}))',
    )
    if (!stateLoaded.ok) return await finish(1, `SMOKE_FAIL 工作区状态读取失败 ${JSON.stringify(stateLoaded)}`)
    results.push('工作区状态读取 ok')

    console.log('SMOKE_PASS')
    return await finish(0, results.join('\n'))
  } catch (error) {
    results.push(`异常：${String(error)}`)
    return await finish(1, `SMOKE_FAIL ${String(error)}\n${results.join('\n')}`)
  }
}
