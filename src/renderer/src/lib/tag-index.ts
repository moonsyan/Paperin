import type { WorkspaceTagIndexEntry } from '../../../shared/tag-index'

/** 标签聚合结果：一个标签 → 含该标签的全部文件路径 */
export interface TagGroup {
  /** 展示名（保留原始大小写，取首次出现的写法） */
  tag: string
  paths: string[]
}

/**
 * 把逐文件标签索引聚合为标签 → 文件路径列表。
 * 匹配大小写不敏感（`Note` 与 `note` 视为同一标签，展示名取首次出现）；
 * 排序：文件数降序 → 名称升序（中文按 locale 比较）。
 */
export function buildTagGroups(files: WorkspaceTagIndexEntry[]): TagGroup[] {
  const map = new Map<string, TagGroup>()
  for (const file of files) {
    for (const tag of file.tags) {
      const key = tag.toLowerCase()
      let group = map.get(key)
      if (!group) {
        group = { tag, paths: [] }
        map.set(key, group)
      }
      if (!group.paths.includes(file.path)) group.paths.push(file.path)
    }
  }
  return Array.from(map.values()).sort(
    (a, b) =>
      b.paths.length - a.paths.length ||
      a.tag.localeCompare(b.tag, 'zh-Hans-CN'),
  )
}

/** 查询标签组（大小写不敏感）；无匹配返回 null */
export function findTagGroup(groups: TagGroup[], tag: string): TagGroup | null {
  const key = tag.toLowerCase()
  return groups.find((g) => g.tag.toLowerCase() === key) ?? null
}
