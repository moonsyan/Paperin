import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { $prose } from '@milkdown/kit/utils'
import { MAX_IMAGE_SIZE } from '../useImageInsertion'

/**
 * 剪贴板同时带图片文件和 HTML 时，ProseMirror 会先插入 HTML 里的图。
 * 这里消费这次粘贴，交给已有的图片保存流程，避免同一张图出现两次。
 * 没有可用图片时不拦截，文字和 Markdown 仍走原来的粘贴。
 */
export const blockImagePastePlugin = $prose(() => new Plugin({
  key: new PluginKey('block-pm-image-paste'),
  props: {
    handlePaste: (_view, event) => {
      const data = event.clipboardData
      if (!data || !window.desktopAPI) return false
      const files = Array.from(data.files)
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index]
        if (file.type.startsWith('image/') && file.size <= MAX_IMAGE_SIZE) return true
      }
      return false
    },
  },
}))
