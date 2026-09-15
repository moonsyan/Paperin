import { useCallback, useEffect, useState } from 'react'
import type { WorkspaceTagIndex } from '../../../shared/tag-index'

export interface TagFilter {
  tag: string
  paths: string[]
}

/** 侧栏标签过滤只持有当前工作区的选择，不修改索引或文件树。 */
export function useTagFilter(workspacePath: string | undefined, index: WorkspaceTagIndex | null) {
  const [tagFilter, setTagFilter] = useState<TagFilter | null>(null)
  useEffect(() => { setTagFilter(null) }, [workspacePath])
  const handleToggleTagFilter = useCallback((tag: string) => {
    setTagFilter((previous) => {
      if (previous?.tag.toLowerCase() === tag.toLowerCase()) return null
      const paths = (index?.files ?? [])
        .filter((file) => file.tags.some((entry) => entry.toLowerCase() === tag.toLowerCase()))
        .map((file) => file.path)
      return paths.length ? { tag, paths } : null
    })
  }, [index])
  return { tagFilter, handleToggleTagFilter }
}
