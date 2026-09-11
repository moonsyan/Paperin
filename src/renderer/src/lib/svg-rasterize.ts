/**
 * Mermaid SVG → PNG dataURL（canvas 光栅化，2x 抗锯齿；blob URL 同源不污染画布）
 *
 * 从 hooks/useExports 抽出：Word 导出用它内嵌图表位图。放在 lib/ 因为
 * 是与 React 无关的纯浏览器 API 组合，未来其他导出格式（EPUB、图片包）
 * 也可能复用。
 */
export const rasterizeSvgToPngDataUrl = (svgOuterHtml: string): Promise<string | null> =>
  new Promise((resolve) => {
    try {
      const blob = new Blob([svgOuterHtml], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(blob)
      const img = new Image()
      img.onload = () => {
        try {
          const width = img.naturalWidth || 600
          const height = img.naturalHeight || 400
          const scale = Math.min(2, 4000 / Math.max(width, height))
          const canvas = document.createElement('canvas')
          canvas.width = Math.max(1, Math.round(width * scale))
          canvas.height = Math.max(1, Math.round(height * scale))
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            URL.revokeObjectURL(url)
            resolve(null)
            return
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          URL.revokeObjectURL(url)
          resolve(canvas.toDataURL('image/png'))
        } catch {
          URL.revokeObjectURL(url)
          resolve(null)
        }
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        resolve(null)
      }
      img.src = url
    } catch {
      resolve(null)
    }
  })
