// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useState } from 'react'
import { DEFAULT_WORKSPACE_SETTINGS } from '../../../shared/workspace-state'
import { useWorkspaceSourcePathRemap } from './useWorkspaceSourcePathRemap'

describe('useWorkspaceSourcePathRemap', () => {
  it('把持久化与 ephemeral 来源路径一并 remap', () => {
    const remapEphemeral = vi.fn()
    const { result } = renderHook(() => {
      const [settings, setSettings] = useState(() => ({
        ...DEFAULT_WORKSPACE_SETTINGS,
        editor: {
          ...DEFAULT_WORKSPACE_SETTINGS.editor,
          documentSourceBaselines: [
            {
              citingDocumentPath: '文章/a.md',
              sourcePath: '资料/s.md',
              modifiedTime: 1,
            },
          ],
        },
      }))
      const onRemap = useWorkspaceSourcePathRemap({
        workspacePath: 'D:/notes',
        setWorkspaceSettings: setSettings,
        remapEphemeralSourcePaths: remapEphemeral,
      })
      return { settings, onRemap }
    })

    Object.defineProperty(window, 'desktopAPI', {
      configurable: true,
      value: { platform: 'win32' },
    })

    act(() => {
      result.current.onRemap('D:/notes/资料/s.md', 'D:/notes/归档/s.md')
    })

    expect(remapEphemeral).toHaveBeenCalledWith('资料/s.md', '归档/s.md', true)
    expect(result.current.settings.editor.documentSourceBaselines).toEqual([
      {
        citingDocumentPath: '文章/a.md',
        sourcePath: '归档/s.md',
        modifiedTime: 1,
      },
    ])
  })
})
