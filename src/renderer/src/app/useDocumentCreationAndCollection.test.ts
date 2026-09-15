// @vitest-environment jsdom
import { useRef, useState } from 'react'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { EditorHandle } from '../components/Editor'
import { useDocumentCreationAndCollection } from './useDocumentCreationAndCollection'

describe('useDocumentCreationAndCollection', () => {
  it('模板写入新建会话并保持未保存，不写入原文档', () => {
    const { result } = renderHook(() => {
      const activeFileIdRef = useRef('old')
      const editorRef = useRef<EditorHandle>(null)
      const [contents, setContents] = useState<Record<string, string>>({ old: '原文' })
      const [savedMap, setSavedMap] = useState<Record<string, boolean>>({ old: true })
      const actions = useDocumentCreationAndCollection({
        activeFileIdRef, editorRef, handleNew: () => { activeFileIdRef.current = 'untitled-1' },
        setContents, setSavedMap, workspaceIndex: null, documents: {},
      })
      return { ...actions, contents, savedMap }
    })
    act(() => result.current.handleNewFromTemplate('readme'))
    expect(result.current.contents.old).toBe('原文')
    expect(result.current.savedMap.old).toBe(true)
    expect(result.current.contents['untitled-1']).toContain('# ')
    expect(result.current.savedMap['untitled-1']).toBe(false)
  })
})
