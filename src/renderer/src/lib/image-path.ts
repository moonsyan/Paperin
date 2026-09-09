/** 转义正则特殊字符 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function encodeMdimgPath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

/** 将本地绝对路径转换为可安全写入 Markdown 的 mdimg URL。 */
export function toMdimgUrl(path: string): string {
  return `mdimg:///${encodeMdimgPath(path.replace(/\\/g, '/'))}`
}

/**
 * 图片 src 允许正文：括号配对（支持一层嵌套，如 Windows 重复下载命名的
 * screenshot(1).png）。原实现 `[^)]+` 在文件名第一个 `)` 处截断——src 被
 * 截为 `screenshot(1`，剩余 `).png)` 变成正文裸文本，保存回写后文件名
 * 永久损坏且垃圾文本写进 .md。嵌套两层及以上极少出现，此时整段 ![]()
 * 不匹配、保留原文，不会损坏文件名。
 * 单一常量在 toEditorImages/toStoredImages 中复用，避免三处正则各自内联
 * 导致"设计意图与实际使用不一致"（此前 IMAGE_SRC_PATTERN 定义却未被引用）。
 */
const IMAGE_SRC_BODY = '(?:[^()\\r\\n]|\\([^()\\r\\n]*\\))*'

/** 渲染前匹配相对路径图片：![]() 且 src 非 mdimg/http/data 协议 */
const EDITOR_IMAGE_RE = new RegExp(
  `!\\[([^\\]]*)\\]\\((?!mdimg://|https?://|data:|file://)(${IMAGE_SRC_BODY})\\)`,
  'g',
)

/** 判断是否为绝对路径（Windows 盘符 C:/ 或 POSIX 根 /），避免被当成相对路径拼到文档目录 */
const isAbsolutePath = (p: string): boolean =>
  /^[A-Za-z]:[\\/]/.test(p) || /^[\\/]/.test(p)

/**
 * 归一化拼接后的路径段：消解 `.` 与 `..`。mdimg URL 在协议侧经 new URL()
 * 解析会自动折叠点段——不先归一化，`D:/notes/../img` 会被折叠成
 * `D:/img`，图片解析到错误目录。
 */
const normalizePathSegments = (p: string): string => {
  const segments = p.split('/')
  const result: string[] = []
  for (const segment of segments) {
    if (segment === '') {
      // 仅保留前导空段（POSIX 绝对路径根），其余连续斜杠折叠
      if (result.length === 0) result.push('')
      continue
    }
    if (segment === '.') continue
    if (segment === '..') {
      // 回退上一段；已到根时丢弃（与 POSIX resolve 口径一致）
      if (result.length > 0 && result[result.length - 1] !== '') result.pop()
      continue
    }
    result.push(segment)
  }
  return result.join('/')
}

/**
 * 渲染前：把文档相对路径的图片解析为 mdimg 协议（编辑器才能加载本地图）
 * 仅处理非 mdimg/http/data/file 协议开头的相对路径；绝对路径与已带协议的
 * 原样保留，避免把 file:// 或 C:/... 之类误拼成 mdimg:///<docDir>/... 使图片永久损坏
 */
export function toEditorImages(md: string, docDir: string | undefined): string {
  if (!docDir) return md
  const base = docDir.replace(/\\/g, '/')
  return md.replace(
    EDITOR_IMAGE_RE,
    (_m, alt: string, src: string) => {
      // 摘出尾部 title（"..." '...' (...)）——不保留会在转换回写后永久丢失；
      // 其余去首尾空白、统一剥离三种 Markdown 标题形式
      const trimmed = src.trim()
      const titleMatch = /(?:^|\s+)("([^"]*)"|'([^']*)'|\([^()]*\))\s*$/.exec(trimmed)
      const title = titleMatch ? titleMatch[1] : ''
      const clean = trimmed
        .slice(0, titleMatch ? titleMatch.index : trimmed.length)
        .trim()
        // CommonMark 尖括号目的地址（<my photo.png>，路径含空格的标准写法）：
        // 不剥离会把 <> 一并编码进路径，协议侧 extname 变成 .png> 永远 404
        .replace(/^<([^<>]*)>$/, '$1')
        .replace(/^\.\//, '')
      // 已带协议或绝对路径不改写，保留原文
      if (/^(?:file:|https?:|data:|mdimg:)/i.test(clean) || isAbsolutePath(clean)) {
        return _m
      }
      return `![${alt}](${toMdimgUrl(normalizePathSegments(`${base}/${clean}`))}${title ? ` ${title}` : ''})`
    },
  )
}

/**
 * 存储前：把 mdimg 绝对路径回写为相对路径（保证 .md 可移植，其它编辑器也能显示）
 * 仅回写落在当前文档目录下的图片；目录外的 mdimg 兜底落盘为可移植的绝对路径
 */
export function toStoredImages(md: string, docDir: string | undefined): string {
  let result = md
  if (docDir) {
    const base = docDir.replace(/\\/g, '/')
    const prefixes = [`mdimg:///${encodeMdimgPath(base)}/`, `mdimg:///${base}/`]
    for (const prefix of prefixes) {
      if (!result.includes(prefix)) continue
      const re = new RegExp(`!\\[([^\\]]*)\\]\\(${escapeRegExp(prefix)}(${IMAGE_SRC_BODY})\\)`, 'g')
      result = result.replace(re, (_m, alt: string, rel: string) => {
        try {
          // 尾部 title 段是编辑器转换时保留的原始语法，不属于 URL：
          // 先分离再解码，且不参与尖括号包裹判断
          const titleMatch = /\s+("[^"]*"|'[^']*'|\([^()]*\))\s*$/.exec(rel)
          const titleIndex = titleMatch ? titleMatch.index : rel.length
          const title = titleMatch ? titleMatch[1] : ''
          const urlPart = rel.slice(0, titleIndex)
          const decoded = decodeURIComponent(urlPart)
          // 路径含空白时必须用尖括号目的地址，裸写 `a b.png` 在 CommonMark
          // 里不再是合法目的地址，回写即破坏链接
          const needsAngle = /\s/.test(decoded)
          return `![${alt}](${needsAngle ? `<${decoded}>` : decoded}${title ? ` ${title}` : ''})`
        } catch {
          return `![${alt}](${rel})`
        }
      })
    }
  }
  // 兜底：目录外粘贴、文档移动、未保存文档（无 docDir）等场景残留的
  // mdimg URL 还原为绝对路径落盘。锚定生成侧的三个斜杠，保证 Windows
  // 盘符路径（mdimg:///C%3A/... → C:/...）与 POSIX 绝对路径（捕获组
  // 保留前导 /）都能与 toMdimgUrl 往返对称，不产生多余的 /C:/ 前缀。
  // mdimg 协议对其它 Markdown 工具不可读，绝不允许原样写进文件。
  if (result.includes('mdimg:///')) {
    // 正则字面量不做模板插值，含 ${IMAGE_SRC_BODY} 的字面量从未匹配过任何
    // 内容（历史遗留死代码），必须用 new RegExp 构造才能真正生效。
    const fallbackRe = new RegExp(`(!\\[[^\\]]*\\]\\()mdimg:///(${IMAGE_SRC_BODY})(\\))`, 'g')
    result = result.replace(fallbackRe, (_m, pre: string, encoded: string, post: string) => {
      try {
        return `${pre}${decodeURIComponent(encoded)}${post}`
      } catch {
        return `${pre}${encoded}${post}`
      }
    })
  }
  return result
}
