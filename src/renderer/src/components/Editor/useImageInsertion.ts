import { useCallback, useRef } from 'react'
import type { MutableRefObject } from 'react'
import { Editor as MilkdownCore, EditorStatus, editorViewCtx } from '@milkdown/kit/core'
import type { EditorView } from '@milkdown/kit/prose/view'
import { toMdimgUrl } from '../../lib/image-path'
import { convertHtmlToMarkdown } from '../../lib/html-to-markdown'
import {
  addImagePlaceholder,
  removeImagePlaceholder as createRemoveImagePlaceholderTransaction,
  replaceImagePlaceholder,
} from './plugins/imagePlaceholder'

export interface EditorImageHints {
  documentId?: string
  docPath?: string
  workspacePath?: string
  workspaceAttachmentDirectory?: string | null
  globalAttachmentDirectory?: string | null
  imageHost?: { provider: 'local' | 'smms'; configured: boolean }
}

interface UseImageInsertionOptions {
  editorRef: MutableRefObject<MilkdownCore | null>
  imageHintsRef: MutableRefObject<EditorImageHints | undefined>
  insertMarkdown: (markdown: string) => void
  notify: (message: string) => void
}

/** 单张图片大小上限（与主进程一致） */
export const MAX_IMAGE_SIZE = 20 * 1024 * 1024

type ClipboardTextSource = Pick<DataTransfer, 'getData'>

const extractHtmlText = (html: string): string =>
  html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|blockquote|pre)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

export const getImagePasteText = (clipboard: ClipboardTextSource): string => {
  const html = clipboard.getData('text/html')
  if (html.trim()) {
    if (typeof document === 'undefined') return extractHtmlText(html)
    return convertHtmlToMarkdown(html).markdown
  }
  const plainText = clipboard.getData('text/plain').trim()
  if (plainText) return plainText
  return ''
}

export const getInsertableImageFiles = <T extends Pick<File, 'size'>>(
  files: readonly T[],
): T[] => files.filter((file) => file.size <= MAX_IMAGE_SIZE)

const readAsDataUrl = (file: File): Promise<string | null> =>
  new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })

/**
 * 串行保存粘贴或拖入的图片，保证 Markdown 中的插入顺序与用户选择顺序一致。
 */
