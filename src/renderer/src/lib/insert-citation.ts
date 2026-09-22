import { buildSourceCitation, citationTargetsCurrentDocument } from './source-citation'

/** 从侧栏反链插入来源快照。不打开、不修改来源文件。成功插入时返回 true。 */
export function insertCitationFromPanel(input: {
  editor: { insertMd: (markdown: string) => void } | null
  activeFileId: string
  fromFile: string | null
  toFile: string
  preview: string
  notify: (message: string) => void
}): boolean {
  if (!citationTargetsCurrentDocument(input.activeFileId, input.activeFileId)) {
    input.notify('当前没有可插入的文章')
    return false
  }
  if (!input.editor) {
    input.notify('编辑器尚未就绪，未插入引用')
    return false
  }
  input.editor.insertMd(buildSourceCitation(input.preview, input.fromFile, input.toFile))
  input.notify('已插入来源引用，可用撤销收回')
  return true
}
