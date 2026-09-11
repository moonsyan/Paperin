import { useCallback } from 'react'
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react'
import type { EditorHandle } from '../../components/Editor'
import type { ContextDockPanel } from '../../components/ContextDock/context-dock-state'
import type { HelpView } from '../../components/HelpDialog'
import type { AppCommandRegistry } from '../commands/app-command-registry'
import { resolveEditorAction } from '../editorActions'

/**
 * 打开原生对话框的动作：不能在对话框打开前同步 focus——焦点先被菜单按钮
 * 拿走，同步 focus 又被对话框打断，取消后焦点落在窗口 chrome 上。改为等
 * promise 结束（对话框关闭）再聚焦：成功路径自身会聚焦编辑器，这里补
 * 取消对话框的路径。
 */
const NATIVE_DIALOG_ACTIONS = new Set([
  'open',
  'openFolder',
  'saveAs',
  'exportHtml',
  'exportMarkdown',
  'exportDocx',
  'exportPandoc',
])

/** 打开这些动作时不需要事后聚焦编辑器（它们各自有对话框/面板接管焦点） */
const SKIP_FOCUS_ACTIONS = new Set([
  'find',
  'replace',
  'wsSearch',
  'images',
  'exportPdf',
  'shortcuts',
  'markdown',
  'about',
  'stats',
  'settings',
  'publish',
  'versionHistory',
])

/**
 * 统一动作分发：菜单、快捷键和命令面板最终都落到 handleAction。
 *
 * 分发优先级：
 * 1. 命令注册表已登记（save / layout.preset.*）→ 走 runCommand，与命令面板同源；
 * 2. 编辑器命令（撤销/格式/段落/表格）→ resolveEditorAction；
 * 3. 应用层动作 → switch/case；
 * 4. 参数化动作（newTemplate:* / openRecent:*）→ 前缀匹配。
 *
 * 独立成 hook 的原因：这是应用最大的分发中心，混在 useAppActions 里会撑爆
 * 行数门禁；后续把 switch/case 逐项迁到命令注册表时，只改本文件即可。
 */