export function useImageInsertion({
  editorRef,
  imageHintsRef,
  insertMarkdown,
  notify,
}: UseImageInsertionOptions): {
  handlePaste: (event: React.ClipboardEvent) => void
  handleDrop: (event: React.DragEvent) => void
  handleDragOver: (event: React.DragEvent) => void
} {
  const imageQueueRef = useRef<Promise<void>>(Promise.resolve())
  const imagePlaceholderSequenceRef = useRef(0)

  const getLiveView = useCallback((): EditorView | null => {
    const editor = editorRef.current
    if (!editor || editor.status !== EditorStatus.Created) return null
    try {
      const view = editor.ctx.get(editorViewCtx)
      return view.isDestroyed ? null : view
    } catch {
      return null
    }
  }, [editorRef])

  const createImagePlaceholder = useCallback((): string | null => {
    const view = getLiveView()
    if (!view) return null
    const id = `image-placeholder-${++imagePlaceholderSequenceRef.current}`
    view.dispatch(addImagePlaceholder(view.state, id, view.state.selection.from))
    return id
  }, [getLiveView])

  const insertImageAtPlaceholder = useCallback(
    (id: string, image: { src: string; alt: string }): boolean => {
      const view = getLiveView()
      if (!view) return false
      const transaction = replaceImagePlaceholder(view.state, id, image)
      if (!transaction) return false
      view.dispatch(transaction)
      return true
    },
    [getLiveView],
  )

  const removeImagePlaceholder = useCallback((id: string): void => {
    const view = getLiveView()
    if (!view) return
    const transaction = createRemoveImagePlaceholderTransaction(view.state, id)
    if (transaction) view.dispatch(transaction)
  }, [getLiveView])

  const insertImageFileTask = useCallback(
    async (file: File, imageHints: EditorImageHints | undefined, placeholderId: string) => {
      if (!window.desktopAPI) {
        removeImagePlaceholder(placeholderId)
        return
      }
      if (file.size > MAX_IMAGE_SIZE) {
        removeImagePlaceholder(placeholderId)
        notify('图片超过 20MB，无法插入')
        return
      }

      const documentId = imageHints?.documentId
      const dataUrl = await readAsDataUrl(file)
      if (!dataUrl) {
        removeImagePlaceholder(placeholderId)
        return
      }

      const host = imageHints?.imageHost
      if (host?.provider === 'smms' && host.configured) {
        const upload = await window.desktopAPI.document.uploadImage(dataUrl)
        if (upload.ok && upload.data?.url) {
          if (imageHintsRef.current?.documentId !== documentId) {
            removeImagePlaceholder(placeholderId)
            notify('已切换文档，图片未插入')
            return
          }
          const alt = file.name.replace(/\.[^.]+$/, '')
          if (!insertImageAtPlaceholder(placeholderId, { src: upload.data.url, alt })) {
            removeImagePlaceholder(placeholderId)
            notify('图片插入位置已失效，未插入')
          }
          return
        }
        notify('图床上传失败，已改为保存到本地')
      }

      const result = await window.desktopAPI.document.saveImage(dataUrl, {
        docPath: imageHints?.docPath,
        workspacePath: imageHints?.workspacePath,
        workspaceAttachmentDirectory: imageHints?.workspaceAttachmentDirectory,
        globalAttachmentDirectory: imageHints?.globalAttachmentDirectory,
      })
      if (!result.ok || !result.data) {
        removeImagePlaceholder(placeholderId)
        // F：保存失败静默返回会让用户以为图片已插入——给出明确反馈
        notify(
          result.error?.code === 'TOO_LARGE'
            ? '图片超过 20MB，无法插入'
            : '图片保存失败，请检查文件权限或磁盘空间',
        )
        return
      }
      if (imageHintsRef.current?.documentId !== documentId) {
        removeImagePlaceholder(placeholderId)
        notify('已切换文档，图片已保存但未插入')
        return
      }
      const url = result.data.relativePath ?? toMdimgUrl(result.data.path)
      if (!insertImageAtPlaceholder(placeholderId, { src: url, alt: result.data.name })) {
        removeImagePlaceholder(placeholderId)
        notify('图片插入位置已失效，未插入')
      }
    },
    [imageHintsRef, insertImageAtPlaceholder, notify, removeImagePlaceholder],
  )

  const insertImageFile = useCallback(
    (file: File) => {
      const imageHints = imageHintsRef.current
      const placeholderId = createImagePlaceholder()
      if (!placeholderId) {
        notify('编辑器未就绪，图片未插入')
        return
      }
      imageQueueRef.current = imageQueueRef.current
        .then(() => insertImageFileTask(file, imageHints, placeholderId))
        .catch((err) => {
          removeImagePlaceholder(placeholderId)
          // 队列内任意意外抛错（如 result.data.path 为 undefined 时的 TypeError）
          // 不应静默吞掉，否则图片未插入且无任何反馈
          console.error('[useImageInsertion] 插入图片失败', err)
          notify('图片插入失败')
        })
    },
    [createImagePlaceholder, imageHintsRef, insertImageFileTask, notify, removeImagePlaceholder],
  )

  const handlePaste = useCallback(
    (event: React.ClipboardEvent) => {
      const dt = event.clipboardData
      // M4：一次性插入剪贴板中的全部图片（此前只取第一张，多图复制其余丢失）
      const files = Array.from(dt?.files ?? []).filter((file) =>
        file.type.startsWith('image/'),
      )
      if (files.length === 0) return
      // 与 PM 粘贴插件保持同一条大小门槛（<=20MB 时才消费粘贴）：
      // 全部图片超限时不 preventDefault，放行 PM 默认粘贴插入正文，
      // 否则文字会被 PM 与 React 各插一次（双插入）
      const insertable = getInsertableImageFiles(files)
      if (insertable.length === 0) {
        notify('图片超过 20MB，无法插入')
        return
      }
      if (insertable.length < files.length) {
        // 部分图片超限被静默过滤，明确告知用户已跳过哪些
        notify('部分图片超过 20MB，已跳过')
      }
      event.preventDefault()
      // M4：PM 消费了图片粘贴后，网页复制的"图片+文字"里的正文会一起被吞掉。
      // 消费前先把 text/html 的纯文本提取出来插入；
      // 纯图片复制（html 只有 <img> 标签）提取结果为空，自然跳过
      const text = dt ? getImagePasteText(dt) : ''
      if (text) insertMarkdown(text)
      insertable.forEach(insertImageFile)
    },
    [insertImageFile, insertMarkdown, notify],
  )

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      // M10：dragOver 已对所有文件 preventDefault（接受拖放），
      // drop 必须同样拦截，否则 .pdf/.docx 等非图片会落入浏览器默认导航、整个窗口跳走
      event.preventDefault()
      const files = Array.from(event.dataTransfer?.files ?? []).filter((file) =>
        file.type.startsWith('image/'),
      )
      if (files.length === 0) return
      const insertable = getInsertableImageFiles(files)
      if (insertable.length === 0) {
        notify('图片超过 20MB，无法插入')
        return
      }
      if (insertable.length < files.length) notify('部分图片超过 20MB，已跳过')
      insertable.forEach(insertImageFile)
    },
    [insertImageFile, notify],
  )

  const handleDragOver = useCallback((event: React.DragEvent) => {
    const hasFile = Array.from(event.dataTransfer?.items ?? []).some(
      (item) => item.kind === 'file',
    )
    if (hasFile) event.preventDefault()
  }, [])

  return { handlePaste, handleDrop, handleDragOver }
}
