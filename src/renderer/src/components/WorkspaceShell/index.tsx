import type { ReactNode, JSX } from 'react'

export interface WorkspaceShellProps {
  workspacePath?: string | null
  children: ReactNode
}

export interface WorkspaceContextProps {
  workspaceName: string
  workspacePath?: string | null
  /**
   * 是否显示库名文字（NEXT-UI-SPEC §3.1）：库名的常驻展示集中在侧栏标题，
   * 侧栏收起时顶栏才承担简短库名。默认 true 保持向后兼容；
   * false 时只保留状态点与「本地/未打开」标，库名仍保留在无障碍名中。
   */
  showName?: boolean
}

/**
 * 工作区上下文点：顶栏左区的一枚状态指示。
 *
 * 原 `.workspace-shell-context` 是 38px 的独立横条，与顶栏、当前文件条、标签栏
 * 四层堆叠，把正文首屏压掉约 124px。收敛后工作区名与「本地/未打开」标随顶栏呈现，
 * 完整路径保留在 title 与无障碍名中。
 */
export function WorkspaceContext({ workspaceName, workspacePath = null, showName = true }: WorkspaceContextProps): JSX.Element {
  const hasWorkspace = Boolean(workspacePath)

  return (
    <div
      className={`workspace-context ${hasWorkspace ? 'is-open' : 'is-empty'}`}
      data-workspace-state={hasWorkspace ? 'open' : 'empty'}
      title={workspacePath ?? '尚未打开知识库'}
      aria-label={`当前工作区：${workspaceName}${hasWorkspace ? '' : '（尚未打开知识库）'}`}
    >
      <span className="workspace-context-dot" aria-hidden="true" />
      {showName && <span className="workspace-context-name">{workspaceName}</span>}
      <span className="workspace-context-label">{hasWorkspace ? '本地' : '未打开'}</span>
    </div>
  )
}

/**
 * 知识库壳层：承载工作区主体（侧栏 + 编辑器 + 上下文面板）。
 *
 * 职责边界：只提供 `role="region"` 语义与 open/empty 状态，
 * 不再自绘上下文横条（已收敛入顶栏的 WorkspaceContext）。
 */
export function WorkspaceShell({ workspacePath = null, children }: WorkspaceShellProps): JSX.Element {
  const hasWorkspace = Boolean(workspacePath)

  return (
    <section
      className="workspace-shell"
      role="region"
      aria-label="工作区"
      data-workspace-state={hasWorkspace ? 'open' : 'empty'}
    >
      <div className="workspace-shell-body">{children}</div>
    </section>
  )
}
