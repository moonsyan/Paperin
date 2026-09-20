/** 保存回执只说明当前编辑版本是否落盘；示例/未命名还没有磁盘目标。 */
export type DocumentStorageKind = 'disk' | 'demo' | 'unnamed'

/** 进行中或失败的保存提示优先于 dirty 文案，避免旧回执看起来像已经成功。 */
export type DocumentSaveActivity = 'idle' | 'saving' | 'conflict' | 'encoding' | 'failed'

/** 草稿备份与磁盘保存独立：仅表示 settings 中的崩溃恢复副本，不是落盘成功。 */
export type DraftBackupActivity = 'idle' | 'backed-up' | 'failed'

export const documentSaveStatusLabel = (
  kind: DocumentStorageKind,
  dirty: boolean,
  activity: DocumentSaveActivity = 'idle',
  draftBackup: DraftBackupActivity = 'idle',
): string => {
  if (activity === 'saving') return '正在保存…'
  if (activity === 'conflict') return '文件已被其他程序修改'
  if (activity === 'encoding') return '当前编码无法保存这些字符'
  if (activity === 'failed') return '保存失败，编辑内容仍保留'
  if (kind === 'demo') return dirty ? '示例 · 有未保存修改' : '示例文档'
  if (kind === 'unnamed') return dirty ? '尚未保存到磁盘 · 有修改' : '尚未保存到磁盘'
  if (!dirty) return '已保存'
  if (draftBackup === 'backed-up') return '未保存 · 草稿已备份'
  if (draftBackup === 'failed') return '未保存 · 草稿备份失败'
  return '未保存'
}
