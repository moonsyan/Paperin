/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useWorkspaceSearch } from './useWorkspaceSearch'
import { createEmptyWorkspaceIndex } from '../../../../shared/workspace-index'
import { createInitialWorkspaceCoverage, markWorkspaceCoverageIncomplete } from '../../../../shared/workspace-coverage'

describe('useWorkspaceSearch', () => {
  beforeEach(() => {
    window.desktopAPI = {
      workspace: {
        search: vi.fn(),
      },
    } as unknown as Window['desktopAPI']
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('未扫完时空结果使用 coverage 提示而非确定无匹配', async () => {
    const coverage = createInitialWorkspaceCoverage()
    markWorkspaceCoverageIncomplete(coverage)
    coverage.skipped['file-size'] = 1
    vi.mocked(window.desktopAPI!.workspace.search).mockResolvedValue({
      ok: true,
      data: {
        matches: [],
        coverage,
        truncated: true,
        scanTruncated: true,
        matchCapped: false,
      },
    })

    const { result } = renderHook(() =>
      useWorkspaceSearch({
        open: true,
        workspacePath: 'D:/vault',
        workspaceIndex: null,
        initialQuery: 'missing',
      }),
    )

    await act(async () => {
      result.current.setQuery('missing')
      await result.current.doSearch()
    })

    await waitFor(() => expect(result.current.searched).toBe(true))
    expect(result.current.matches).toHaveLength(0)
    expect(result.current.coverage.coverage?.complete).toBe(false)
  })

  it('关闭面板时发送 cancel 并丢弃过期响应', async () => {
    const searchMock = vi.mocked(window.desktopAPI!.workspace.search)
    let resolveLate: ((value: unknown) => void) | undefined
    searchMock.mockImplementation((_dir, _query, _cs, _rx, options) => {
      if (options?.cancel) {
        return Promise.resolve({
          ok: true,
          data: { matches: [], coverage: createInitialWorkspaceCoverage(), truncated: false },
        })
      }
      return new Promise((resolve) => {
        resolveLate = resolve as (value: unknown) => void
      })
    })

    const { result, rerender } = renderHook(
      ({ open }) =>
        useWorkspaceSearch({
          open,
          workspacePath: 'D:/vault',
          workspaceIndex: null,
          initialQuery: '',
        }),
      { initialProps: { open: true } },
    )

    await act(async () => {
      result.current.setQuery('late')
      void result.current.doSearch()
    })

    rerender({ open: false })
    expect(searchMock).toHaveBeenCalledWith('D:/vault', '', false, false, expect.objectContaining({ cancel: true }))

    await act(async () => {
      resolveLate?.({
        ok: true,
        data: {
          matches: [{ path: 'D:/vault/stale.md', line: 1, preview: 'stale' }],
          coverage: createInitialWorkspaceCoverage(),
          truncated: false,
        },
      })
    })

    expect(result.current.matches).toHaveLength(0)
  })

  it('结构化搜索沿用索引 coverage', async () => {
    const index = createEmptyWorkspaceIndex('D:/vault')
    index.complete = true
    index.coverage = createInitialWorkspaceCoverage()
    const { result } = renderHook(() =>
      useWorkspaceSearch({
        open: true,
        workspacePath: 'D:/vault',
        workspaceIndex: index,
        initialQuery: 'tag:demo',
      }),
    )

    await act(async () => {
      result.current.setQuery('tag:demo')
      await result.current.doSearch()
    })

    expect(result.current.coverage.coverage?.complete).toBe(true)
    expect(window.desktopAPI!.workspace.search).not.toHaveBeenCalled()
  })
})
