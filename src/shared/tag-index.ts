/** 工作区标签索引 DTO — 主进程扫描 frontmatter tags，渲染层聚合为标签视图 */

export interface WorkspaceTagIndexEntry {
  path: string
  mtimeMs: number
  size: number
  /** frontmatter 中的 tags/tag 键提取结果（去重、去引号、去前导 #） */
  tags: string[]
}

export interface WorkspaceTagIndex {
  files: WorkspaceTagIndexEntry[]
  /** 目录树预算/文件数/标签数任一超限时为 true（索引覆盖不完整） */
  truncated: boolean
}
