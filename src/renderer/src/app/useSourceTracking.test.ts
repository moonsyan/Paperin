// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { DEFAULT_WORKSPACE_SETTINGS } from '../../../shared/workspace-state'
import type { WorkspaceSettingsState } from '../../../shared/workspace-state'
import { useSourceTracking } from './useSourceTracking'

type StatDeferred = {
  promise: Promise<{ ok: boolean; data?: { modifiedTime: number } }>
  resolve: (value: { ok: boolean; data?: { modifiedTime: number } }) => void
  reject: (reason?: unknown) => void
}

const createStatDeferred = (): StatDeferred => {
  let resolve!: StatDeferred['resolve']
  let reject!: StatDeferred['reject']
  const promise = new Promise<{ ok: boolean; data?: { modifiedTime: number } }>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const WORKSPACE_A = 'D:/ws-a'
const WORKSPACE_B = 'D:/ws-b'
const SOURCE_ABS = 'D:/ws-a/资料/source.md'
const CITING_KEY = '文章/a.md'

const stubDesktopStat = (queue: StatDeferred[]) => {
  vi.stubGlobal(
    'window',
    Object.assign(window, {
      desktopAPI: {
        platform: 'win32',
        document: {
          stat: vi.fn(() => {
            const next = queue.shift()
            if (!next) throw new Error('unexpected stat')
            return next.promise
          }),
        },
      },
    }),
  )
}

const renderTracking = (initialPath: string | undefined = WORKSPACE_A) => {
  const statQueue: StatDeferred[] = []
  stubDesktopStat(statQueue)

  const rendered = renderHook(
    ({ path }: { path: string | undefined }) => {
      const [settings, setSettings] = useState<WorkspaceSettingsState>(DEFAULT_WORKSPACE_SETTINGS)
      const tracking = useSourceTracking({
        workspacePath: path,
        citingDocumentKey: CITING_KEY,
        activeDocumentId: 'file-a',
        setWorkspaceSettings: setSettings,
      })
      return { settings, setSettings, ...tracking }
    },
    { initialProps: { path: initialPath } },
  )

  return { ...rendered, statQueue }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useSourceTracking.rememberSourceAfterInsert', () => {
  it('stat 成功后写入按文档归属的来源基线', async () => {
    const { result, statQueue } = renderTracking()
    const deferred = createStatDeferred()
    statQueue.push(deferred)

    act(() => {
      result.current.rememberSourceAfterInsert(SOURCE_ABS)
    })

    await act(async () => {
      deferred.resolve({ ok: true, data: { modifiedTime: 99 } })
    })

    await waitFor(() => {
      expect(result.current.settings.editor.documentSourceBaselines).toEqual([
        { citingDocumentPath: CITING_KEY, sourcePath: '资料/source.md', modifiedTime: 99 },
      ])
    })
  })

  it('A→B 切换后旧工作区的 stat 回包不写入当前设置', async () => {
    const { result, rerender, statQueue } = renderTracking(WORKSPACE_A)
    const deferred = createStatDeferred()
    statQueue.push(deferred)

    act(() => {
      result.current.rememberSourceAfterInsert(SOURCE_ABS)
    })

    await act(async () => {
      rerender({ path: WORKSPACE_B })
    })

    await act(async () => {
      deferred.resolve({ ok: true, data: { modifiedTime: 10 } })
    })

    await waitFor(() => {
      expect(result.current.settings.editor.documentSourceBaselines).toEqual([])
    })
  })

  it('A→B→A 再次打开同一路径时旧回包仍无效', async () => {
    const { result, rerender, statQueue } = renderTracking(WORKSPACE_A)
    const deferred = createStatDeferred()
    statQueue.push(deferred)

    act(() => {
      result.current.rememberSourceAfterInsert(SOURCE_ABS)
    })

    await act(async () => {
      rerender({ path: WORKSPACE_B })
    })
    await act(async () => {
      rerender({ path: WORKSPACE_A })
    })

    await act(async () => {
      deferred.resolve({ ok: true, data: { modifiedTime: 10 } })
    })

    await waitFor(() => {
      expect(result.current.settings.editor.documentSourceBaselines).toEqual([])
    })
  })

  it('清除来源记录后挂起回包不写入', async () => {
    const { result, statQueue } = renderTracking()
    const deferred = createStatDeferred()
    statQueue.push(deferred)

    act(() => {
      result.current.rememberSourceAfterInsert(SOURCE_ABS)
      result.current.notifySourceRecordsCleared()
    })

    await act(async () => {
      deferred.resolve({ ok: true, data: { modifiedTime: 10 } })
    })

    await waitFor(() => {
      expect(result.current.settings.editor.documentSourceBaselines).toEqual([])
    })
  })

  it('卸载后挂起回包不写入', async () => {
    const statQueue: StatDeferred[] = []
    stubDesktopStat(statQueue)
    const setSettings = vi.fn()
    const { result, unmount } = renderHook(() =>
      useSourceTracking({
        workspacePath: WORKSPACE_A,
        citingDocumentKey: CITING_KEY,
        activeDocumentId: 'file-a',
        setWorkspaceSettings: setSettings,
      }),
    )
    const deferred = createStatDeferred()
    statQueue.push(deferred)

    act(() => {
      result.current.rememberSourceAfterInsert(SOURCE_ABS)
    })

    unmount()

    await act(async () => {
      deferred.resolve({ ok: true, data: { modifiedTime: 10 } })
    })

    expect(setSettings).not.toHaveBeenCalled()
  })

  it('stat reject 时不抛未处理 rejection 且不写入', async () => {
    const rejections: unknown[] = []
    const prev = process.listeners('unhandledRejection')
    process.removeAllListeners('unhandledRejection')
    process.on('unhandledRejection', (reason) => {
      rejections.push(reason)
    })

    const { result, statQueue } = renderTracking()
    const deferred = createStatDeferred()
    statQueue.push(deferred)

    act(() => {
      result.current.rememberSourceAfterInsert(SOURCE_ABS)
    })

    await act(async () => {
      deferred.reject(new Error('stat failed'))
    })

    await waitFor(() => {
      expect(result.current.settings.editor.documentSourceBaselines).toEqual([])
    })
    expect(rejections).toEqual([])

    process.removeAllListeners('unhandledRejection')
    for (const listener of prev) {
      process.on('unhandledRejection', listener as NodeJS.UnhandledRejectionListener)
    }
  })

  it('乱序回包时仅仍有效的请求会写入', async () => {
    const { result, statQueue } = renderTracking()
    const first = createStatDeferred()
    const second = createStatDeferred()
    statQueue.push(first, second)

    act(() => {
      result.current.rememberSourceAfterInsert(SOURCE_ABS)
      result.current.notifySourceRecordsCleared()
      result.current.rememberSourceAfterInsert(SOURCE_ABS)
    })

    await act(async () => {
      second.resolve({ ok: true, data: { modifiedTime: 20 } })
      first.resolve({ ok: true, data: { modifiedTime: 10 } })
    })

    await waitFor(() => {
      expect(result.current.settings.editor.documentSourceBaselines).toEqual([
        { citingDocumentPath: CITING_KEY, sourcePath: '资料/source.md', modifiedTime: 20 },
      ])
    })
  })

  it('没有工作区路径时不发起 stat', () => {
    const stat = vi.fn()
    vi.stubGlobal(
      'window',
      Object.assign(window, {
        desktopAPI: { platform: 'win32', document: { stat } },
      }),
    )
    const { result } = renderHook(() =>
      useSourceTracking({
        workspacePath: undefined,
        citingDocumentKey: CITING_KEY,
        activeDocumentId: 'file-a',
        setWorkspaceSettings: vi.fn(),
      }),
    )

    act(() => {
      result.current.rememberSourceAfterInsert(SOURCE_ABS)
    })

    expect(stat).not.toHaveBeenCalled()
  })
})
