import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { createWorkspaceIndexFilesystemDependencies } from './workspace-index-filesystem'

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

const createTempRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'lfh-index-fs-'))
  tempRoots.push(root)
  return root
}

describe('workspace index filesystem dependencies', () => {
  it('递归列出真实工作区 Markdown，同时忽略隐藏目录、node_modules 和非 Markdown 文件', async () => {
    const root = await createTempRoot()
    await mkdir(join(root, 'notes'), { recursive: true })
    await mkdir(join(root, '.private'), { recursive: true })
    await mkdir(join(root, 'node_modules', 'pkg'), { recursive: true })
    await writeFile(join(root, 'root.md'), '# Root', 'utf-8')
    await writeFile(join(root, 'notes', 'nested.markdown'), '# Nested', 'utf-8')
    await writeFile(join(root, 'notes', 'skip.txt'), 'plain', 'utf-8')
    await writeFile(join(root, '.private', 'hidden.md'), '# Hidden', 'utf-8')
    await writeFile(join(root, 'node_modules', 'pkg', 'dependency.md'), '# Dependency', 'utf-8')

    const deps = createWorkspaceIndexFilesystemDependencies()
    const files = await deps.listMarkdownFiles(root)

    expect(files.map((file) => file.path).sort()).toEqual([
      join(root, 'notes', 'nested.markdown'),
      join(root, 'root.md'),
    ].sort())
    expect(files.every((file) => file.size > 0 && file.mtimeMs > 0)).toBe(true)
  })

  it('资源解析只接受工作区内部已经存在的文件', async () => {
    const root = await createTempRoot()
    const noteDir = join(root, 'notes')
    const asset = join(root, 'assets', 'cover.png')
    await mkdir(noteDir, { recursive: true })
    await mkdir(join(root, 'assets'), { recursive: true })
    await writeFile(asset, 'image', 'utf-8')

    const deps = createWorkspaceIndexFilesystemDependencies()

    await expect(deps.resolveResourcePath(root, '../assets/cover.png', join(noteDir, 'a.md')))
      .resolves.toBe(asset)
    await expect(deps.resolveResourcePath(root, '../../outside.png', join(noteDir, 'a.md')))
      .resolves.toBeNull()
    await expect(deps.resolveResourcePath(root, 'https://example.com/cover.png', join(noteDir, 'a.md')))
      .resolves.toBeNull()
  })

  it('服从索引服务传入的枚举上限，避免先遍历无界工作区', async () => {
    const root = await createTempRoot()
    await Promise.all(
      Array.from({ length: 4 }, (_, index) => writeFile(join(root, `${index}.md`), `# ${index}`, 'utf-8')),
    )

    const deps = createWorkspaceIndexFilesystemDependencies()

    await expect(deps.listMarkdownFiles(root, 3)).resolves.toHaveLength(3)
  })
})
