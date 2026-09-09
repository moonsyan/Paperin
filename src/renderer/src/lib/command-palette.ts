import type { FolderTreeNode } from '../../../preload/api'

/** 命令面板条目：统一工作区文件与演示文件两种来源 */
export interface PaletteEntry {
  /** 列表渲染 key（同一来源内唯一） */
  key: string
  kind: 'workspace' | 'demo'
  /** 工作区文件路径（kind=workspace 时存在，直接传给 handleSelectWorkspaceFile） */
  path?: string
  /** 演示文件 id（kind=demo 时存在，传给 handleSelectDemoFile） */
  demoId?: string
  /** 展示名（不含扩展名） */
  name: string
  /** 相对目录展示（根为空串），用于同名文件消歧 */
  dir: string
}

/** 单次过滤结果上限，避免大工作区一次性渲染过多 DOM */
export const PALETTE_RESULT_LIMIT = 50

const stripExt = (name: string): string => name.replace(/\.(md|markdown)$/i, '')

/**
 * 把绝对路径转为相对工作区根的目录部分（纯字符串处理，兼容 \ 与 /）。
 * 路径不在工作区内（异常场景）时回退为完整目录。
 */
export function paletteRelativeDir(fullPath: string, workspacePath: string | undefined): string {
  const norm = fullPath.replace(/\//g, '\\')
  if (workspacePath) {
    const root = workspacePath.replace(/\//g, '\\').replace(/[\\]+$/, '')
    const lower = norm.toLowerCase()
    const rootLower = root.toLowerCase()
    const rest = lower.startsWith(rootLower)
      ? norm.slice(root.length).replace(/^[\\]+/, '')
      : norm
    const idx = rest.lastIndexOf('\\')
    return idx > 0 ? rest.slice(0, idx) : ''
  }
  const idx = norm.lastIndexOf('\\')
  return idx > 0 ? norm.slice(0, idx) : ''
}

/** 扁平化工作区树为命令面板条目（与 collectMdFiles 同口径：.md/.markdown 大小写不敏感） */
export function buildPaletteEntries(
  workspacePath: string | undefined,
  tree: FolderTreeNode[] | undefined,
): PaletteEntry[] {
  const entries: PaletteEntry[] = []
  if (!tree) return entries
  const walk = (nodes: FolderTreeNode[]) => {
    for (const node of nodes) {
      if (node.children) {
        walk(node.children)
        continue
      }
      if (!/\.(md|markdown)$/i.test(node.name)) continue
      entries.push({
        key: node.path,
        kind: 'workspace',
        path: node.path,
        name: stripExt(node.name),
        dir: paletteRelativeDir(node.path, workspacePath),
      })
    }
  }
  walk(tree)
  return entries
}

/**
 * 按查询过滤并排序条目：
 * - 名字前缀命中 > 名字包含 > 全路径包含；同级按名字长度升序、再按原始顺序（稳定）
 * - 匹配大小写不敏感；查询中的 \ / 视同路径分隔符做宽松匹配
 * 返回条数不超过 limit。
 */
export function filterPaletteEntries(
  entries: PaletteEntry[],
  query: string,
  limit: number = PALETTE_RESULT_LIMIT,
): PaletteEntry[] {
  const q = query.trim().toLowerCase().replace(/[\\/]+/g, '/')
  if (!q) return entries.slice(0, limit)
  const scored: { entry: PaletteEntry; score: number; index: number }[] = []
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const name = entry.name.toLowerCase()
    const full = `${entry.dir ? `${entry.dir.replace(/[\\/]+/g, '/')}/` : ''}${name}`
    let score = -1
    if (name.startsWith(q)) score = 0
    else if (name.includes(q)) score = 1
    else if (full.includes(q)) score = 2
    if (score < 0) continue
    scored.push({ entry, score, index: i })
  }
  scored.sort((a, b) => a.score - b.score || a.entry.name.length - b.entry.name.length || a.index - b.index)
  return scored.slice(0, limit).map((s) => s.entry)
}

/** 计算展示名中查询词的命中区间（用于高亮），未命中返回 null */
export function findNameMatchRange(name: string, query: string): { start: number; end: number } | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  const idx = name.toLowerCase().indexOf(q)
  if (idx < 0) return null
  return { start: idx, end: idx + q.length }
}

/** 命令面板"> 动作模式"的命令定义（id 与应用菜单动作一致） */
export interface PaletteCommand {
  id: string
  label: string
}

/**
 * 过滤命令列表：与文件过滤同一套评分口径（前缀 > 包含），
 * 额外支持按 id 匹配；空查询返回全部。排序稳定，条数不超过 limit。
 */
export function filterCommands(
  commands: PaletteCommand[],
  query: string,
  limit: number = PALETTE_RESULT_LIMIT,
): PaletteCommand[] {
  const q = query.trim().toLowerCase()
  if (!q) return commands.slice(0, limit)
  const scored: { cmd: PaletteCommand; score: number; index: number }[] = []
  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i]
    const label = cmd.label.toLowerCase()
    let score = -1
    if (label.startsWith(q)) score = 0
    else if (label.includes(q)) score = 1
    else if (cmd.id.toLowerCase().includes(q)) score = 2
    if (score < 0) continue
    scored.push({ cmd, score, index: i })
  }
  scored.sort((a, b) => a.score - b.score || a.index - b.index)
  return scored.slice(0, limit).map((s) => s.cmd)
}
