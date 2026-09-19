import katexCss from 'katex/dist/katex.min.css?inline'
import { escapeHtmlText } from '../app/constants'

/**
 * 单文档导出 HTML 模板（HTML/PDF/DOCX 三条流程共用）。
 *
 * 与 lib/export-bundle.ts 里的"发布模板"是两套：
 * - 发布模板走 PublishTemplate 枚举（github/wechat/plain 等），带封面/目录样式；
 * - 本模板是最小可打印 A4 页面，保留 KaTeX 字体、脚注、任务列表勾选框、
 *   目录分页样式，供浏览器打印/直接归档。
 *
 * 抽成纯函数的原因：模板字符串体量大（含 KaTeX CSS 与勾选框 SVG data URL），
 * 混在 hook 里会淹没导出流程本身；且模板需要能被单元测试直接断言。
 */
/**
 * 自定义导出 CSS 只能作为样式文本插入 <style>。去掉能闭合标签或引入脚本的片段。
 */
export function sanitizeExportCss(css: string): string {
  return css
    .replace(/<\s*\/\s*style/gi, '')
    .replace(/<\s*\/\s*script/gi, '')
    .replace(/<\s*script/gi, '')
}

export function renderExportDocHtml(params: {
  body: string
  title: string
  /** 用户自定义导出模板 CSS（追加在默认样式后，可覆盖；null/undefined = 只用默认样式） */
  customCss?: string | null
}): string {
  const { body, title, customCss } = params
  const safeCustomCss = customCss ? sanitizeExportCss(customCss) : ''
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${escapeHtmlText(title)}</title>
<style>
${katexCss}
</style>
<style>
body{font-family:-apple-system,'Segoe UI','PingFang SC',sans-serif;max-width:760px;margin:40px auto;padding:0 24px;line-height:1.8;color:#1d1b18}
h1{font-size:1.9em}h2{font-size:1.4em;border-bottom:1px solid #eee;padding-bottom:.3em}h3{font-size:1.15em}
pre{background:#f5f2ee;padding:16px;border-radius:8px;overflow-x:auto}
code{font-family:Consolas,monospace;font-size:.9em}
blockquote{border-left:3px solid #7c6f5b;margin:1em 0;padding:.4em 1.2em;color:#5c5850;background:#faf8f5}
table{border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px 12px}th{background:#f5f2ee}
img{max-width:100%}
sup[data-type=footnote_reference]{color:#7c6f5b;font-weight:600}
dl[data-type=footnote_definition]{color:#5c5850;font-size:.92em;margin:.8em 0;padding:.4em .9em;border-left:2px solid #7c6f5b;background:#faf8f5;border-radius:0 6px 6px 0}
dl[data-type=footnote_definition] dt{font-weight:600;font-family:Consolas,monospace;font-size:.85em}
dl[data-type=footnote_definition] dt::before{content:'[^'}dl[data-type=footnote_definition] dt::after{content:']'}
dl[data-type=footnote_definition] dd{margin:0}
li[data-item-type=task]{list-style:none;position:relative;padding-left:27px;margin-left:-1.2rem}
li[data-item-type=task]::before{content:'';position:absolute;left:2px;top:.42em;width:15px;height:15px;box-sizing:border-box;border:1.5px solid #a89d8c;border-radius:3px}
li[data-item-type=task][data-checked=true]::before{border-color:#7c6f5b;background-color:#7c6f5b;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M3.5 8.5 6.8 11.8 12.5 4.5' fill='none' stroke='%23fff' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-size:13px 13px;background-position:center;background-repeat:no-repeat}
.doc-toc{page-break-after:always}
.doc-toc-title{font-size:1.3em;font-weight:700;margin-bottom:.6em}
.doc-toc-list{list-style:none;padding-left:0;line-height:2}
.doc-toc-list a{color:inherit;text-decoration:none}
.toc-l2{padding-left:1.2em}.toc-l3{padding-left:2.4em;font-size:.94em}
</style>
${safeCustomCss ? `<style>\n${safeCustomCss}\n</style>` : ''}
</head>
<body>${body}</body>
</html>`
}
