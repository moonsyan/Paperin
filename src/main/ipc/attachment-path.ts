import { dirname, isAbsolute, join, relative, resolve, sep } from 'path'

export interface AttachmentDirectoryInput {
  docPath?: string
  workspacePath?: string
  workspaceDirectory?: string | null
  globalDirectory?: string | null
}

export interface AttachmentDirectoryResolution {
  directory: string
  relativeToDocument: string
}

const normalizeSeparators = (value: string): string => value.trim().replace(/\\/g, '/')

export const normalizeAttachmentDirectory = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const normalized = normalizeSeparators(value)
  if (!normalized || normalized.length > 4096) return null
  if (normalized.startsWith('/') || normalized.startsWith('//') || /^[a-z]:/i.test(normalized)) {
    return null
  }
  const segments: string[] = []
  for (const segment of normalized.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..' || segment.includes('\0')) return null
    segments.push(segment)
  }
  return segments.length > 0 ? segments.join('/') : null
}

const validDirectoryOrNull = (value: string | null | undefined): string | null =>
  value == null ? null : normalizeAttachmentDirectory(value)

export const resolveAttachmentDirectory = (
  input: AttachmentDirectoryInput,
): AttachmentDirectoryResolution => {
  const docPath = input.docPath
  const docDirectory = docPath ? dirname(resolve(docPath)) : null
  const root = input.workspacePath ? resolve(input.workspacePath) : null
  const workspaceRelative = root && docDirectory ? relative(root, docDirectory) : null
  const hasWorkspace = Boolean(
    root &&
      docPath &&
      workspaceRelative !== null &&
      !isAbsolute(workspaceRelative) &&
      workspaceRelative !== '..' &&
      !workspaceRelative.startsWith(`..${sep}`),
  )
  if (!hasWorkspace && docDirectory) {
    const directory = join(docDirectory, 'attachments')
    return {
      directory,
      relativeToDocument: toPosixRelative(relative(docDirectory, directory)),
    }
  }

  const configured = validDirectoryOrNull(input.workspaceDirectory) ?? validDirectoryOrNull(input.globalDirectory) ?? 'attachments'
  const directory = root ? join(root, configured) : join(process.cwd(), configured)
  const fromDirectory = docDirectory ?? root ?? process.cwd()
  return {
    directory,
    relativeToDocument: toPosixRelative(relative(fromDirectory, directory)),
  }
}

const toPosixRelative = (value: string): string => value.replace(/\\/g, '/') || '.'
