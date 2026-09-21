import { execFileSync } from 'child_process'
import { describe, expect, it, beforeEach } from 'vitest'
import type { IpcMainInvokeEvent } from 'electron'
import { lstat, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { isPathTrusted, trustDirectory } from '../trusted-paths'
import { isInsideRoot, withinCallerWorkspace } from './workspace-scope'

const windowsShortPath = (value: string): string | null => {
  if (process.platform !== 'win32') return null
  try {
    const script = `(New-Object -ComObject Scripting.FileSystemObject).GetFolder(${JSON.stringify(value)}).ShortPath`
    const short = execFileSync('powershell', ['-NoProfile', '-Command', script], {
      encoding: 'utf8',
    }).trim()
    return short.length > 0 ? short : null
  } catch {
    return null
  }
}

const createDirectoryAlias = async (target: string): Promise<{ alias: string; parent: string } | null> => {
  const parent = await mkdtemp(join(tmpdir(), 'mk-scope-alias-'))
  const alias = join(parent, 'workspace')
  try {
    await symlink(target, alias, process.platform === 'win32' ? 'junction' : 'dir')
    const stat = await lstat(alias)
    if (!stat.isSymbolicLink() && !stat.isDirectory()) {
      await rm(parent, { recursive: true, force: true })
      return null
    }
    return { alias, parent }
  } catch {
    await rm(parent, { recursive: true, force: true })
    return null
  }
}

let tempRoot = ''
let outsideRoot = ''

/** 测试用最小 event 桩（withinCallerWorkspace 只读 sender.id） */
const eventOf = (id: number): IpcMainInvokeEvent => ({ sender: { id } }) as unknown as IpcMainInvokeEvent

beforeEach(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), 'mk-scope-in-'))
  outsideRoot = await mkdtemp(join(tmpdir(), 'mk-scope-out-'))
})

describe('isInsideRoot（大小写/分隔符等价的包含判定）', () => {
  it('根自身与子路径命中', () => {
    expect(isInsideRoot(tempRoot, tempRoot)).toBe(true)
    expect(isInsideRoot(tempRoot, join(tempRoot, '笔记.md'))).toBe(true)
    expect(isInsideRoot(tempRoot, join(tempRoot, '子目录', '笔记.md'))).toBe(true)
  })

  it('win32 大小写不同视为同一路径（POSIX 平台大小写敏感）', () => {
    if (process.platform === 'win32') {
      expect(isInsideRoot(tempRoot.toUpperCase(), tempRoot.toLowerCase())).toBe(true)
      expect(isInsideRoot('D:\\Notes', 'd:\\notes\\a.md')).toBe(true)
    } else {
      // POSIX 平台大小写敏感是正确语义：大小写变体不命中，同写法子路径命中
      expect(isInsideRoot(tempRoot.toUpperCase(), tempRoot.toLowerCase())).toBe(false)
      expect(isInsideRoot('D:\\Notes', 'D:\\Notes\\a.md')).toBe(true)
    }
  })

  it('根外路径、前缀相似路径与越级 .. 均不命中', () => {
    expect(isInsideRoot(tempRoot, outsideRoot)).toBe(false)
    expect(isInsideRoot(tempRoot, join(outsideRoot, 'x.md'))).toBe(false)
    // 前缀相似但不是同一目录（D:\notes vs D:\notes2）
    expect(isInsideRoot('D:\\notes', 'D:\\notes2\\a.md')).toBe(false)
    expect(isInsideRoot(tempRoot, join(tempRoot, '..', '逃逸.md'))).toBe(false)
  })
})

