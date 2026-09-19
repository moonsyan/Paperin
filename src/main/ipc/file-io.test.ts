import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import iconv from 'iconv-lite'
import {
  forgetKnownFileState,
  getKnownFileState,
  readTextAutoEncoding,
  rememberFileState,
  UnsupportedEncodingError,
  walkMarkdownTree,
  writeFileAtomically,
  shouldPreserveFileIdentity,
} from './file-io'

const temporaryDirectories: string[] = []

const createTemporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'paperin-file-io-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((dir) => rm(dir, { recursive: true })))
})

describe('文本编码读取', () => {
  it('保留 UTF-8 BOM 的编码标识并移除正文中的 BOM', async () => {
    const directory = await createTemporaryDirectory()
    const filePath = join(directory, '带-bom.md')
    await writeFile(filePath, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('中文')]))

    await expect(readTextAutoEncoding(filePath)).resolves.toEqual({
      content: '中文',
      encoding: 'UTF-8-BOM',
    })
  })

  it('识别 UTF-16LE 与 GBK 文件', async () => {
    const directory = await createTemporaryDirectory()
    const utf16Path = join(directory, 'utf16.md')
    const gbkPath = join(directory, 'gbk.md')
    await writeFile(utf16Path, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('中文', 'utf16le')]))
    await writeFile(gbkPath, iconv.encode('中文', 'gbk'))

    await expect(readTextAutoEncoding(utf16Path)).resolves.toEqual({
      content: '中文',
      encoding: 'UTF-16LE',
    })
    await expect(readTextAutoEncoding(gbkPath)).resolves.toEqual({
      content: '中文',
      encoding: 'GBK',
    })
  })

  it('拒绝 UTF-32 文件，避免不可逆改写', async () => {
    const directory = await createTemporaryDirectory()
    const filePath = join(directory, 'utf32.md')
    await writeFile(filePath, Buffer.from([0xff, 0xfe, 0x00, 0x00, 0x61, 0x00, 0x00, 0x00]))

    await expect(readTextAutoEncoding(filePath)).rejects.toBeInstanceOf(UnsupportedEncodingError)
  })
})

describe('文件原子写入', () => {
  it('以新内容替换目标文件且不保留临时文件', async () => {
    const directory = await createTemporaryDirectory()
    const filePath = join(directory, '笔记.md')
    await writeFile(filePath, '旧内容')

    await writeFileAtomically(filePath, '新内容')

    await expect(readFile(filePath, 'utf-8')).resolves.toBe('新内容')
  })
})

describe('文件状态记录', () => {
  it('按路径记录、读取和清理最后一次已知状态', () => {
    const filePath = '/tmp/状态.md'
    rememberFileState(filePath, { mtimeMs: 100, size: 12 })

    expect(getKnownFileState(filePath)).toEqual({ mtimeMs: 100, size: 12 })

    forgetKnownFileState(filePath)

    expect(getKnownFileState(filePath)).toBeUndefined()
  })
})

describe('Markdown 目录树', () => {
  it('仅返回 Markdown 文件和包含 Markdown 的目录', async () => {
    const directory = await createTemporaryDirectory()
    const notesDirectory = join(directory, '笔记')
    const emptyDirectory = join(directory, '空目录')
    await mkdir(notesDirectory)
    await mkdir(emptyDirectory)
    await writeFile(join(directory, '首页.md'), '# 首页')
    await writeFile(join(directory, '忽略.txt'), '忽略')
    await writeFile(join(notesDirectory, '内容.markdown'), '# 内容')

    await expect(walkMarkdownTree(directory, 0, { nodes: 0, truncated: false })).resolves.toEqual([
      {
        name: '笔记',
        path: notesDirectory,
        children: [{ name: '内容.markdown', path: join(notesDirectory, '内容.markdown') }],
      },
      { name: '首页.md', path: join(directory, '首页.md') },
    ])
  })

  it('后台文件预算不会被目录节点挤占', async () => {
    const directory = await createTemporaryDirectory()
    const first = join(directory, '一级')
    const second = join(first, '二级')
    await mkdir(second, { recursive: true })
    await Promise.all([
      writeFile(join(directory, '根.md'), '# 根'),
      writeFile(join(first, '一级.md'), '# 一级'),
      writeFile(join(second, '二级.md'), '# 二级'),
    ])
    const budget = { nodes: 0, truncated: false }

    const tree = await walkMarkdownTree(directory, 0, budget, { maxFiles: 3 })
    const paths = JSON.stringify(tree)

    expect(paths).toContain('根.md')
    expect(paths).toContain('一级.md')
    expect(paths).toContain('二级.md')
    expect(budget).toMatchObject({ files: 3, truncated: true })
  })

  it('不跟随目录符号链接或 junction 走出工作区', async () => {
    const directory = await createTemporaryDirectory()
    const outside = await createTemporaryDirectory()
    await writeFile(join(outside, '逃逸.md'), '# 根外')
    const linked = join(directory, '外链')
    try {
      await symlink(outside, linked, process.platform === 'win32' ? 'junction' : 'dir')
    } catch {
      return
    }
    await writeFile(join(directory, '本地.md'), '# 本地')

    const tree = await walkMarkdownTree(directory, 0, { nodes: 0, truncated: false })
    const serialized = JSON.stringify(tree)
    expect(serialized).toContain('本地.md')
    expect(serialized).not.toContain('逃逸.md')
  })
})

describe('文件保存策略', () => {
  it('桌面平台已有文件保存时保留文件对象，避免桌面图标被当作新文件排列', () => {
    expect(shouldPreserveFileIdentity('win32', true)).toBe(true)
    expect(shouldPreserveFileIdentity('win32', false)).toBe(false)
    expect(shouldPreserveFileIdentity('linux', true)).toBe(true)
    expect(shouldPreserveFileIdentity('darwin', true)).toBe(true)
  })
})
