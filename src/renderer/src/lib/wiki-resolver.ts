import type { FolderTreeNode } from '../../../preload/api'

export interface WikiResolveResult {
  resolved: boolean
  path: string
}

/** target 是否"已带扩展名"：只看最后一段。`../note`、`./note` 的点在
 *  路径段里，整串 includes('.') 会误判为已带扩展名而跳过 .md 解析分支 */
const targetHasExtension = (normalizedTarget: string): boolean =>
  (normalizedTarget.split('/').pop() ?? '').includes('.')

/**
 * 在工作区文件树中解析 Wiki 链接 target。
 *
 * 解析规则（按顺序）：
 * 1. 在工作区树中查找精确路径匹配
 * 2. 若 target 不含扩展名，自动追加 .md
 * 3. 若 target 以 / 开头，从工作区根目录查找
 * 4. 否则从当前文件所在目录开始逐级向上查找
 */

/** 扁平化工作区树中所有 Markdown 文件路径为集合（与树扫描的扩展名口径一致，大小写不敏感） */
export function collectMdFiles(tree: FolderTreeNode[]): string[] {
  const result: string[] = []
  const walk = (nodes: FolderTreeNode[]) => {
    for (const node of nodes) {
      if (node.children) {
        walk(node.children)
      } else {
        // 收集 .md 与 .markdown；树扫描本身是 /\.(md|markdown)$/i，
        // 此前仅收小写 .md 会让 .markdown/.MD 文件可见可开却不进 [[ 补全
        if (/\.(md|markdown)$/i.test(node.name)) {
          result.push(node.path)
        }
      }
    }
  }
  walk(tree)
  return result
}

/**
 * 规范化路径中的 ./ 与 ../ 段（纯字符串处理，不触文件系统）。
 * 保留前导 /（POSIX 绝对）与盘符（D:/），`..` 越出根时被忽略
 */
function normalizePathSegments(p: string): string {
  const isAbs = p.startsWith('/')
  const out: string[] = []
  const segs = p.split('/')
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]
    if (s === '' || s === '.') continue
    if (s === '..') {
      if (out.length > 0) out.pop()
      continue
    }
    out.push(s)
  }
  return (isAbs ? '/' : '') + out.join('/')
}

/**
 * 在工作区中按名称查找文件（大小写不敏感）。
 * L8：多个同名文件并存时按与 currentDir 的目录距离排序（同目录 > 父目录 > 其它），
 * 而不是按树遍历顺序"先到先得"——两个目录各有一个同名 .md 时可能打开错误文件
 */
export function findFileByName(
  tree: FolderTreeNode[],
  name: string,
  currentDir?: string,
): string | null {
  const targetName = name.endsWith('.md') ? name : `${name}.md`
  const lower = targetName.toLowerCase()
  const matches: string[] = []
  const walk = (nodes: FolderTreeNode[]) => {
    for (const node of nodes) {
      if (node.children) {
        walk(node.children)
      } else if (node.name.toLowerCase() === lower) {
        matches.push(node.path)
      }
    }
  }
  walk(tree)
  if (matches.length === 0) return null
  if (matches.length === 1 || !currentDir) return matches[0]
  // 距离 = 与当前文件目录公共前缀之外的目录段数；同距离保持树顺序（稳定排序）
  const base = currentDir.replace(/\\/g, '/')
  const depth = (p: string): number => {
    const segs = p.replace(/\\/g, '/').split('/').filter(Boolean)
    const baseSegs = base.split('/').filter(Boolean)
    let common = 0
    while (
      common < segs.length &&
      common < baseSegs.length &&
      segs[common] === baseSegs[common]
    ) {
      common++
    }
    return segs.length - common
  }
  matches.sort((a, b) => depth(a) - depth(b))
  return matches[0]
}

/**
 * 解析 Wiki 链接 target 为绝对文件路径。
 * @param target - [[...]] 中的目标字符串（如 "folder/doc" 或 "doc"）
 * @param workspacePath - 工作区根目录的绝对路径
 * @param currentFilePath - 当前文档的绝对路径（可为 undefined）
 * @param tree - 工作区文件树
 */
