import { useCallback } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { isImeComposing } from '../../lib/keyboard'

/**
 * 文档标题（顶栏 contentEditable）编辑：Enter 提交、Escape 还原、失焦提交重命名。
 *
 * 三条约束：
 * 1. contentEditable 不受 React 控制——先把 DOM 还原到 previousName，等真实
 *    重命名成功后再由上层同步 openFiles / docTitle；否则失败时标题栏会残留
 *    非法名字。
 * 2. 演示文档名由模板固定：改名只改内存、重载即还原，还会与侧栏模板名不一致，
 *    直接拒绝并 Toast。
 * 3. IME 组合中 Enter/Escape 是候选词提交/取消，不能触发表单动作。
 */
export function useDocumentTitleEditing({
  docTitle,
  setDocTitle,
  activeFileId,
  openFiles,
  openFilesRef,
  setOpenFiles,
  demoFileNames,
  handleRenameFile,
  setToast,
}: {
  docTitle: string
  setDocTitle: Dispatch<SetStateAction<string>>
  activeFileId: string
  openFiles: Array<{ id: string; name: string; path?: string; preview?: boolean }>
  openFilesRef: MutableRefObject<Array<{ id: string; name: string; path?: string; preview?: boolean }>>
  setOpenFiles: Dispatch<SetStateAction<Array<{ id: string; name: string; path?: string; preview?: boolean }>>>
  demoFileNames: Record<string, string>
  handleRenameFile: (path: string, newName: string) => Promise<boolean>
  setToast: (message: string) => void
}) {
  const handleDocumentTitleBlur = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      const currentFile = openFiles.find((file) => file.id === activeFileId)
      const previousName = currentFile?.name ?? docTitle
      const nextName = (event.currentTarget.textContent ?? '').trim()
      // contentEditable 不会自动受 React 控制；先还原显示，等待真实重命名成功后再更新状态。
      event.currentTarget.textContent = previousName
      if (!nextName) {
        setToast('文件名不能为空')
        return
      }
      if (nextName === previousName) return
      if (currentFile?.path) {
        void handleRenameFile(currentFile.path, nextName)
        return
      }
      if (currentFile && demoFileNames[currentFile.id]) {
        // 演示文档名由模板固定：改名只改内存、重载即还原，还会与侧栏模板名不一致
        setToast('演示文档不支持重命名')
        return
      }
      setDocTitle(nextName)
      const renamedFiles = openFilesRef.current.map((file) =>
        file.id === activeFileId ? { ...file, name: nextName } : file,
      )
      openFilesRef.current = renamedFiles
      setOpenFiles(renamedFiles)
    },
    [activeFileId, demoFileNames, docTitle, handleRenameFile, openFiles, openFilesRef, setOpenFiles, setDocTitle, setToast],
  )

  const handleDocumentTitleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (isImeComposing(event.nativeEvent)) return
      if (event.key === 'Enter') {
        event.preventDefault()
        event.currentTarget.blur()
        return
      }
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.currentTarget.textContent = docTitle
      event.currentTarget.blur()
    },
    [docTitle],
  )

  return { handleDocumentTitleBlur, handleDocumentTitleKeyDown }
}
