import { useCallback } from 'react'
import type { DragEvent } from 'react'
import { extractMarkdownFiles } from '../lib/drop-markdown'

export interface UseMarkdownDropOptions {
  /** 打开工作区/外部 Markdown 文件 */
  onOpenFile: (path: string) => void
  /** 统一提示通道 */
  notify: (message: string) => void
}

export interface UseMarkdownDropReturn {
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
}

/**
 * 窗口级 Markdown 拖放：拖入时阻止默认行为，落下时逐个读取并打开。
 *
 * 从 AppComposition 抽出（项目 450 行门禁）：拖放是纯 DOM 事件适配，
 * 与应用的会话/命令编排无耦合；失败分支只通过统一提示通道反馈。
 */
export function useMarkdownDrop({ onOpenFile, notify }: UseMarkdownDropOptions): UseMarkdownDropReturn {
  const onDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    if (event.dataTransfer.types.includes('Files')) event.preventDefault()
  }, [])

  const onDrop = useCallback((event: DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    for (const file of extractMarkdownFiles(event.dataTransfer)) {
      void window.desktopAPI.document.readDropped(file).then((result) => {
        if (result.ok && result.data) onOpenFile(result.data.path)
        else if (result.error?.code === 'TOO_LARGE') notify(result.error.message ?? 'Markdown 文件超过 20MB，无法打开')
        else if (result.error?.code !== 'INVALID_PATH') notify('拖入文件读取失败')
      })
    }
  }, [notify, onOpenFile])

  return { onDragOver, onDrop }
}
