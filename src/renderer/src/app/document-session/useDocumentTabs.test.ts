// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_WORKSPACE_DOCUMENTS } from '../../../../shared/workspace-state'
import { DocumentSaveQueue } from '../../lib/document-save-queue'
import { SNAPSHOT_SETTLE_TIMEOUT_MS } from './ensure-snapshot'
import { useDocumentState } from './useDocumentState'
import { useDocumentTabs } from './useDocumentTabs'
import type { AutoSaveSnapshot } from './types'
import type { EditorHandle } from '../../components/Editor'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('切换标签等待大文档快照', () => {
  it('大文档仍有未落账输入时不替换编辑器', async () => {
    vi.useFakeTimers()
    const replaceEditorContent = vi.fn()
    const setToast = vi.fn()
    const large = 'x'.repeat(1_000_001)
    const editor = {
      isReady: () => true,
      getMarkdown: () => large,
      hasPendingChanges: () => true,
      replaceContent: vi.fn(),
      consumeDirtyChange: () => false,
      endSearch: vi.fn(),
      getViewState: () => null,
    } as unknown as EditorHandle
    const { result } = renderHook(() => {
      const state = useDocumentState()
      state.openFilesRef.current = [
        { id: 'file-a', name: 'a.md', path: 'D:/notes/a.md' },
        { id: 'file-b', name: 'b.md', path: 'D:/notes/b.md' },
      ]
      state.contentsRef.current = { 'file-a': large, 'file-b': '# b' }
      state.activeFileIdRef.current = 'file-a'
      return useDocumentTabs({
        state,
        editorRef: { current: editor },
        titleRef: { current: null },
        flushEditorContent: vi.fn(),
        replaceEditorContent,
        pinPreviewTab: vi.fn(),
        dirOfFile: () => 'D:/notes',
        saveBeforeClose: vi.fn().mockResolvedValue(true),
        saveQueueRef: { current: new DocumentSaveQueue<AutoSaveSnapshot>(async () => {}, 1_000) },
        clearDraft: vi.fn().mockResolvedValue(undefined),
        draftPendingRef: { current: null },
        focusEditorSoon: vi.fn(),
        recordRecent: vi.fn(),
        setToast,
        workspacePathRef: { current: 'D:/notes' },
        workspaceDocumentsRef: { current: DEFAULT_WORKSPACE_DOCUMENTS },
        setWorkspaceDocuments: vi.fn(),
        latestWorkspaceSelectionRef: { current: '' },
        openingWorkspaceFilesRef: { current: new Map() },
      })
    })
    const pending = result.current.switchFile('file-b')
    await vi.advanceTimersByTimeAsync(SNAPSHOT_SETTLE_TIMEOUT_MS)
    await pending
    expect(replaceEditorContent).not.toHaveBeenCalled()
    expect(setToast).toHaveBeenCalledWith('大文档仍有未落账输入，已取消切换')
  })
})
