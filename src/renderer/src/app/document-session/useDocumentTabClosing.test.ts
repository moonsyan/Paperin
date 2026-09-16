// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_WORKSPACE_DOCUMENTS } from '../../../../shared/workspace-state'
import { DocumentSaveQueue } from '../../lib/document-save-queue'
import { useDocumentState } from './useDocumentState'
import { useDocumentTabClosing } from './useDocumentTabClosing'
import type { AutoSaveSnapshot } from './types'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('窗口关闭最终确认', () => {
  it.each(['queue', 'workspace', 'new-tab', 'pending', 'renamed', 'unchanged'])('等待 %s 后重新核对所有打开文档', async (phase) => {
    let pending = false
    const saveDocuments = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('window', Object.assign(window, { desktopAPI: { workspaceState: { saveDocuments } } }))
    const queue = new DocumentSaveQueue<AutoSaveSnapshot>(async () => {}, 1_000)
    const { result } = renderHook(() => {
      const state = useDocumentState()
      state.openFilesRef.current = [{ id: 'file-1', name: 'note.md', path: 'D:/notes/note.md' }]
      state.contentsRef.current = { 'file-1': '已确认版本' }
      state.activeFileIdRef.current = 'file-1'
      const closing = useDocumentTabClosing({
        state, editorRef: { current: { isReady: () => true, getMarkdown: () => '已确认版本', hasPendingChanges: () => pending } }, flushEditorContent: vi.fn(),
        replaceEditorContent: vi.fn(), pinPreviewTab: vi.fn(), dirOfFile: () => 'D:/notes',
        saveBeforeClose: vi.fn().mockResolvedValue(true), saveQueueRef: { current: queue },
        clearDraft: vi.fn().mockResolvedValue(undefined), draftPendingRef: { current: null },
        captureWorkspaceDocumentView: vi.fn(), setToast: vi.fn(),
        workspacePathRef: { current: 'D:/notes' }, workspaceDocumentsRef: { current: DEFAULT_WORKSPACE_DOCUMENTS },
      })
      return { state, closing }
    })
    const edit = () => { result.current.state.contentsRef.current['file-1'] = '等待期间新输入' }
    if (phase === 'queue') vi.spyOn(queue, 'flushAll').mockImplementation(async () => { edit() })
    if (phase === 'workspace') saveDocuments.mockImplementation(async () => { edit(); return { ok: true } })
    if (phase === 'pending') saveDocuments.mockImplementation(async () => { pending = true; return { ok: true } })
    if (phase === 'renamed') saveDocuments.mockImplementation(async () => {
      result.current.state.openFilesRef.current = [{ id: 'file-1', name: 'moved.md', path: 'D:/notes/moved.md' }]
      return { ok: true }
    })
    if (phase === 'new-tab') saveDocuments.mockImplementation(async () => {
      result.current.state.openFilesRef.current.push({ id: 'new', name: '未命名.md' })
      return { ok: true }
    })
    await expect(result.current.closing.saveAllBeforeWindowClose()).resolves.toBe(phase === 'unchanged')
    if (phase === 'queue' || phase === 'workspace') {
      expect(result.current.state.contentsRef.current['file-1']).toBe('等待期间新输入')
    }
  })
})
