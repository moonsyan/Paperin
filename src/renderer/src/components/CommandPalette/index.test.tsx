// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CommandPalette } from './index'
import { createAppCommandRegistry } from '../../app/commands/app-command-registry'
import type { CommandContext } from '../../app/commands/command-context'

afterEach(cleanup)
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

const context: CommandContext = {
  activeFileId: 'file-a',
  workspaceId: 'workspace-a',
  hasWorkspace: true,
  hasUnsavedChanges: false,
  source: 'document',
}

describe('CommandPalette registry integration', () => {
  it('shows a registered command in command mode and dispatches its id', () => {
    const onRunCommand = vi.fn()
    const registry = createAppCommandRegistry()
    registry.register({ id: 'workspace.refresh', title: '刷新工作区', enabled: () => true, execute: vi.fn() })

    render(
      <CommandPalette
        open
        workspace={null}
        recentFiles={[]}
        onClose={vi.fn()}
        onSelectWorkspace={vi.fn()}
        onSelectDemo={vi.fn()}
        onRunCommand={onRunCommand}
        commandRegistry={registry}
        commandContext={context}
      />,
    )

    const input = screen.getByRole('textbox', { name: /快速打开/ })
    fireEvent.change(input, { target: { value: '> 刷新' } })
    expect(screen.getByRole('button', { name: /刷新工作区/ })).toBeTruthy()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRunCommand).toHaveBeenCalledWith('workspace.refresh')
  })
})
