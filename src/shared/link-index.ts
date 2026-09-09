/** 工作区链接索引 DTO — 主进程提取，渲染层解析为反链/图谱数据 */
export type WorkspaceLinkKind = 'wiki' | 'md'

export interface WorkspaceLinkRef {
  /** 原始目标（wiki 链接可含锚点；md 链接为相对/绝对路径） */
  target: string
  /** wiki 链接别名 [[target|alias]] */
  alias?: string
  /** 所在行号（1 起） */
  line: number
  /** 所在行预览（截断文本） */
  preview: string
  kind: WorkspaceLinkKind
}

export interface WorkspaceLinkIndexEntry {
  path: string
  mtimeMs: number
  size: number
  links: WorkspaceLinkRef[]
}

export interface WorkspaceLinkIndex {
  files: WorkspaceLinkIndexEntry[]
  /** 目录树预算/文件数/链接数任一超限时为 true（索引覆盖不完整） */
  truncated: boolean
}
