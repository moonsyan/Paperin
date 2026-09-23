import { toStoredImages } from '../../lib/image-path'
import { collectExportTargets, inspectExportMarkdown, resolveExportTarget } from '../../lib/export-preflight'

export type ExportReview =
  | { ok: true; reminder: string | null }
  | { ok: false }

export type PreparedExportReview =
  | { ok: false; block: string }
  | { ok: true; confirms: string[]; reminder: string | null }

/**
 * 只做检查与缺附件收集，不弹确认。供单篇与合集统一确认文案复用。
 */
export async function prepareExportMarkdownReview(input: {
  content: string
  directory: string | undefined
  stat: ((absolutePath: string) => Promise<{ ok: boolean }>) | null
}): Promise<PreparedExportReview> {
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
  if (report.block) return { ok: false, block: report.block }
  return { ok: true, confirms: report.confirm, reminder: report.reminder }
}

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
  const prepared = await prepareExportMarkdownReview(input)
  if (!prepared.ok) {
    input.notify(prepared.block)
    return { ok: false }
  }
  if (prepared.confirms.length > 0) {
    const proceed = input.confirm(
      `${prepared.confirms.join('\n')}\n\n仍然导出？取消不会改动原文件。`,
    )
    if (!proceed) return { ok: false }
  }
  return { ok: true, reminder: prepared.reminder }
}

/**
 * 多篇文档预检：阻断立即停止；缺附件确认合并为一次对话框。
 */
export async function reviewExportMarkdownDocuments(input: {
  documents: ReadonlyArray<{ content: string; directory: string | undefined; label?: string }>
  stat: ((absolutePath: string) => Promise<{ ok: boolean }>) | null
  notify: (message: string) => void
  confirm: (message: string) => boolean
}): Promise<ExportReview> {
  const confirms: string[] = []
  let reminder: string | null = null
  for (const doc of input.documents) {
    const prepared = await prepareExportMarkdownReview({
      content: doc.content,
      directory: doc.directory,
      stat: input.stat,
    })
    if (!prepared.ok) {
      input.notify(doc.label ? `${doc.label}：${prepared.block}` : prepared.block)
      return { ok: false }
    }
    for (const line of prepared.confirms) {
      const prefixed = doc.label ? `${doc.label}：${line}` : line
      if (!confirms.includes(prefixed)) confirms.push(prefixed)
    }
    if (prepared.reminder) reminder = prepared.reminder
  }
  if (confirms.length > 0) {
    const proceed = input.confirm(
      `${confirms.join('\n')}\n\n仍然导出？取消不会改动原文件。`,
    )
    if (!proceed) return { ok: false }
  }
  return { ok: true, reminder }
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

/** 从绝对路径取文档目录（集合条目用，勿用标签 id 的 dirOfFile）。 */
export function directoryOfAbsolutePath(filePath: string): string | undefined {
  const sep = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  return sep > 0 ? filePath.slice(0, sep) : undefined
}
