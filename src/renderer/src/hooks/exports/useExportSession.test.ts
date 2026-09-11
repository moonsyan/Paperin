// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MutableRefObject } from 'react'
import type { EditorHandle } from '../../components/Editor'
import {
  awaitRichContentForExport,
  runExclusiveExport,
  useExportSession,
} from './useExportSession'
import { createExportSession } from '../../lib/export-session'

const makeEditorRef = (
  overrides: Partial<EditorHandle> = {},
): MutableRefObject<EditorHandle | null> => ({
  current: {
    isReady: () => true,
    ensureRichContent: vi.fn(async () => {}),
    restoreExportViewport: vi.fn(),
    ...overrides,
  } as unknown as EditorHandle,
})

describe('useExportSession', () => {
  it('惰性初始化会话，重复渲染保持同一实例', () => {
    const { result, rerender } = renderHook(() => useExportSession())
    const first = result.current.exportSessionRef.current
    expect(first).not.toBeNull()
    expect(result.current.isExportActive()).toBe(false)
    rerender()
    expect(result.current.exportSessionRef.current).toBe(first)
  })

  it('isExportActive 反映会话状态', () => {
    const { result } = renderHook(() => useExportSession())
    expect(result.current.isExportActive()).toBe(false)
    result.current.exportSessionRef.current!.begin()
    expect(result.current.isExportActive()).toBe(true)
    result.current.exportSessionRef.current!.finish()
    expect(result.current.isExportActive()).toBe(false)
  })
})

describe('runExclusiveExport', () => {
  it('会话被占用时提示后跳过，不调用 fn 也不恢复视口', async () => {
    const session = createExportSession()
    session.begin()
    const editorRef = makeEditorRef()
    const setToast = vi.fn()
    const fn = vi.fn(async () => {})

    await runExclusiveExport(session, editorRef, setToast, '失败', fn)

    expect(fn).not.toHaveBeenCalled()
    expect(setToast).toHaveBeenCalledWith('已有导出任务正在进行')
    expect(editorRef.current!.restoreExportViewport).not.toHaveBeenCalled()
  })

  it('fn 成功后恢复视口并释放会话', async () => {
    const session = createExportSession()
    const editorRef = makeEditorRef()
    const setToast = vi.fn()

    await runExclusiveExport(session, editorRef, setToast, '失败', async () => {})

    expect(editorRef.current!.restoreExportViewport).toHaveBeenCalledOnce()
    expect(session.isActive()).toBe(false)
    expect(setToast).not.toHaveBeenCalled()
  })

  it('fn 抛错时使用兜底文案并释放会话', async () => {
    const session = createExportSession()
    const editorRef = makeEditorRef()
    const setToast = vi.fn()

    await runExclusiveExport(session, editorRef, setToast, '导出失败，请稍后重试', async () => {
      throw new Error('boom')
    })

    expect(setToast).toHaveBeenCalledWith('导出失败，请稍后重试')
    expect(editorRef.current!.restoreExportViewport).toHaveBeenCalledOnce()
    expect(session.isActive()).toBe(false)
  })

  it('fn 提前 return（例如切换文档取消）也保证 finally 清理', async () => {
    const session = createExportSession()
    const editorRef = makeEditorRef()
    const setToast = vi.fn()

    await runExclusiveExport(session, editorRef, setToast, '失败', async () => {
      setToast('已取消')
      return
    })

    expect(editorRef.current!.restoreExportViewport).toHaveBeenCalledOnce()
    expect(session.isActive()).toBe(false)
  })
})

describe('awaitRichContentForExport', () => {
  it('活动文档未变时返回 true', async () => {
    const editorRef = makeEditorRef()
    const activeFileIdRef: MutableRefObject<string> = { current: 'a' }
    await expect(awaitRichContentForExport(editorRef, activeFileIdRef)).resolves.toBe(true)
    expect(editorRef.current!.ensureRichContent).toHaveBeenCalledOnce()
  })

  it('等待期间用户切换标签则返回 false', async () => {
    const activeFileIdRef: MutableRefObject<string> = { current: 'a' }
    const editorRef = makeEditorRef({
      ensureRichContent: vi.fn(async () => {
        activeFileIdRef.current = 'b'
      }),
    })
    await expect(awaitRichContentForExport(editorRef, activeFileIdRef)).resolves.toBe(false)
  })

  it('编辑器尚未挂载时不抛错，直接比对 ref 值', async () => {
    const editorRef: MutableRefObject<EditorHandle | null> = { current: null }
    const activeFileIdRef: MutableRefObject<string> = { current: 'a' }
    await expect(awaitRichContentForExport(editorRef, activeFileIdRef)).resolves.toBe(true)
  })
})
