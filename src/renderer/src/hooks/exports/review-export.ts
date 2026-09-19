import { toStoredImages } from '../../lib/image-path'
import { collectExportTargets, inspectExportMarkdown, resolveExportTarget } from '../../lib/export-preflight'

export type ExportReview =
  | { ok: true; reminder: string | null }
  | { ok: false }

/**
 * 导出前检查空图片、不安全链接和缺失的本地目标。
 * 取消或阻止时不写文件，也不改原文；未完成任务只作为提醒返回。
 */
export async function reviewExportMarkdown(input: {
  content: string
  directory: string | undefined
  stat: ((absolutePath: string) => Promise<{ ok: boolean }>) | null
  notify: (message: string) => void
  confirm: (message: string) => boolean
}): Promise<ExportReview> {
  const missing: string[] = []
  if (input.stat && input.directory) {
    for (const target of collectExportTargets(input.content)) {
      const absolute = resolveExportTarget(input.directory, target)
      if (!absolute) continue
      const stat = await input.stat(absolute)
      if (!stat.ok) missing.push(target)
    }
  }
  const report = inspectExportMarkdown(input.content, missing)
  if (report.block) {
    input.notify(report.block)
    return { ok: false }
  }
  if (report.confirm.length > 0) {
    const proceed = input.confirm(`${report.confirm.join('\n')}\n\n仍然导出？取消不会改动原文件。`)
    if (!proceed) return { ok: false }
  }
  return { ok: true, reminder: report.reminder }
}

/** 优先用编辑器实时 Markdown，并把图片协议写回相对路径。 */
export function readExportSource(input: {
  editorMarkdown: string | null
  fallback: string
  directory: string | undefined
}): string {
  if (input.editorMarkdown == null) return input.fallback
  return toStoredImages(input.editorMarkdown, input.directory)
}

export function appendExportReminder(message: string, reminder: string | null): string {
  return reminder ? `${message} ${reminder}` : message
}
