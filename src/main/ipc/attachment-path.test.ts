import { describe, expect, it } from 'vitest'
import { normalizeAttachmentDirectory, resolveAttachmentDirectory } from './attachment-path'

describe('附件目录解析', () => {
  it('拒绝绝对路径、盘符、UNC 和越界路径', () => {
    expect(normalizeAttachmentDirectory('C:\\images')).toBeNull()
    expect(normalizeAttachmentDirectory('\\\\server\\share')).toBeNull()
    expect(normalizeAttachmentDirectory('/images')).toBeNull()
    expect(normalizeAttachmentDirectory('../images')).toBeNull()
    expect(normalizeAttachmentDirectory('docs/../../images')).toBeNull()
    expect(normalizeAttachmentDirectory(' images\\nested/ ')).toBe('images/nested')
  })

  it('按工作区覆盖、全局回退和单文档默认目录解析', () => {
    // 实现走 path.resolve：POSIX 平台上 `C:/...` 是相对路径，必须按平台
    // 提供真正的绝对路径才能覆盖同一套分支逻辑
    const isWin = process.platform === 'win32'
    const workspacePath = isWin ? 'C:/notes' : '/notes'
    const docInWorkspace = isWin ? 'C:/notes/docs/a.md' : '/notes/docs/a.md'
    const docOutside = isWin ? 'C:/other/a.md' : '/other/a.md'

    const workspace = resolveAttachmentDirectory({
      docPath: docInWorkspace,
      workspacePath,
      workspaceDirectory: 'assets/images',
      globalDirectory: 'global-assets',
    })
    expect(workspace.directory.replace(/\\/g, '/')).toBe(`${workspacePath}/assets/images`)
    expect(workspace.relativeToDocument).toBe('../assets/images')

    const global = resolveAttachmentDirectory({
      docPath: docInWorkspace,
      workspacePath,
      workspaceDirectory: null,
      globalDirectory: 'global-assets',
    })
    expect(global.directory.replace(/\\/g, '/')).toBe(`${workspacePath}/global-assets`)

    const standalone = resolveAttachmentDirectory({ docPath: docInWorkspace })
    expect(standalone.directory.replace(/\\/g, '/')).toBe(`${workspacePath}/docs/attachments`)
    expect(standalone.relativeToDocument).toBe('attachments')

    const outsideWorkspace = resolveAttachmentDirectory({
      docPath: docOutside,
      workspacePath,
      workspaceDirectory: 'assets/images',
      globalDirectory: 'global-assets',
    })
    expect(outsideWorkspace.directory.replace(/\\/g, '/')).toBe(
      `${isWin ? 'C:/other' : '/other'}/attachments`,
    )
  })
})