export function resolveWikiTarget(
  target: string,
  workspacePath: string,
  currentFilePath: string | undefined,
  tree: FolderTreeNode[],
): WikiResolveResult {
  if (!target) return { resolved: false, path: '' }

  // 两段式：先按完整 target（含 #/^）解析——文件名里可能合法含 #/^（如
  // `note#v2.md`、`a^b.md`），此前在入口先剥锚点会让这类文件永远找不到；
  // 解析失败再剥离 #/^ 之后的锚点段重试，覆盖 `[[note#heading]]` /
  // `[[note#^block-id]]` 两种行内锚点用法。
  const full = resolveWikiPath(target, workspacePath, currentFilePath, tree)
  if (full.resolved) return full

  const anchorIdx = target.search(/[#^]/)
  if (anchorIdx < 0) return { resolved: false, path: '' }
  const stripped = target.slice(0, anchorIdx)
  if (!stripped) return { resolved: false, path: '' }

  return resolveWikiPath(stripped, workspacePath, currentFilePath, tree)
}

/* ==================== 索引化解析（批量场景） ==================== */

/**
 * 预建哈希索引的解析器：与 resolveWikiTarget 结果一致，但每次解析为
 * O(深度) 哈希查找而非全树扫描。反链/图谱要逐条解析数千条链接
 * （Obsidian 库 1300+ 文件 × 上万链接），逐条全树扫描会冻结渲染进程。
 */
export interface WikiIndexResolver {
  resolve(target: string, currentFilePath: string | undefined): WikiResolveResult
}

export function createWikiIndexResolver(
  tree: FolderTreeNode[],
  workspacePath: string,
): WikiIndexResolver {
  // 精确路径（原样）与大小写不敏感路径 → 树中首个节点（与逐树扫描的命中顺序一致）
  const exactByPath = new Map<string, string>()
  const byLowerPath = new Map<string, string>()
  // lower(文件名) → 路径数组（保持树顺序，供同名距离排序）
  const byLowerName = new Map<string, string[]>()
  const walkIndex = (nodes: FolderTreeNode[]) => {
    for (const node of nodes) {
      if (node.children) {
        walkIndex(node.children)
        continue
      }
      const normalized = node.path.replace(/\\/g, '/')
      exactByPath.set(normalized, node.path)
      if (!byLowerPath.has(normalized.toLowerCase())) {
        byLowerPath.set(normalized.toLowerCase(), node.path)
      }
      const nameKey = node.name.toLowerCase()
      const bucket = byLowerName.get(nameKey)
      if (bucket) bucket.push(node.path)
      else byLowerName.set(nameKey, [node.path])
    }
  }
  walkIndex(tree)

  const lookupPath = (normalizedPath: string): string | null =>
    exactByPath.get(normalizedPath) ?? byLowerPath.get(normalizedPath.toLowerCase()) ?? null

  const findNameMatch = (name: string, currentDir: string | undefined): string | null => {
    const targetName = name.endsWith('.md') ? name : `${name}.md`
    const matches = byLowerName.get(targetName.toLowerCase())
    if (!matches || matches.length === 0) return null
    if (matches.length === 1 || !currentDir) return matches[0]
    // 距离 = 与当前文件目录公共前缀之外的目录段数；同距离保持树顺序（稳定排序）
    const base = currentDir.replace(/\\/g, '/')
    const depth = (p: string): number => {
      const segs = p.replace(/\\/g, '/').split('/').filter(Boolean)
      const baseSegs = base.split('/').filter(Boolean)
      let common = 0
      while (
        common < segs.length &&
        common < baseSegs.length &&
        segs[common] === baseSegs[common]
      ) {
        common++
      }
      return segs.length - common
    }
    const sorted = matches.slice().sort((a, b) => depth(a) - depth(b))
    return sorted[0]
  }

  const rootNormalized = workspacePath.replace(/\\/g, '/')
  const rootLen = rootNormalized.length

  const resolveIndexed = (
    targetPath: string,
    currentFilePath: string | undefined,
  ): WikiResolveResult => {
    const normalizedTarget = targetPath.replace(/\\/g, '/')

    // 1. Windows 绝对路径 target：树内精确查找（与逐树扫描同口径）
    if (/^[A-Za-z]:\//.test(normalizedTarget)) {
      const abs = normalizePathSegments(normalizedTarget)
      const withExt = abs.endsWith('.md') ? abs : `${abs}.md`
      const found = lookupPath(withExt) ?? lookupPath(abs)
      if (found) return { resolved: true, path: found }
      return { resolved: false, path: '' }
    }

    // 2. / 开头：从工作区根目录拼接
    if (normalizedTarget.startsWith('/')) {
      const rel = normalizedTarget.slice(1)
      const abs = normalizePathSegments(`${rootNormalized}/${rel}`)
      const withExt = abs.endsWith('.md') ? abs : `${abs}.md`
      const found = lookupPath(withExt) ?? lookupPath(abs)
      if (found) return { resolved: true, path: found }
      return { resolved: false, path: '' }
    }

    // 3. 当前文件目录逐级向上 + 工作区根（顺序与逐树扫描一致）
    const searchDirs: string[] = []
    if (currentFilePath) {
      const normalized = currentFilePath.replace(/\\/g, '/')
      let dir = normalized.substring(0, normalized.lastIndexOf('/'))
      while (dir.length >= rootLen) {
        searchDirs.push(dir)
        const parentIdx = dir.lastIndexOf('/')
        if (parentIdx < 0) break
        dir = dir.substring(0, parentIdx)
      }
    }
    if (!searchDirs.includes(rootNormalized)) searchDirs.push(rootNormalized)

    for (const dir of searchDirs) {
      if (targetHasExtension(normalizedTarget)) {
        const candidate = normalizePathSegments(`${dir}/${normalizedTarget}`)
        const found = lookupPath(candidate)
        if (found) return { resolved: true, path: found }
        const mdFound = lookupPath(normalizePathSegments(`${dir}/${normalizedTarget}.md`))
        if (mdFound) return { resolved: true, path: mdFound }
      } else {
        const indexFound = lookupPath(normalizePathSegments(`${dir}/${normalizedTarget}/index.md`))
        if (indexFound) return { resolved: true, path: indexFound }
        const mdFound = lookupPath(normalizePathSegments(`${dir}/${normalizedTarget}.md`))
        if (mdFound) return { resolved: true, path: mdFound }
      }
    }

    // 4. 全树文件名兜底（大小写不敏感 + 最近目录优先）
    const currentDir = currentFilePath
      ? currentFilePath.replace(/\\/g, '/').replace(/[^/]+$/, '')
      : undefined
    const nameMatch = findNameMatch(normalizedTarget, currentDir)
    if (nameMatch) return { resolved: true, path: nameMatch }

    return { resolved: false, path: '' }
  }

  return {
    resolve(target, currentFilePath) {
      if (!target) return { resolved: false, path: '' }
      const full = resolveIndexed(target, currentFilePath)
      if (full.resolved) return full
      const anchorIdx = target.search(/[#^]/)
      if (anchorIdx < 0) return { resolved: false, path: '' }
      const stripped = target.slice(0, anchorIdx)
      if (!stripped) return { resolved: false, path: '' }
      return resolveIndexed(stripped, currentFilePath)
    },
  }
}

/** 单一候选 target 的解析逻辑（不处理锚点剥离），供 resolveWikiTarget 两段式调用 */
function resolveWikiPath(
  targetPath: string,
  workspacePath: string,
  currentFilePath: string | undefined,
  tree: FolderTreeNode[],
): WikiResolveResult {
  const normalizedTarget = targetPath.replace(/\\/g, '/')

  // 1. Windows 绝对路径 target（[[D:/notes/a.md]]，跨工作区）：规范化后
  //    在本工作区树中精确查找；不在本工作区内的直接判定未解析
  if (/^[A-Za-z]:\//.test(normalizedTarget)) {
    const abs = normalizePathSegments(normalizedTarget)
    const withExt = abs.endsWith('.md') ? abs : `${abs}.md`
    const found = findFileByPathInTree(tree, withExt) ?? findFileByPathInTree(tree, abs)
    if (found) return { resolved: true, path: found }
    return { resolved: false, path: '' }
  }

  // 2. 若以 / 开头，从工作区根目录拼接（../ 与 ./ 段规范化）
  if (normalizedTarget.startsWith('/')) {
    const rel = normalizedTarget.slice(1)
    const abs = normalizePathSegments(`${workspacePath.replace(/\\/g, '/')}/${rel}`)
    const withExt = abs.endsWith('.md') ? abs : `${abs}.md`
    const found = findFileByPathInTree(tree, withExt)
    if (found) return { resolved: true, path: found }
    // 尝试不加扩展名（允许指向非 .md 文件）
    const foundNoExt = findFileByPathInTree(tree, abs)
    if (foundNoExt) return { resolved: true, path: foundNoExt }
    return { resolved: false, path: '' }
  }

  // 3. 在当前文件目录及上级目录中查找
  const searchDirs: string[] = []
  if (currentFilePath) {
    const normalized = currentFilePath.replace(/\\/g, '/')
    let dir = normalized.substring(0, normalized.lastIndexOf('/'))
    while (dir.length >= workspacePath.replace(/\\/g, '/').length) {
      searchDirs.push(dir)
      const parentIdx = dir.lastIndexOf('/')
      if (parentIdx < 0) break
      dir = dir.substring(0, parentIdx)
    }
  }
  // 也搜索工作区根目录
  if (!searchDirs.includes(workspacePath.replace(/\\/g, '/'))) {
    searchDirs.push(workspacePath.replace(/\\/g, '/'))
  }

  for (const dir of searchDirs) {
    // 精确 target（已有扩展名）
    if (targetHasExtension(normalizedTarget)) {
      // L8：../ 与 ./ 段规范化——此前 `${dir}/../x` 的 `..` 是字面量，
      // 树内路径不含 `..` 段，[[../x]] 永远匹配不上
      const candidate = normalizePathSegments(`${dir}/${normalizedTarget}`)
      const found = findFileByPathInTree(tree, candidate)
      if (found) return { resolved: true, path: found }
      const mdFound = findFileByPathInTree(tree, normalizePathSegments(`${dir}/${normalizedTarget}.md`))
      if (mdFound) return { resolved: true, path: mdFound }
    } else {
      // target 不含扩展名
      // 先尝试作为目录下的 index.md
      const indexPath = normalizePathSegments(`${dir}/${normalizedTarget}/index.md`)
      const indexFound = findFileByPathInTree(tree, indexPath)
      if (indexFound) return { resolved: true, path: indexFound }

      // 再尝试 target.md
      const mdPath = normalizePathSegments(`${dir}/${normalizedTarget}.md`)
      const mdFound = findFileByPathInTree(tree, mdPath)
      if (mdFound) return { resolved: true, path: mdFound }
    }
  }

  // 4. 全树逐文件模糊匹配（大小写不敏感的文件名匹配；
  //    L8：同名文件多个时返回距离当前文件目录最近的）
  const currentDir = currentFilePath
    ? currentFilePath.replace(/\\/g, '/').replace(/[^/]+$/, '')
    : undefined
  const nameMatch = findFileByName(tree, normalizedTarget, currentDir)
  if (nameMatch) return { resolved: true, path: nameMatch }

  return { resolved: false, path: '' }
}

/** 检查给定路径是否在文件树中（规范化比较） */
function findFileByPathInTree(
  tree: FolderTreeNode[],
  targetPath: string,
): string | null {
  const normalized = targetPath.replace(/\\/g, '/')
  // L19：先精确匹配（大小写敏感，兼容大小写敏感文件系统）；
  // 未命中再大小写不敏感匹配——Windows 文件系统大小写不敏感，
  // 用户手写 [[Sub/Doc]] 目录部分大小写不符时精确命中失败，
  // findFileByName 只兜底文件名、兜不住目录段，链接就解析不了
  const lower = normalized.toLowerCase()
  const walk = (nodes: FolderTreeNode[]): string | null => {
    for (const node of nodes) {
      if (node.children) {
        const found = walk(node.children)
        if (found) return found
      } else {
        const nodePath = node.path.replace(/\\/g, '/')
        if (nodePath === normalized) return node.path
        if (nodePath.toLowerCase() === lower) return node.path
      }
    }
    return null
  }
  return walk(tree)
}
