import { useCallback } from 'react'

/**
 * 导出预处理：把 mdimg:// 本地图片内联为 base64 dataURL，
 * 导出的 HTML/PDF/DOCX 自包含可移植。
 *
 * 返回失败张数：文件被删/目录外等无法读取的图片保留原路径，不静默丢失——
 * 调用方在成功 toast 中提示"N 张图片未能内联"。
 *
 * Y-M2：渲染层 fetch(mdimg://) 被 Blink 拒绝（自定义 scheme 不参与 fetch
 * 规范，必然 TypeError），内联必须走主进程只读 IPC（同一信任校验）。
 * 这段安全边界是把它抽成独立 hook 的关键原因：所有导出流程必须复用同一
 * 实现，避免任何流程绕过主进程校验直接 fetch 自定义协议。
 */
export function useInlineExportImages() {
  const inlineImagesInHtml = useCallback(
    async (html: string): Promise<{ html: string; failed: number }> => {
      const imgRe = /<img\s+[^>]*src="([^"]+)"[^>]*>/g
      const srcs: string[] = []
      let m: RegExpExecArray | null
      while ((m = imgRe.exec(html)) !== null) {
        if (m[1].startsWith('mdimg://')) srcs.push(m[1])
      }
      let result = html
      let failed = 0
      for (const src of srcs) {
        try {
          const res = await window.desktopAPI?.document.readImageInline(src)
          if (!res?.ok || !res.data?.dataUrl) {
            failed++
            continue
          }
          result = result.split(src).join(res.data.dataUrl)
        } catch {
          failed++
        }
      }
      return { html: result, failed }
    },
    [],
  )

  return { inlineImagesInHtml }
}
