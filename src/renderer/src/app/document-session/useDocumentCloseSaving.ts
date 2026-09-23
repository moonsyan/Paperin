import { useCallback, useEffect, useRef } from 'react'
import { isDocumentDirty } from '../../lib/document-tabs'
import { requestConfirm } from '../../lib/confirm-dialog'
import { ensureFreshSnapshot } from './ensure-snapshot'
import { shouldPreferCachedDocumentSnapshot } from './large-document-save'
import type { UseDocumentSavingOptions } from './useDocumentSaving'

type CloseSavingOptions = Pick<UseDocumentSavingOptions,
  'state' | 'editorRef' | 'saveQueueApi' | 'liveContentOf' | 'recordRecent' | 'setToast' | 'snapshotSettleTimeoutMs'
>

/** 关闭只确认已写出的内容；每次异步等待后重新检查目标身份和末次输入。 */
export function useDocumentCloseSaving({
  state, editorRef, saveQueueApi, liveContentOf, recordRecent, setToast, snapshotSettleTimeoutMs,
}: CloseSavingOptions): (id: string) => Promise<boolean> {
  const { activeFileIdRef, activeSessionRef, contentsRef, openFilesRef, initialOrSavedRef: INITIAL_OR_SAVED } = state
  const { saveQueueRef } = saveQueueApi
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  return useCallback(async (id: string): Promise<boolean> => {
    const file = openFilesRef.current.find((candidate) => candidate.id === id)
    if (!file) return true
    const wasActive = id === activeFileIdRef.current
    const targetSession = activeSessionRef.current
    // 旧关闭请求不得作用于切换后的文档会话或卸载后的组件。
    // 不比较 editorRef.current 对象身份：确认框打开会触发重渲染，
    // Editor 的 useImperativeHandle 每次都会换新句柄，否则「不保存/保存」都会误判失败。
    const isTargetCurrent = () => mounted.current
      && openFilesRef.current.some((candidate) => candidate.id === id && candidate.path === file.path)
      && (wasActive
        ? activeFileIdRef.current === id && activeSessionRef.current === targetSession
        : activeFileIdRef.current !== id)
    const canCloseSavedContent = (savedContent: string): boolean => {
      if (!isTargetCurrent()) return false
      const currentContent = liveContentOf(id)
      if (id === activeFileIdRef.current && editorRef.current?.hasPendingChanges()) {
        setToast('还有未落账的新输入，已取消关闭，请稍后重试')
        return false
      }
      if (isDocumentDirty(currentContent, savedContent)) {
        setToast('保存期间出现了新修改，已取消关闭')
        return false
      }
      return true
    }

    // T05 快照契约：活动文档是大文档且防抖窗口内有输入时，先等快照落账，
    // 否则 flush 排队的是落账前的旧内容、末次输入丢失（与 handleSave 同因）。
    // 未命名与已有路径都必须先过此检查；非活动文件仍需在等待后复核身份。
    if (editorRef.current?.isReady() && id === activeFileIdRef.current) {
      const cachedBeforeClose = contentsRef.current[id] ?? ''
      if (shouldPreferCachedDocumentSnapshot(cachedBeforeClose)) {
        const outcome = await ensureFreshSnapshot({
          hasPendingChanges: () => editorRef.current?.hasPendingChanges() ?? false,
          readSnapshot: () => contentsRef.current[id] ?? '',
          isTargetCurrent,
        }, snapshotSettleTimeoutMs)
        if (!outcome.settled) {
          if (!mounted.current) return false
          setToast(
            outcome.reason === 'target-changed'
              ? `「${file.name}」的编辑会话已切换，已取消关闭`
              : `「${file.name}」仍在生成快照，未保存旧版本并已取消关闭`,
          )
          return false
        }
      }
    }

    if (!isTargetCurrent()) return false
    const content = liveContentOf(id)
    if (!file.path) {
      const dirty = isDocumentDirty(content, INITIAL_OR_SAVED.current[id] ?? '')
      if (!dirty) return canCloseSavedContent(content)
      // 空白未命名文档无实质内容，直接丢弃不弹确认框
      if (!content.trim()) return canCloseSavedContent(content)
      if (!window.desktopAPI) return false
      // T1：关闭前决策交给用户——此前无条件弹另存为且取消即无法关闭，
      // 未命名/演示文档没有任何"放弃修改"出口。现在提供三选，
      // "不保存"直接关闭，"取消"保留文档原样
      const choice = await requestConfirm({
        title: '关闭文档',
        message: `「${file.name}」尚未保存。是否保存并关闭？`,
        buttons: [
          { id: 'save', label: '保存', kind: 'primary' },
          { id: 'discard', label: '不保存', kind: 'danger' },
          { id: 'cancel', label: '取消' },
        ],
        defaultId: 'save',
      })
      if (!isTargetCurrent()) return false
      if (choice === 'cancel') return false
      if (choice === 'discard') return true
      const result = await window.desktopAPI.document.saveAs(content, {
        defaultPath: file.name,
      }).catch(() => ({ ok: false as const, error: { code: 'SAVE_FAILED' } }))
      if (!isTargetCurrent()) return false
      if (!result.ok || !result.data) {
        if (result.error?.code !== 'CANCELLED') setToast(`保存失败：${file.name}`)
        // 另存为对话框被取消同样视为放弃本次关闭，标签/窗口保持原样
        return false
      }
      recordRecent(result.data.path, result.data.name)
      return canCloseSavedContent(content)
    }

    try {
      await saveQueueRef.current?.flush(id)
    } catch {
      // 首次冲刷失败不立刻中止：下方仍按最新实时内容再排一次写回；
      // 仍失败则由最终 catch 交给用户决策（放弃修改/取消）
    }
    if (!isTargetCurrent()) return false
    const currentContent = liveContentOf(id)
    if (!isDocumentDirty(currentContent, INITIAL_OR_SAVED.current[id] ?? '')) return canCloseSavedContent(currentContent)
    saveQueueRef.current?.schedule(id, {
      path: file.path,
      name: file.name,
      content: currentContent,
    })
    try {
      await saveQueueRef.current?.flush(id)
      return canCloseSavedContent(INITIAL_OR_SAVED.current[id] ?? '')
    } catch {
      if (!isTargetCurrent()) return false
      // 无法落盘（外部修改冲突/编码限制/磁盘只读）：不再静默中止关闭，
      // 让用户选择放弃修改并关闭，而不是只能取消后干等
      const choice = await requestConfirm({
        title: '关闭文档',
        message: `「${file.name}」未能保存（文件可能已被外部修改或磁盘不可写）。仍要关闭并放弃这些修改吗？`,
        buttons: [
          { id: 'discard', label: '放弃修改', kind: 'danger' },
          { id: 'cancel', label: '取消' },
        ],
        defaultId: 'cancel',
      })
      return isTargetCurrent() && choice === 'discard'
    }
  }, [INITIAL_OR_SAVED, activeFileIdRef, activeSessionRef, contentsRef, editorRef, liveContentOf, openFilesRef, recordRecent, saveQueueRef, setToast, snapshotSettleTimeoutMs])
}
