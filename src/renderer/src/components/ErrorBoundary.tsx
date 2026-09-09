import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

/* ==================== 顶层错误边界 ====================
 *
 * React 18 未捕获的渲染错误会卸载整棵组件树——表现就是整页空白/黑屏、
 * 所有按钮失效，用户只能强杀进程。加顶层边界后降级为可见的错误页，
 * 提供一键重载（会走会话恢复，未保存内容有草稿兜底）。
 */

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 控制台保留完整堆栈（含组件栈），便于开发排查
    console.error('界面渲染异常', error, info.componentStack)
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-app, #F7F5F2)',
          color: 'var(--text-1, #1D1B18)',
          fontFamily:
            "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 480,
            background: 'var(--bg-surface, #FFFFFF)',
            border: '1px solid rgba(0,0,0,.08)',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,.08)',
            padding: '28px 32px',
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            界面遇到了异常
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-2, #5C5850)', marginBottom: 16 }}>
            重新加载后会自动恢复上次的文件与未保存草稿。
            <div
              style={{
                marginTop: 10,
                fontSize: 12,
                fontFamily: 'monospace',
                color: 'var(--text-3, #9C978E)',
                wordBreak: 'break-all',
                maxHeight: 120,
                overflow: 'auto',
              }}
            >
              {String(error.message ?? error)}
            </div>
          </div>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              padding: '8px 20px',
              fontSize: 13,
              color: '#fff',
              background: 'var(--accent, #7C6F5B)',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            重新加载
          </button>
        </div>
      </div>
    )
  }
}
