const CJK_FONT = '"Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif'

/**
 * 渲染前整理源码，不写回文档。
 * 列表里多出来的缩进、复制带来的零宽字符，以及 `%%{init}%%`，都会让合法图报语法错误，或把后面的图一起画乱。
 */
export function sanitizeMermaidSource(source: string): string {
  const withoutFence = source
    .replace(/^\uFEFF/, '')
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/^[ \t]*```(?:mermaid)?[^\n]*\n/i, '')
    .replace(/\n```[ \t]*$/i, '')
    .replace(/^[ \t]*%%\{[\s\S]*?\}%%[ \t]*\n?/m, '')
  const lines = withoutFence.split('\n').map((line) => line.replace(/[ \t]+$/, ''))
  const indents = lines.filter((line) => line.trim()).map((line) => line.match(/^[ \t]*/)?.[0].length ?? 0)
  const min = indents.length > 0 ? Math.min(...indents) : 0
  const dedented = min > 0 ? lines.map((line) => (line.trim() ? line.slice(min) : '')) : lines
  return dedented.join('\n').trim()
}

export function mermaidThemeOptions(theme: string) {
  return {
    startOnLoad: false as const,
    // strict 会把带 <br> 的合法节点判成语法错误。antiscript 仍会去掉脚本。
    securityLevel: 'antiscript' as const,
    suppressErrorRendering: true,
    fontFamily: CJK_FONT,
    theme: theme === 'dark' ? 'dark' as const : 'default' as const,
    flowchart: { htmlLabels: true, useMaxWidth: true, wrappingWidth: 240, padding: 16 },
    sequence: { useMaxWidth: true },
  }
}

export function isMermaidErrorSvg(svg: string): boolean {
  // 成功的图也会内联主题 CSS，规则里就有 `.error-icon`。
  // 子串匹配会把每张图画失败。只认错误图自己带上的 class / role。
  return /<[^>]*\sclass\s*=\s*["'][^"']*\berror-icon\b/.test(svg)
    || /<[^>]*\saria-roledescription\s*=\s*["']error["']/.test(svg)
}

/** 只把 Mermaid 画出的 svg 放进页面，并去掉脚本和事件属性。 */
export function sanitizeMermaidSvg(svg: string): string | null {
  const trimmed = svg.trim().replace(/^<\?xml[\s\S]*?\?>/i, '').trim()
  if (!/^<svg[\s>]/i.test(trimmed) || !/<\/svg>\s*$/i.test(trimmed)) return null
  return trimmed
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:(['"]).*?\1|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
}

export function mermaidFailureKind(message: string): 'syntax' | 'temporary' {
  if (/timeout|fragments are not allowed|getBBox|Cannot read|is not a function|NaN|DOMException|not attached/i.test(message)) {
    return 'temporary'
  }
  return 'syntax'
}

export function mermaidStatusText(error: unknown): string {
  const message = error instanceof Error && error.message ? error.message.split('\n')[0].trim() : ''
  if (!message || mermaidFailureKind(message) === 'temporary' || /^syntax error in text$/i.test(message)) {
    return '没有画出这张图。若源码在其他 Mermaid 工具里能通过，点「编辑源码」再回到图表。'
  }
  return `没有画出这张图：${message.slice(0, 160)}`
}
