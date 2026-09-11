import { useCallback, useRef } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { EditorHandle } from '../../components/Editor'
import { createExportSession } from '../../lib/export-session'

/**
 * 导出会话互斥 + 富内容等待守卫。
 *
 * 存在的原因：HTML/PDF/DOCX/Publish 都要抓编辑器 DOM 快照，如果同一时刻
 * 有多个导出任务，快照会互相踩踏（尤其是 Mermaid/KaTeX 懒加载完成时机）。
 * 会话 ref 惰性初始化，避免每帧重建闭包。
 */
export function useExportSession() {
  const exportSessionRef = useRef<ReturnType<typeof createExportSession> | null>(null)
  if (!exportSessionRef.current) exportSessionRef.current = createExportSession()

  const isExportActive = useCallback(
    () => exportSessionRef.current?.isActive() ?? false,
    [],
  )

  return { exportSessionRef, isExportActive }
}

/**
 * 独占运行一次导出流程：
 * - 会话被占用则 Toast 提示后直接跳过；
 * - fn 内抛错时 Toast 兜底文案（各流程可以在 fn 内自己 setToast 覆盖更精确的错误）；
 * - finally 里始终恢复视口 + 释放会话，覆盖提前 return、抛错、成功三条路径。
 *
 * fn 返回 false 表示"已经自己处理过取消/中止提示"，runExclusive 不再追加 Toast。
 */
export async function runExclusiveExport(
  session: { begin: () => boolean; finish: () => void },
  editorRef: MutableRefObject<EditorHandle | null>,
  setToast: Dispatch<SetStateAction<string>>,
  fallbackErrorMessage: string,
  fn: () => Promise<void>,
): Promise<void> {
  if (!session.begin()) {
    setToast('已有导出任务正在进行')
    return
  }
  try {
    await fn()
  } catch {
    setToast(fallbackErrorMessage)
  } finally {
    editorRef.current?.restoreExportViewport()
    session.finish()
  }
}

/**
 * 等待富内容渲染完成，并检测等待期间用户是否切换了标签。
 * 返回 true 表示可以安全继续（活动文档没变），false 表示应当中止。
 *
 * 抽成独立函数的原因：这段"起始活动 id → await → 再次比对"的模式在
 * HTML/PDF/DOCX/Publish/CopyRichText 五个流程里完全一致，且必须与
 * ensureRichContent 副作用配对使用（finally 中 restoreExportViewport 复位）。
 */
export async function awaitRichContentForExport(
  editorRef: MutableRefObject<EditorHandle | null>,
  activeFileIdRef: MutableRefObject<string>,
): Promise<boolean> {
  const exportFileId = activeFileIdRef.current
  await editorRef.current?.ensureRichContent()
  return activeFileIdRef.current === exportFileId
}
