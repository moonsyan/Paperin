import { useState, useEffect, useRef, useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { RecentFile } from '../components/MenuBar'
import type { WritingStats } from '../components/HelpDialog'
import type { ShortcutMap } from '../data/shortcuts'
import { DEFAULT_SHORTCUTS, mergeShortcuts } from '../data/shortcuts'
import type { DraftMap } from '../lib/drafts'
import { rollStatsDate, EMPTY_STATS } from '../lib/stats'
import { usePersistedSetting } from '../hooks/usePersistedSetting'
import type { ContextDockPanel, ContextDockState } from '../components/ContextDock/context-dock-state'
import type { GraphSettings } from '../components/GraphView'
import { DEFAULT_GRAPH_SETTINGS } from '../components/GraphView'
import type { SidebarView } from '../../../shared/workspace-state'
import { DEMO_TREE_SCOPE, FRESH_MODE } from './constants'
import type { SessionData } from '../hooks/useDocumentSessionPersistence'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AppSettingsState {
  shortcuts: ShortcutMap
  blankClickToEnd: boolean
  codeLineNumbers: boolean
  customCss: { name: string; content: string } | null
  exportCss: { name: string; content: string } | null
  imageHost: { provider: 'local' | 'smms'; configured: boolean }
  globalAttachmentDirectory: string
  spellcheckLang: string
  graphSettings: GraphSettings
  collapseFoldersOnOpen: boolean
  showFrontmatterProps: boolean
  wordGoal: number | null
  wordGoalOverrides: Record<string, number | null>
}

export interface AppSettingsActions {
  setShortcuts: Dispatch<SetStateAction<ShortcutMap>>
  setBlankClickToEnd: Dispatch<SetStateAction<boolean>>
  setCodeLineNumbers: Dispatch<SetStateAction<boolean>>
  setCustomCss: Dispatch<SetStateAction<{ name: string; content: string } | null>>
  setExportCss: Dispatch<SetStateAction<{ name: string; content: string } | null>>
  setImageHost: Dispatch<SetStateAction<{ provider: 'local' | 'smms'; configured: boolean }>>
  setGlobalAttachmentDirectory: Dispatch<SetStateAction<string>>
  setSpellcheckLang: Dispatch<SetStateAction<string>>
  setGraphSettings: Dispatch<SetStateAction<GraphSettings>>
  setCollapseFoldersOnOpen: Dispatch<SetStateAction<boolean>>
  setShowFrontmatterProps: Dispatch<SetStateAction<boolean>>
  setWordGoal: Dispatch<SetStateAction<number | null>>
  setWordGoalOverrides: Dispatch<SetStateAction<Record<string, number | null>>>
}

export interface UseAppSettingsOptions {
  // 外部状态 setter（由 useEditorViewState / useWorkspaceState 提供）
  setTheme: Dispatch<SetStateAction<string>>
  setAutosave: Dispatch<SetStateAction<boolean>>
  setSpellcheck: Dispatch<SetStateAction<boolean>>
  setMultiWindow: Dispatch<SetStateAction<boolean>>
  setFontSize: Dispatch<SetStateAction<number>>
  setContentWidth: Dispatch<SetStateAction<number>>
  setLineHeight: Dispatch<SetStateAction<number>>
  setContentFont: Dispatch<SetStateAction<'default' | 'serif' | 'mono'>>
  setZoom: Dispatch<SetStateAction<number>>
  setSidebarWidth: Dispatch<SetStateAction<number>>
  setSidebarActiveTab: Dispatch<SetStateAction<SidebarView>>
  setContextDockState: Dispatch<SetStateAction<ContextDockState>>
  setSidebarCollapsedKeys: (keys: Record<string, string[]> | null) => void
  setSearchPref: Dispatch<SetStateAction<{
    query: string
    useRegex: boolean
    caseSensitive: boolean
    wholeWord: boolean
    replacement: string
  }>>
  setRecentFiles: Dispatch<SetStateAction<RecentFile[]>>
  setWritingStats: Dispatch<SetStateAction<WritingStats>>
  restoreFromSessionData: (session: SessionData | null, drafts: DraftMap) => Promise<void>
  setToast: (message: string) => void
  // 持久化所需的当前值（用于 usePersistedSetting）
  theme: string
  autosave: boolean
  spellcheck: boolean
  multiWindow: boolean
  fontSize: number
  contentWidth: number
  lineHeight: number
  contentFont: 'default' | 'serif' | 'mono'
  zoom: number
  sidebarWidth: number
}

export interface UseAppSettingsResult extends AppSettingsState, AppSettingsActions {
  settingsReady: boolean
  handleImageHostProviderChange: (provider: 'local' | 'smms') => Promise<void>
  handleImageHostTokenSave: (token: string) => Promise<boolean>
  handleImportCss: () => Promise<void>
  handleRemoveCss: () => void
  handleImportExportCss: () => Promise<void>
  handleRemoveExportCss: () => void
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * 应用设置的完整生命周期：启动加载 → 运行时状态 → 变更持久化。
 *
 * 职责边界：
 * - 从主进程批量读取所有设置并分发到对应 setter
 * - 管理仅属于设置域的本地状态（快捷键、图床、CSS 等）
 * - 通过 usePersistedSetting 将变更防抖写回主进程
 * - 处理自定义 CSS 的 DOM 注入/移除
 *
 * 不包含：主题切换的 DOM 属性同步（由调用方处理，因为依赖 effectiveTheme 计算）
 */
export function useAppSettings({
  setTheme,
  setAutosave,
  setSpellcheck,
  setMultiWindow,
  setFontSize,
  setContentWidth,
  setLineHeight,
  setContentFont,
  setZoom,
  setSidebarWidth,
  setSidebarActiveTab,
  setContextDockState,
  setSidebarCollapsedKeys,
  setSearchPref,
  setRecentFiles,
  setWritingStats,
  restoreFromSessionData,
  setToast,
  theme,
  autosave,
  spellcheck,
  multiWindow,
  fontSize,
  contentWidth,
  lineHeight,
  contentFont,
  zoom,
  sidebarWidth,
}: UseAppSettingsOptions): UseAppSettingsResult {
  const [settingsReady, setSettingsReady] = useState(false)
  const initRef = useRef(false)

  // --- 设置域本地状态 ---
  const [shortcuts, setShortcuts] = useState<ShortcutMap>({ ...DEFAULT_SHORTCUTS })
  const [blankClickToEnd, setBlankClickToEnd] = useState(true)
  const [codeLineNumbers, setCodeLineNumbers] = useState(false)
  const [customCss, setCustomCss] = useState<{ name: string; content: string } | null>(null)
  const [exportCss, setExportCss] = useState<{ name: string; content: string } | null>(null)
  const [imageHost, setImageHost] = useState<{ provider: 'local' | 'smms'; configured: boolean }>({
    provider: 'local',
    configured: false,
  })
  const [globalAttachmentDirectory, setGlobalAttachmentDirectory] = useState('attachments')
  const [spellcheckLang, setSpellcheckLang] = useState('en-US')
  const [graphSettings, setGraphSettings] = useState<GraphSettings>(DEFAULT_GRAPH_SETTINGS)
  const [collapseFoldersOnOpen, setCollapseFoldersOnOpen] = useState(true)
  const [showFrontmatterProps, setShowFrontmatterProps] = useState(true)
  const [wordGoal, setWordGoal] = useState<number | null>(null)
  const [wordGoalOverrides, setWordGoalOverrides] = useState<Record<string, number | null>>({})

  // --- 启动初始化：批量读取所有设置 ---
  useEffect(() => {
    if (initRef.current) return
    initRef.current = true
    if (!window.desktopAPI) {
      setSettingsReady(true)
      return
    }
    const api = window.desktopAPI.settings
    Promise.all([
      api.get('theme'),
      api.get('attachmentDirectory'),
      api.get('autosave'),
      api.get('spellcheck'),
      api.get('multiWindow'),
      api.get('fontSize'),
      api.get('zoom'),
      api.get('sidebarWidth'),
      api.get('contentWidth'),
      api.get('lineHeight'),
      api.get('contentFont'),
      api.get('writingStats'),
      api.get('recentFiles'),
      api.get('shortcuts'),
      api.get('session'),
      api.get('drafts'),
      api.get('searchState'),
      api.get('blankClickToEnd'),
      api.get('codeLineNumbers'),
      api.get('customCss'),
      api.get('exportCss'),
      window.desktopAPI.imageHost.getStatus(),
      api.get('spellcheckLang'),
      api.get('sidebarCollapsedKeys'),
      api.get('sidebarActiveTab'),
      api.get('showFrontmatterProps'),
      api.get('graphSettings'),
      api.get('collapseFoldersOnOpen'),
      api.get('wordGoal'),
      api.get('wordGoalOverrides'),
    ])
      .then(async ([t, ad, a, sp, mw, f, z, sw, cw, lh, cf, ws, rf, sc, s, dr, srch, bce, cln, ccs, ecss, ih, scl, sck, sat, sfmp, gset, cfo, wg, wgo]) => {
        if (t?.ok && typeof t.data === 'string') setTheme(t.data)
        if (ad?.ok && typeof ad.data === 'string') {
          setGlobalAttachmentDirectory(ad.data.trim() || 'attachments')
        }
        if (a?.ok && typeof a.data === 'boolean') setAutosave(a.data)
        if (sp?.ok && typeof sp.data === 'boolean') setSpellcheck(sp.data)
        if (mw?.ok && typeof mw.data === 'boolean') setMultiWindow(mw.data)
        if (f?.ok) {
          const v = typeof f.data === 'number' ? f.data
            : f.data === 'sm' ? 14 : f.data === 'lg' ? 18 : 16
          setFontSize(v)
        }
        if (z?.ok && typeof z.data === 'number') {
          setZoom(Math.min(1.8, Math.max(0.7, z.data)))
        }
        if (sw?.ok && typeof sw.data === 'number') {
          setSidebarWidth(Math.min(480, Math.max(180, sw.data)))
        }
        if (cw?.ok) {
          const v = typeof cw.data === 'number' ? cw.data
            : cw.data === 'narrow' ? 640 : cw.data === 'wide' ? 1200 : 900
          setContentWidth(v)
        }
        if (lh?.ok) {
          const v = typeof lh.data === 'number' ? lh.data
            : lh.data === 'compact' ? 1.65 : lh.data === 'loose' ? 2.1 : 1.85
          setLineHeight(v)
        }
        if (cf?.ok && (cf.data === 'default' || cf.data === 'serif' || cf.data === 'mono')) {
          setContentFont(cf.data)
        }
        if (ws?.ok && ws.data && typeof ws.data === 'object') {
          const loaded = ws.data as WritingStats
          if (typeof loaded.words === 'number' && Array.isArray(loaded.history)) {
            setWritingStats(rollStatsDate({ ...EMPTY_STATS, ...loaded }))
          }
        }
        if (rf?.ok && Array.isArray(rf.data)) {
          const rec = (rf.data as RecentFile[])
            .filter((r) => r && typeof r.path === 'string' && typeof r.name === 'string')
            .slice(0, 10)
          setRecentFiles(rec)
        }
        if (sc?.ok) setShortcuts(mergeShortcuts(sc.data))
        if (srch?.ok && srch.data && typeof srch.data === 'object') {
          const v = srch.data as {
            query?: unknown; useRegex?: unknown; caseSensitive?: unknown
            wholeWord?: unknown; replacement?: unknown
          }
          setSearchPref({
            query: typeof v.query === 'string' ? v.query : '',
            useRegex: v.useRegex === true,
            caseSensitive: v.caseSensitive === true,
            wholeWord: v.wholeWord === true,
            replacement: typeof v.replacement === 'string' ? v.replacement : '',
          })
        }
        if (bce?.ok && typeof bce.data === 'boolean') setBlankClickToEnd(bce.data)
        if (cln?.ok && typeof cln.data === 'boolean') setCodeLineNumbers(cln.data)
        if (ccs?.ok && ccs.data && typeof ccs.data === 'object') {
          const v = ccs.data as { name?: unknown; content?: unknown }
          if (typeof v.content === 'string' && v.content) {
            setCustomCss({ name: typeof v.name === 'string' ? v.name : 'custom.css', content: v.content })
          }
        }
        if (ecss?.ok && ecss.data && typeof ecss.data === 'object') {
          const v = ecss.data as { name?: unknown; content?: unknown }
          if (typeof v.content === 'string' && v.content) {
            setExportCss({ name: typeof v.name === 'string' ? v.name : 'export.css', content: v.content })
          }
        }
        if (ih?.ok && ih.data && typeof ih.data === 'object') {
          const v = ih.data as { provider?: unknown; configured?: unknown }
          setImageHost({
            provider: v.provider === 'smms' ? 'smms' : 'local',
            configured: v.configured === true,
          })
        }
        if (scl?.ok && typeof scl.data === 'string') setSpellcheckLang(scl.data)
        if (sat?.ok && typeof sat.data === 'string') {
          const legacyPanel: ContextDockPanel =
            sat.data === 'links' || sat.data === 'tags' || sat.data === 'quality'
              ? sat.data : 'outline'
          setSidebarActiveTab('files')
          setContextDockState((current) => ({ ...current, panel: legacyPanel }))
        }
        if (sfmp?.ok && typeof sfmp.data === 'boolean') setShowFrontmatterProps(sfmp.data)
        if (gset?.ok && gset.data && typeof gset.data === 'object') {
          const saved = gset.data as Record<string, unknown>
          const clamp = (v: unknown, min: number, max: number, dflt: number): number =>
            typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : dflt
          const rawTextFade = clamp(saved.textFade, 0, 10, 10)
          setGraphSettings({
            search: typeof saved.search === 'string' ? saved.search : '',
            arrows: saved.arrows === true,
            animate: saved.animate === true,
            folderColor: saved.folderColor === true,
            showOrphans: saved.showOrphans === true,
            nodeSize: clamp(saved.nodeSize, 0.5, 2, 1),
            linkThickness: clamp(saved.linkThickness, 0.5, 3, 1),
            textFade: rawTextFade === 2 ? 10 : rawTextFade,
            centerForce: clamp(saved.centerForce, 0, 2, 1),
            repelForce: clamp(saved.repelForce, 0, 2, 1),
            linkForce: clamp(saved.linkForce, 0, 2, 1),
            linkDistance: clamp(saved.linkDistance, 30, 300, 92),
            maxNodes: clamp(saved.maxNodes, 100, 10000, DEFAULT_GRAPH_SETTINGS.maxNodes),
          })
        }
        if (cfo?.ok && typeof cfo.data === 'boolean') setCollapseFoldersOnOpen(cfo.data)

        const session = FRESH_MODE ? null : ((s?.ok ? s.data : null) as SessionData | null)
        if (sck?.ok && sck.data != null) {
          const scope = session?.workspacePath ?? DEMO_TREE_SCOPE
          const migrated: Record<string, string[]> = {}
          if (Array.isArray(sck.data)) {
            migrated[scope] = (sck.data as unknown[]).filter(
              (k): k is string => typeof k === 'string',
            )
          } else if (typeof sck.data === 'object') {
            for (const [k, v] of Object.entries(sck.data as Record<string, unknown>)) {
              if (typeof k === 'string' && Array.isArray(v) && v.every((x) => typeof x === 'string')) {
                migrated[k] = v as string[]
              }
            }
          }
          setSidebarCollapsedKeys(Object.keys(migrated).length > 0 ? migrated : null)
        }
        const drafts = FRESH_MODE ? {} : (((dr?.ok ? dr.data : null) ?? {}) as DraftMap)

        if (wg?.ok && (wg.data === null || typeof wg.data === 'number')) setWordGoal(wg.data)
        if (wgo?.ok && wgo.data && typeof wgo.data === 'object' && !Array.isArray(wgo.data)) {
          const overrides: Record<string, number | null> = {}
          for (const [key, value] of Object.entries(wgo.data as Record<string, unknown>)) {
            if (value === null || typeof value === 'number') overrides[key] = value
          }
          setWordGoalOverrides(overrides)
        }

        await restoreFromSessionData(session, drafts)
      })
      .catch((error: unknown) => {
        console.error('[启动初始化] 加载设置或草稿失败：', error)
        setToast('部分设置或草稿加载失败，已使用默认值')
      })
      .finally(() => {
        setSettingsReady(true)
      })
  }, [restoreFromSessionData, setAutosave, setContentFont, setContentWidth, setContextDockState, setFontSize, setLineHeight, setMultiWindow, setRecentFiles, setSearchPref, setSidebarActiveTab, setSidebarCollapsedKeys, setSidebarWidth, setSpellcheck, setTheme, setToast, setWritingStats, setZoom])

  // --- 持久化：设置变更防抖写回主进程 ---
  usePersistedSetting('theme', theme, settingsReady)
  usePersistedSetting('attachmentDirectory', globalAttachmentDirectory, settingsReady)
  usePersistedSetting('autosave', autosave, settingsReady)
  usePersistedSetting('spellcheck', spellcheck, settingsReady)
  usePersistedSetting('spellcheckLang', spellcheckLang, settingsReady)
  usePersistedSetting('multiWindow', multiWindow, settingsReady)
  usePersistedSetting('shortcuts', shortcuts, settingsReady)
  usePersistedSetting('fontSize', fontSize, settingsReady)
  usePersistedSetting('contentWidth', contentWidth, settingsReady)
  usePersistedSetting('lineHeight', lineHeight, settingsReady)
  usePersistedSetting('contentFont', contentFont, settingsReady)
  usePersistedSetting('zoom', zoom, settingsReady)
  usePersistedSetting('sidebarWidth', sidebarWidth, settingsReady, 500)
  usePersistedSetting('searchState', undefined, settingsReady, 1_000) // 由调用方单独处理
  usePersistedSetting('blankClickToEnd', blankClickToEnd, settingsReady)
  usePersistedSetting('codeLineNumbers', codeLineNumbers, settingsReady)
  usePersistedSetting('showFrontmatterProps', showFrontmatterProps, settingsReady)
  usePersistedSetting('collapseFoldersOnOpen', collapseFoldersOnOpen, settingsReady)
  usePersistedSetting('graphSettings', graphSettings, settingsReady)
  usePersistedSetting('wordGoal', wordGoal, settingsReady, 300, true)
  usePersistedSetting('wordGoalOverrides', wordGoalOverrides, settingsReady, 300)

  // --- 拼写检查同步到 Electron 会话 ---
  useEffect(() => {
    window.desktopAPI?.window.setSpellcheck(spellcheck, spellcheckLang).catch(() => {})
  }, [spellcheck, spellcheckLang])

  // --- 自定义主题 CSS 注入/移除 ---
  useEffect(() => {
    const STYLE_ID = 'custom-theme-css'
    let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null
    if (customCss?.content) {
      if (!el) {
        el = document.createElement('style')
        el.id = STYLE_ID
        document.head.appendChild(el)
      }
      el.textContent = customCss.content
    } else if (el) {
      el.remove()
    }
  }, [customCss])

  useEffect(() => {
    if (!settingsReady) return
    window.desktopAPI?.settings.setCustomCss(customCss).catch(() => {})
  }, [customCss, settingsReady])

  useEffect(() => {
    if (!settingsReady) return
    window.desktopAPI?.settings.setExportCss(exportCss).catch(() => {})
  }, [exportCss, settingsReady])

  // --- 图床配置操作 ---
  const handleImageHostProviderChange = useCallback(
    async (provider: 'local' | 'smms') => {
      const result = await window.desktopAPI?.imageHost.setConfig(provider)
      if (!result?.ok || !result.data) {
        setToast('图床配置保存失败')
        return
      }
      setImageHost(result.data)
    },
    [setToast],
  )

  const handleImageHostTokenSave = useCallback(async (token: string): Promise<boolean> => {
    const result = await window.desktopAPI?.imageHost.setConfig('smms', token)
    if (!result?.ok || !result.data) {
      setToast('Token 保存失败')
      return false
    }
    setImageHost(result.data)
    setToast('Token 已保存')
    return true
  }, [setToast])

  // --- CSS 导入/移除 ---
  const handleImportCss = useCallback(async () => {
    if (!window.desktopAPI) return
    const res = await window.desktopAPI.document.pickCss()
    if (res.ok && res.data) {
      setCustomCss({ name: res.data.name, content: res.data.content })
      setToast(`已应用自定义主题：${res.data.name}`)
    } else if (res.error?.code === 'TOO_LARGE') {
      setToast(res.error.message ?? 'CSS 文件过大')
    } else if (res.error?.code === 'IO_ERROR') {
      setToast('CSS 读取失败')
    }
  }, [setToast])

  const handleRemoveCss = useCallback(() => {
    setCustomCss(null)
    setToast('已移除自定义主题')
  }, [setToast])

  const handleImportExportCss = useCallback(async () => {
    if (!window.desktopAPI) return
    const res = await window.desktopAPI.document.pickCss()
    if (res.ok && res.data) {
      setExportCss({ name: res.data.name, content: res.data.content })
      setToast(`已应用导出样式：${res.data.name}`)
    } else if (res.error?.code === 'TOO_LARGE') {
      setToast(res.error.message ?? 'CSS 文件过大')
    } else if (res.error?.code === 'IO_ERROR') {
      setToast('CSS 读取失败')
    }
  }, [setToast])

  const handleRemoveExportCss = useCallback(() => {
    setExportCss(null)
    setToast('已恢复默认导出样式')
  }, [setToast])

  return {
    settingsReady,
    shortcuts, setShortcuts,
    blankClickToEnd, setBlankClickToEnd,
    codeLineNumbers, setCodeLineNumbers,
    customCss, setCustomCss,
    exportCss, setExportCss,
    imageHost, setImageHost,
    globalAttachmentDirectory, setGlobalAttachmentDirectory,
    spellcheckLang, setSpellcheckLang,
    graphSettings, setGraphSettings,
    collapseFoldersOnOpen, setCollapseFoldersOnOpen,
    showFrontmatterProps, setShowFrontmatterProps,
    wordGoal, setWordGoal,
    wordGoalOverrides, setWordGoalOverrides,
    handleImageHostProviderChange,
    handleImageHostTokenSave,
    handleImportCss,
    handleRemoveCss,
    handleImportExportCss,
    handleRemoveExportCss,
  }
}