export function useActionDispatcher({
  editorRef,
  commandRegistry,
  runCommand,
  activeFileId,
  activeFileIdRef,
  workspacePathRef,
  setToast,
  centerCaret,
  /* 会话动作 */
  handleNew,
  handleOpen,
  handleOpenFolder,
  handleSaveAs,
  handleCloseTab,
  handleCloseOtherTabs,
  handleCloseAllTabs,
  handleSelectWorkspaceFile,
  handleNewFromTemplate,
  /* 导出 */
  handleExportHtml,
  handleExportMarkdown,
  handleExportPandoc,
  handleExportDocx,
  setPdfOptsOpen,
  /* 面板与视图 */
  openOutlinePanel,
  openContextPanel,
  handleOpenVersionHistory,
  openGraphView,
  setSearchMode,
  setImagesOpen,
  setPublishOpen,
  setWsSearchOpen,
  setPaletteOpen,
  setSettingsOpen,
  setHelpView,
  setSidebarCollapsed,
  setFocusMode,
  setPreviewMode,
  setTypewriter,
  setZoom,
}: {
  editorRef: RefObject<EditorHandle>
  commandRegistry: AppCommandRegistry | null
  runCommand: (id: string) => Promise<boolean>
  activeFileId: string
  activeFileIdRef: MutableRefObject<string>
  workspacePathRef: MutableRefObject<string | undefined>
  setToast: (message: string) => void
  centerCaret: () => void
  handleNew: () => void
  handleOpen: () => Promise<void>
  handleOpenFolder: () => Promise<void>
  handleSaveAs: () => Promise<void>
  handleCloseTab: (id: string) => Promise<void>
  handleCloseOtherTabs: (id: string) => void
  handleCloseAllTabs: () => void
  handleSelectWorkspaceFile: (path: string, pinned?: boolean) => Promise<boolean>
  handleNewFromTemplate?: (template: 'readme' | 'api' | 'design' | 'changelog') => void
  handleExportHtml: () => Promise<void>
  handleExportMarkdown: () => Promise<void>
  handleExportPandoc: () => Promise<void>
  handleExportDocx: () => Promise<void>
  setPdfOptsOpen: Dispatch<SetStateAction<boolean>>
  openOutlinePanel: () => void
  openContextPanel: (panel: ContextDockPanel) => void
  handleOpenVersionHistory: () => void
  openGraphView: () => void
  setSearchMode: (mode: 'find' | 'replace' | 'none') => void
  setImagesOpen: Dispatch<SetStateAction<boolean>>
  setPublishOpen: Dispatch<SetStateAction<boolean>>
  setWsSearchOpen: Dispatch<SetStateAction<boolean>>
  setPaletteOpen: Dispatch<SetStateAction<boolean>>
  setSettingsOpen: Dispatch<SetStateAction<boolean>>
  setHelpView: Dispatch<SetStateAction<HelpView>>
  setSidebarCollapsed: Dispatch<SetStateAction<boolean>>
  setFocusMode: Dispatch<SetStateAction<boolean>>
  setPreviewMode: Dispatch<SetStateAction<boolean>>
  setTypewriter: Dispatch<SetStateAction<boolean>>
  setZoom: Dispatch<SetStateAction<number>>
}) {
  /** 导出 PDF：先弹选项窗（纸张/页边距/页眉页脚） */
  const handleExportPdf = useCallback(() => {
    setPdfOptsOpen(true)
  }, [setPdfOptsOpen])

  const handleAction = useCallback(
    (action: string) => {
      const ed = editorRef.current
      const shouldFocusEditor = !SKIP_FOCUS_ACTIONS.has(action)

      // 注册表已登记的命令（save、layout.preset.* 等）统一优先走注册表，
      // 与快捷键/命令面板共享同一 execute；未登记的动作保留原 switch 分发
      const registeredCommand = commandRegistry?.get(action)
      if (registeredCommand) {
        void runCommand(action)
        // 命令不经对话框收尾逻辑，仅补普通路径的编辑器聚焦（与原 case 行为一致）
        if (shouldFocusEditor) ed?.focus()
        return
      }

      // 编辑器命令类动作（撤销/格式/段落/表格等）统一走共享命令表，
      // 与全局快捷键分发同源；其余应用层动作用 switch 处理
      const editorAction = resolveEditorAction(action)
      if (editorAction) {
        editorAction(ed)
      } else {
        switch (action) {
          // 文件
          case 'new': handleNew(); break
          case 'newWindow': void window.desktopAPI?.window.newWindow(); break
          case 'images': setImagesOpen(true); break
          // 保存已迁移至命令注册表：菜单 / 快捷键 / 命令面板共享同一 execute
          case 'save': void runCommand('save'); break
          case 'closeTab': handleCloseTab(activeFileId); break
          case 'closeOtherTabs': handleCloseOtherTabs(activeFileIdRef.current); break
          case 'closeAllTabs': handleCloseAllTabs(); break
          case 'exportPdf': handleExportPdf(); break
          case 'publish': setPublishOpen(true); break
          case 'newTemplate:readme':
          case 'newTemplate:api':
          case 'newTemplate:design':
          case 'newTemplate:changelog':
            handleNewFromTemplate?.(action.slice('newTemplate:'.length) as 'readme' | 'api' | 'design' | 'changelog')
            break
          case 'find': setSearchMode('find'); break
          case 'replace': setSearchMode('replace'); break
          case 'wsSearch':
            // 用 ref 镜像而非 workspace 状态：handleAction 依赖数组不含 workspace，
            // 直接读状态会因陈旧闭包导致打开文件夹后菜单仍提示未打开
            if (workspacePathRef.current) setWsSearchOpen(true)
            else setToast('请先打开文件夹（工作区）后再使用全文搜索')
            break
          case 'commandPalette': setPaletteOpen(true); break
          case 'versionHistory': handleOpenVersionHistory(); break
          // 视图
          case 'toggleSidebar': setSidebarCollapsed((v) => !v); break
          case 'toggleFocus': setFocusMode((v) => !v); break
          case 'togglePreview': setPreviewMode((v) => !v); break
          case 'zoomIn': setZoom((z) => Math.min(1.8, +(z + 0.1).toFixed(2))); break
          case 'zoomOut': setZoom((z) => Math.max(0.7, +(z - 0.1).toFixed(2))); break
          case 'zoomReset': setZoom(1); break
          case 'typewriter':
            setTypewriter((v) => {
              const next = !v
              if (next) setTimeout(centerCaret, 0)
              return next
            })
            break
          case 'outline': openOutlinePanel(); break
          case 'linksPanel': openContextPanel('links'); break
          case 'tagsPanel': openContextPanel('tags'); break
          case 'propertiesPanel': openContextPanel('properties'); break
          case 'qualityPanel': openContextPanel('quality'); break
          case 'graph': openGraphView(); break
          // 帮助
          case 'shortcuts': setHelpView('shortcuts'); break
          case 'markdown': setHelpView('syntax'); break
          case 'about': setHelpView('about'); break
          case 'stats': setHelpView('stats'); break
          case 'settings': setSettingsOpen(true); break
          default:
            if (action.startsWith('openRecent:')) {
              const p = action.slice('openRecent:'.length)
              void handleSelectWorkspaceFile(p)
            }
            break
        }
      }

      // L20：打开原生对话框的动作等 promise 结束（对话框关闭）再聚焦编辑器，
      // 避免焦点被对话框打断后落在窗口 chrome 上
      if (shouldFocusEditor) {
        if (NATIVE_DIALOG_ACTIONS.has(action)) {
          void (async () => {
            switch (action) {
              case 'open': await handleOpen(); break
              case 'openFolder': await handleOpenFolder(); break
              case 'saveAs': await handleSaveAs(); break
              case 'exportHtml': await handleExportHtml(); break
              case 'exportMarkdown': await handleExportMarkdown(); break
              case 'exportDocx': await handleExportDocx(); break
              case 'exportPandoc': await handleExportPandoc(); break
              default: break
            }
            ed?.focus()
          })()
        } else {
          ed?.focus()
        }
      }
    },
    [
      activeFileId,
      activeFileIdRef,
      centerCaret,
      commandRegistry,
      editorRef,
      handleCloseAllTabs,
      handleCloseOtherTabs,
      handleCloseTab,
      handleExportDocx,
      handleExportHtml,
      handleExportMarkdown,
      handleExportPandoc,
      handleExportPdf,
      handleNew,
      handleNewFromTemplate,
      handleOpen,
      handleOpenFolder,
      handleOpenVersionHistory,
      handleSaveAs,
      handleSelectWorkspaceFile,
      openContextPanel,
      openGraphView,
      openOutlinePanel,
      runCommand,
      setFocusMode,
      setHelpView,
      setImagesOpen,
      setPaletteOpen,
      setPreviewMode,
      setPublishOpen,
      setSearchMode,
      setSettingsOpen,
      setSidebarCollapsed,
      setToast,
      setTypewriter,
      setWsSearchOpen,
      setZoom,
      workspacePathRef,
    ],
  )

  return { handleAction, handleExportPdf }
}
