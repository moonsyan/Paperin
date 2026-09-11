import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { HelpView } from '../../components/HelpDialog'

/**
 * 各弹窗关闭器：统一"关闭 + 焦点回到编辑器"语义。
 *
 * 单独抽出的原因：8 个 close* 都是同一份模板，散在 useAppActions 里会撑大文件；
 * 集中在这里也保证任何一个弹窗关闭后焦点行为一致（不会因遗漏 focusEditorSoon
 * 导致焦点卡在已卸载的对话框里）。
 */
export function useDialogClosers({
  focusEditorSoon,
  setSettingsOpen,
  setHelpView,
  setImagesOpen,
  setPdfOptsOpen,
  setPublishOpen,
  setWsSearchOpen,
  setPaletteOpen,
  setVersionHistoryOpen,
}: {
  focusEditorSoon: () => void
  setSettingsOpen: Dispatch<SetStateAction<boolean>>
  setHelpView: Dispatch<SetStateAction<HelpView>>
  setImagesOpen: Dispatch<SetStateAction<boolean>>
  setPdfOptsOpen: Dispatch<SetStateAction<boolean>>
  setPublishOpen: Dispatch<SetStateAction<boolean>>
  setWsSearchOpen: Dispatch<SetStateAction<boolean>>
  setPaletteOpen: Dispatch<SetStateAction<boolean>>
  setVersionHistoryOpen: Dispatch<SetStateAction<boolean>>
}) {
  const closeSettings = useCallback(() => {
    setSettingsOpen(false)
    focusEditorSoon()
  }, [focusEditorSoon, setSettingsOpen])

  const closeHelp = useCallback(() => {
    setHelpView(null)
    focusEditorSoon()
  }, [focusEditorSoon, setHelpView])

  const closeImages = useCallback(() => {
    setImagesOpen(false)
    focusEditorSoon()
  }, [focusEditorSoon, setImagesOpen])

  const closePdfOptions = useCallback(() => {
    setPdfOptsOpen(false)
    focusEditorSoon()
  }, [focusEditorSoon, setPdfOptsOpen])

  const closePublish = useCallback(() => {
    setPublishOpen(false)
    focusEditorSoon()
  }, [focusEditorSoon, setPublishOpen])

  const closeWorkspaceSearch = useCallback(() => {
    setWsSearchOpen(false)
    focusEditorSoon()
  }, [focusEditorSoon, setWsSearchOpen])

  const closePalette = useCallback(() => {
    setPaletteOpen(false)
    focusEditorSoon()
  }, [focusEditorSoon, setPaletteOpen])

  const closeVersionHistory = useCallback(() => {
    setVersionHistoryOpen(false)
    focusEditorSoon()
  }, [focusEditorSoon, setVersionHistoryOpen])

  return {
    closeSettings,
    closeHelp,
    closeImages,
    closePdfOptions,
    closePublish,
    closeWorkspaceSearch,
    closePalette,
    closeVersionHistory,
  }
}
