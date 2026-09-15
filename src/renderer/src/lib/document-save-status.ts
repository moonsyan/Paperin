/** 保存回执只说明当前编辑版本是否落盘；示例/未命名还没有磁盘目标。 */
export type DocumentStorageKind = 'disk' | 'demo' | 'unnamed'

export const documentSaveStatusLabel = (kind: DocumentStorageKind, dirty: boolean): string => {
  if (kind === 'demo') return dirty ? '示例 · 有未保存修改' : '示例文档'
  if (kind === 'unnamed') return dirty ? '尚未保存到磁盘 · 有修改' : '尚未保存到磁盘'
  return dirty ? '未保存' : '已保存'
}
