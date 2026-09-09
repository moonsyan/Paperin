import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
/* ProseMirror 基础样式（选区 / GapCursor / 表格） */
import '@milkdown/kit/prose/view/style/prosemirror.css'
import '@milkdown/kit/prose/gapcursor/style/gapcursor.css'
import '@milkdown/kit/prose/tables/style/tables.css'
/* KaTeX 公式排版样式 */
import 'katex/dist/katex.min.css'
import './styles/global.css'
import './styles/variables.css'
import './styles/typography.css'
import './styles/themes/default.css'
import './styles/themes/dark.css'
import './styles/themes/ocean.css'
import './styles/themes/rose.css'
import './styles/themes/github.css'
import './styles/themes/atom.css'
import './styles/themes/typewriter.css'
import './styles/components/sidebar.css'
import './styles/components/editor.css'
import './styles/components/menubar.css'
import './styles/components/statusbar.css'
import './styles/components/searchbar.css'
import './styles/components/settings.css'
import './styles/components/helpdialog.css'
import './styles/components/imagesdialog.css'
import './styles/components/graph-view.css'
import './styles/components/tabbar.css'
import './styles/components/commandpalette.css'
import './styles/components/versionhistory.css'
import './styles/components/quality-panel.css'
import './styles/components/publishdialog.css'
import './styles/components/context-dock.css'
import './styles/components/workspace-shell.css'

// 平台标识：顶栏按平台避让系统窗口按钮区域
document.documentElement.setAttribute(
  'data-platform',
  window.desktopAPI?.platform ?? 'browser',
)

// 全局关闭拼写检查（兜底：即使浏览器级检查器开启也不出红色波浪线）
document.documentElement.setAttribute('spellcheck', 'false')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