describe('withinCallerWorkspace（工作区 IPC 的窗口绑定授权）', () => {
  it('无工作区根的窗口拒绝任何路径', async () => {
    const deps = { workspaceRootFor: () => null, isTrustedPath: (p: unknown) => isPathTrusted(p as string) }
    const event = eventOf(1)
    await expect(withinCallerWorkspace(deps, event, tempRoot)).resolves.toBe(false)
  })

  it('窗口根未授信时拒绝（防止伪造 workspaceRootFor 绕过）', async () => {
    const deps = { workspaceRootFor: () => tempRoot, isTrustedPath: () => false }
    const event = eventOf(1)
    await expect(withinCallerWorkspace(deps, event, tempRoot)).resolves.toBe(false)
  })

  it('窗口工作区内路径放行，根外路径拒绝', async () => {
    trustDirectory(tempRoot)
    const deps = { workspaceRootFor: () => tempRoot, isTrustedPath: (p: unknown) => isPathTrusted(p as string) }
    const event = eventOf(7)
    const inside = join(tempRoot, '笔记.md')
    await writeFile(inside, '# 笔记\n', 'utf-8')
    await expect(withinCallerWorkspace(deps, event, inside)).resolves.toBe(true)
    await expect(withinCallerWorkspace(deps, event, tempRoot)).resolves.toBe(true)
    const outside = join(outsideRoot, '外部.md')
    await writeFile(outside, '# 外部\n', 'utf-8')
    await expect(withinCallerWorkspace(deps, event, outside)).resolves.toBe(false)
  })

  it('大小写不同的同一路径放行（win32 语义）', async () => {
    trustDirectory(tempRoot)
    const deps = { workspaceRootFor: () => tempRoot, isTrustedPath: (p: unknown) => isPathTrusted(p as string) }
    const event = eventOf(7)
    // win32 平台用大小写变体验证不区分大小写；POSIX 平台大小写敏感，
    // 用同一路径验证授权放行链路本身
    const variant =
      process.platform === 'win32'
        ? tempRoot === tempRoot.toUpperCase()
          ? tempRoot.toLowerCase()
          : tempRoot.toUpperCase()
        : tempRoot
    await expect(withinCallerWorkspace(deps, event, variant)).resolves.toBe(true)
  })

  it('符号链接指向根外时拒绝（realpath 消解）', async () => {
    await mkdir(join(tempRoot, 'link'), { recursive: true })
    const linkPath = join(tempRoot, 'link', '逃逸')
    // Windows 创建目录符号链接需要开发者模式/管理员；环境不支持时跳过该用例。
    // 注意：受限沙箱里 symlink 可能"静默 no-op"——不抛错但链接未落盘，
    // 此时 realpath 会退回字面路径比较，用例失去意义，故以链接真正落盘为准。
    let symlinkCreated = true
    try {
      await symlink(outsideRoot, linkPath, 'dir')
      symlinkCreated = (await lstat(linkPath)).isSymbolicLink()
    } catch {
      symlinkCreated = false
    }
    if (!symlinkCreated) return
    trustDirectory(tempRoot)
    const deps = { workspaceRootFor: () => tempRoot, isTrustedPath: (p: unknown) => isPathTrusted(p as string) }
    const event = eventOf(7)
    await expect(withinCallerWorkspace(deps, event, linkPath)).resolves.toBe(false)
  })

  it('候选路径不存在时按最近存在父目录的真实路径比较', async () => {
    trustDirectory(tempRoot)
    const deps = { workspaceRootFor: () => tempRoot, isTrustedPath: (p: unknown) => isPathTrusted(p as string) }
    const event = eventOf(7)
    const realTempRoot = await realpath(tempRoot)
    const realOutsideRoot = await realpath(outsideRoot)
    await expect(withinCallerWorkspace(deps, event, join(realTempRoot, '尚未创建.md'))).resolves.toBe(true)
    await expect(withinCallerWorkspace(deps, event, join(realOutsideRoot, '尚未创建.md'))).resolves.toBe(false)
  })

  it('多窗口：每个 sender 只能命中自己的根', async () => {
    const secondRoot = await mkdtemp(join(tmpdir(), 'mk-scope-second-'))
    trustDirectory(tempRoot)
    trustDirectory(secondRoot)
    const deps = { workspaceRootFor: (id: number) => (id === 1 ? tempRoot : secondRoot), isTrustedPath: (p: unknown) => isPathTrusted(p as string) }
    await expect(withinCallerWorkspace(deps, eventOf(1), tempRoot)).resolves.toBe(true)
    await expect(withinCallerWorkspace(deps, eventOf(2), tempRoot)).resolves.toBe(false)
    await expect(withinCallerWorkspace(deps, eventOf(2), secondRoot)).resolves.toBe(true)
    await rm(secondRoot, { recursive: true, force: true })
  })

  it('工作区根被换成指向根外的 junction 后拒绝操作', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'mk-scope-rebind-'))
    const original = await mkdtemp(join(tmpdir(), 'mk-scope-rebind-in-'))
    const rebound = await mkdtemp(join(tmpdir(), 'mk-scope-rebind-out-'))
    const junction = join(parent, 'workspace')
    const inside = join(original, '笔记.md')
    const secret = join(rebound, '秘密.md')
    await writeFile(inside, '# 原\n')
    await writeFile(secret, '# 根外\n')
    try {
      await symlink(original, junction, 'junction')
    } catch {
      await rm(parent, { recursive: true, force: true })
      await rm(original, { recursive: true, force: true })
      await rm(rebound, { recursive: true, force: true })
      return
    }
    trustDirectory(junction)
    const deps = { workspaceRootFor: () => junction, isTrustedPath: (p: unknown) => isPathTrusted(p as string) }
    await expect(withinCallerWorkspace(deps, eventOf(1), join(junction, '笔记.md'))).resolves.toBe(true)
    await rm(junction, { recursive: true, force: true })
    try {
      await symlink(rebound, junction, 'junction')
    } catch {
      await rm(parent, { recursive: true, force: true })
      await rm(original, { recursive: true, force: true })
      await rm(rebound, { recursive: true, force: true })
      return
    }
    await expect(withinCallerWorkspace(deps, eventOf(1), join(junction, '秘密.md'))).resolves.toBe(false)
    await rm(parent, { recursive: true, force: true })
    await rm(original, { recursive: true, force: true })
    await rm(rebound, { recursive: true, force: true })
  })

  it('规范化最近存在父目录后允许根内的未存在目标', async ({ skip }) => {
    const alias = await createDirectoryAlias(tempRoot)
    if (!alias) {
      console.warn('SKIP: 无法创建 junction/symlink，环境不支持目录链接')
      skip()
      return
    }
    try {
      trustDirectory(alias.alias)
      const deps = {
        workspaceRootFor: () => alias.alias,
        isTrustedPath: (p: unknown) => isPathTrusted(p as string),
      }
      const candidate = join(alias.alias, 'new', 'note.md')
      await expect(withinCallerWorkspace(deps, eventOf(7), candidate)).resolves.toBe(true)
      const realRoot = await realpath(tempRoot)
      await expect(withinCallerWorkspace(deps, eventOf(7), join(realRoot, 'new', 'note.md'))).resolves.toBe(true)
    } finally {
      await rm(alias.parent, { recursive: true, force: true })
    }
  })

  it('字面短路径与真实长路径对根内未存在目标给出同一授权结果', async ({ skip }) => {
    if (process.platform !== 'win32') {
      console.warn('SKIP: 仅 Windows 具备 8.3 短路径语义')
      skip()
      return
    }
    const shortRoot = windowsShortPath(tempRoot)
    const realRoot = await realpath(tempRoot)
    if (!shortRoot || shortRoot.toLowerCase() === realRoot.toLowerCase()) {
      console.warn('SKIP: 当前环境未提供与真实路径不同的 8.3 短路径')
      skip()
      return
    }
    trustDirectory(shortRoot)
    const deps = {
      workspaceRootFor: () => shortRoot,
      isTrustedPath: (p: unknown) => isPathTrusted(p as string),
    }
    await expect(withinCallerWorkspace(deps, eventOf(7), join(shortRoot, 'new', 'note.md'))).resolves.toBe(true)
    await expect(withinCallerWorkspace(deps, eventOf(7), join(realRoot, 'new', 'note.md'))).resolves.toBe(true)
    await expect(withinCallerWorkspace(deps, eventOf(7), join(outsideRoot, 'new', 'note.md'))).resolves.toBe(false)
  })

  it('链接换靶到根外后拒绝未存在目标', async ({ skip }) => {
    const original = await mkdtemp(join(tmpdir(), 'mk-scope-rebind-in-'))
    const rebound = await mkdtemp(join(tmpdir(), 'mk-scope-rebind-out-'))
    const alias = await createDirectoryAlias(original)
    if (!alias) {
      await rm(original, { recursive: true, force: true })
      await rm(rebound, { recursive: true, force: true })
      console.warn('SKIP: 无法创建 junction/symlink，环境不支持目录链接')
      skip()
      return
    }
    try {
      trustDirectory(alias.alias)
      const deps = {
        workspaceRootFor: () => alias.alias,
        isTrustedPath: (p: unknown) => isPathTrusted(p as string),
      }
      await expect(withinCallerWorkspace(deps, eventOf(1), join(alias.alias, 'new', 'note.md'))).resolves.toBe(true)
      await rm(alias.alias, { recursive: true, force: true })
      try {
        await symlink(rebound, alias.alias, process.platform === 'win32' ? 'junction' : 'dir')
      } catch {
        console.warn('SKIP: 无法重绑 junction/symlink 到根外目录')
        skip()
        return
      }
      await expect(withinCallerWorkspace(deps, eventOf(1), join(alias.alias, 'new', 'note.md'))).resolves.toBe(false)
    } finally {
      await rm(alias.parent, { recursive: true, force: true })
      await rm(original, { recursive: true, force: true })
      await rm(rebound, { recursive: true, force: true })
    }
  })
})
