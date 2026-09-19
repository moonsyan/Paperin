export interface ExportPreflight {
  /** 危险链接或空图片：不能继续导出。 */
  block: string | null
  /** 缺附件或断链：必须让用户确认，取消则不写文件。 */
  confirm: string[]
  /** 未完成任务等提醒，不删除正文。 */
  reminder: string | null
}

const TARGET_BODY = '(?:[^()\\r\\n]|\\([^()\\r\\n]*\\))*'
const IMAGE_RE = new RegExp(`!\\[[^\\]]*\\]\\(\\s*(${TARGET_BODY})\\s*\\)`, 'g')
const LINK_RE = new RegExp(`\\[[^\\]]*\\]\\(\\s*(${TARGET_BODY})\\s*\\)`, 'g')
const TASK_RE = /^[ \t]*[-*+][ \t]+\[[ \t]\]/gm
const MAX_DATA_URL_CHARS = 1_500_000

const destination = (raw: string): string => {
  const trimmed = raw.trim()
  const title = /(?:^|\s+)(?:"[^"]*"|'[^']*'|\([^()]*\))\s*$/.exec(trimmed)
  return trimmed.slice(0, title ? title.index : trimmed.length).trim().replace(/^<|>$/g, '')
}

const isExternal = (target: string): boolean =>
  /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(target)

const isUnsafe = (target: string): boolean => /^(?:javascript|vbscript):/i.test(target)

/** 把文档目录和 Markdown 目标合成绝对路径。外链返回 null。 */
export const resolveExportTarget = (docDir: string | undefined, target: string): string | null => {
  if (!docDir || !target || isExternal(target) || target.startsWith('data:') || target.startsWith('mdimg:')) return null
  const base = docDir.replace(/\\/g, '/').replace(/\/+$/, '')
  const raw = target.replace(/\\/g, '/')
  const joined = /^[A-Za-z]:\//.test(raw) || raw.startsWith('/') ? raw : `${base}/${raw}`
  const segments = joined.split('/')
  const result: string[] = []
  for (const segment of segments) {
    if (segment === '' || segment === '.') {
      if (segment === '' && result.length === 0) result.push('')
      continue
    }
    if (segment === '..') {
      if (result.length > 0 && result[result.length - 1] !== '') result.pop()
      continue
    }
    result.push(segment)
  }
  return result.join('/')
}

const scan = (pattern: RegExp, visit: (match: RegExpExecArray) => void, source: string) => {
  pattern.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source))) visit(match)
}

const pushUnique = (list: string[], message: string) => {
  if (!list.includes(message)) list.push(message)
}

/** 导出前检查。只报告问题，不改写正文。 */
export const inspectExportMarkdown = (
  markdown: string,
  missingTargets: readonly string[] = [],
): ExportPreflight => {
  const confirm: string[] = []
  let block: string | null = null
  scan(IMAGE_RE, (match) => {
    const target = destination(match[1] ?? '')
    if (!target) {
      block ??= '有图片缺少路径，已停止导出'
      return
    }
    if (isUnsafe(target)) {
      block ??= '图片地址不安全，已停止导出'
      return
    }
    if (target.startsWith('data:') && target.length > MAX_DATA_URL_CHARS) {
      block ??= '图片数据过大，已停止导出'
    }
  }, markdown)
  scan(LINK_RE, (match) => {
    if (match.index !== undefined && markdown[match.index - 1] === '!') return
    const target = destination(match[1] ?? '')
    if (isUnsafe(target)) block ??= '链接地址不安全，已停止导出'
  }, markdown)
  for (const target of missingTargets) {
    pushUnique(confirm, `缺少本地目标：${target}`)
  }
  const tasks = markdown.match(TASK_RE)
  return {
    block,
    confirm,
    reminder: tasks && tasks.length > 0 ? `有 ${tasks.length} 个未完成任务，导出不会删除它们` : null,
  }
}

export const collectExportTargets = (markdown: string): string[] => {
  const targets: string[] = []
  const add = (pattern: RegExp, skipImages: boolean) => {
    scan(pattern, (match) => {
      if (skipImages && match.index !== undefined && markdown[match.index - 1] === '!') return
      const target = destination(match[1] ?? '')
      if (!target || isExternal(target) || target.startsWith('data:') || target.startsWith('mdimg:')) return
      if (!targets.includes(target)) targets.push(target)
    }, markdown)
  }
  add(IMAGE_RE, false)
  add(LINK_RE, true)
  return targets
}
