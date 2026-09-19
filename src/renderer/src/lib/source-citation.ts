const slash = (path: string): string => path.replace(/\\/g, '/')

const encodeHref = (relative: string): string =>
  relative.split('/').map((part) => (
    part === '..' || part === '.' || /^[A-Za-z]:$/.test(part) ? part : encodeURIComponent(part)
  )).join('/')

/** 从当前文章指向来源文件的 Markdown 相对链接。盘符不同时保留绝对路径。 */
export const relativeMarkdownHref = (fromFile: string, toFile: string): string => {
  const from = slash(fromFile)
  const to = slash(toFile)
  const fromDir = from.split('/').slice(0, -1)
  const toParts = to.split('/')
  const fromDrive = /^[A-Za-z]:/.exec(from)?.[0]
  const toDrive = /^[A-Za-z]:/.exec(to)?.[0]
  if (fromDrive && toDrive && fromDrive.toLowerCase() !== toDrive.toLowerCase()) return encodeHref(to)
  let shared = 0
  while (
    shared < fromDir.length
    && shared < toParts.length
    && fromDir[shared].toLocaleLowerCase() === toParts[shared].toLocaleLowerCase()
  ) shared += 1
  const up = '../'.repeat(fromDir.length - shared)
  const down = toParts.slice(shared).join('/')
  return encodeHref(`${up}${down}` || toParts[toParts.length - 1] || to)
}

/** 插入时的文本快照加来源链接。不读取、不改写源文件。 */
export const buildSourceCitation = (snippet: string, fromFile: string | null, toFile: string): string => {
  const lines = snippet.replace(/\r\n/g, '\n').trim().split('\n').slice(0, 8)
  const quoted = (lines.length > 0 ? lines : ['']).map((line) => `> ${line}`).join('\n')
  const label = slash(toFile).split('/').pop()?.replace(/\.md$/i, '') || '来源'
  const href = fromFile ? relativeMarkdownHref(fromFile, toFile) : encodeHref(slash(toFile))
  return `${quoted}\n>\n> 来源：[${label}](${href})\n`
}

export const citationTargetsCurrentDocument = (capturedFileId: string, currentFileId: string): boolean =>
  capturedFileId.length > 0 && capturedFileId === currentFileId
