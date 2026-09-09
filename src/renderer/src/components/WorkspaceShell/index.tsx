import type { ReactNode, JSX } from 'react'

export interface WorkspaceShellProps {
  workspaceName: string
  workspacePath?: string | null
  children: ReactNode
}

export function WorkspaceShell({ workspaceName, workspacePath = null, children }: WorkspaceShellProps): JSX.Element {
  const hasWorkspace = Boolean(workspacePath)

  return (
    <section
      className="workspace-shell"
      role="region"
      aria-label="工作区"
      data-workspace-state={hasWorkspace ? 'open' : 'empty'}
    >
      <header className="workspace-shell-context">
        <div className="workspace-shell-context-copy">
          <span className="workspace-shell-kicker">知识库工作区</span>
          <strong className="workspace-shell-name">{workspaceName}</strong>
        </div>
        <span className="workspace-shell-path" title={workspacePath ?? '尚未打开知识库'}>
          {workspacePath ?? '尚未打开知识库'}
        </span>
      </header>
      <div className="workspace-shell-body">{children}</div>
    </section>
  )
}
