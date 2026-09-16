import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises'
import { createHash } from 'crypto'
import { tmpdir } from 'os'
import { basename, join } from 'path'
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
  writeFileAtomicallyWithIo,
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
})

describe('可恢复桌面文件写入', () => {
  it('桌面文件覆盖中断后恢复最后确认版本，并在下次写入时清理恢复材料', async () => {
    const directory = await createTemporaryDirectory()
    const filePath = join(directory, '恢复.md')
    await writeFile(filePath, '最后确认版本')
    let copyCalls = 0

    await expect(writeFileAtomicallyWithIo(filePath, '未确认版本', undefined, {
      copyFile: async (source, destination) => {
        copyCalls++
        if (copyCalls === 2) {
          await writeFile(destination, '损坏的部分内容')
          throw new Error('模拟复制中断')
        }
        await writeFile(destination, await readFile(source))
      },
    })).rejects.toThrow('模拟复制中断')

    await expect(readFile(filePath, 'utf-8')).resolves.toBe('最后确认版本')
    await writeFileAtomically(filePath, '下一次确认版本')
    await expect(readFile(filePath, 'utf-8')).resolves.toBe('下一次确认版本')
    await expect(readFile(join(directory, '.恢复.md.paperin-save-journal'), 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(directory, '.恢复.md.paperin-save-backup'), 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('目标覆盖复制中断连续 20 次时，均恢复最后确认版本', async () => {
    for (let attempt = 1; attempt <= 20; attempt++) {
      const directory = await createTemporaryDirectory()
      const filePath = join(directory, `复制中断-${attempt}.md`)
      const confirmed = `确认版本-${attempt}`
      await writeFile(filePath, confirmed)
      let copyCalls = 0

      await expect(writeFileAtomicallyWithIo(filePath, `未确认版本-${attempt}`, undefined, {
        copyFile: async (source, destination) => {
          copyCalls++
          if (copyCalls === 2) {
            await writeFile(destination, `部分内容-${attempt}`)
            throw new Error(`模拟目标覆盖中断-${attempt}`)
          }
          await writeFile(destination, await readFile(source))
        },
      })).rejects.toThrow(`模拟目标覆盖中断-${attempt}`)

      await expect(readFile(filePath, 'utf-8')).resolves.toBe(confirmed)
      await writeFileAtomically(filePath, `恢复后确认版本-${attempt}`)
      await expect(readFile(filePath, 'utf-8')).resolves.toBe(`恢复后确认版本-${attempt}`)
      await expect(readFile(join(directory, `.${basename(filePath)}.paperin-save-journal`), 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(readFile(join(directory, `.${basename(filePath)}.paperin-save-backup`), 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' })
    }
  })

  it('读取带有已中断保存记录的文件时恢复最后确认版本', async () => {
    const directory = await createTemporaryDirectory()
    const filePath = join(directory, '崩溃恢复.md')
    const confirmed = '最后确认版本'
    const unconfirmed = '未确认版本'
    const digest = (content: string) => createHash('sha256').update(content).digest('hex')
    await writeFile(filePath, '损坏的部分内容')
    await writeFile(join(directory, '.崩溃恢复.md.paperin-save-backup'), confirmed)
    await writeFile(join(directory, '.崩溃恢复.md.paperin-save-journal'), JSON.stringify({
      version: 1,
      phase: 'prepared',
      ownerPid: 2_147_483_647,
      contentSha256: digest(unconfirmed),
      backupSha256: digest(confirmed),
    }))

    await expect(readTextAutoEncoding(filePath)).resolves.toEqual({ content: confirmed, encoding: 'UTF-8' })
    await expect(readFile(join(directory, '.崩溃恢复.md.paperin-save-journal'), 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(directory, '.崩溃恢复.md.paperin-save-backup'), 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('prepared journal 重启恢复连续 20 次时，均保留最后确认版本', async () => {
    const digest = (content: string) => createHash('sha256').update(content).digest('hex')
    for (let attempt = 1; attempt <= 20; attempt++) {
      const directory = await createTemporaryDirectory()
      const fileName = `重启恢复-${attempt}.md`
      const filePath = join(directory, fileName)
      const confirmed = `最后确认版本-${attempt}`
      const unconfirmed = `未确认版本-${attempt}`
      await writeFile(filePath, `部分内容-${attempt}`)
      await writeFile(join(directory, `.${fileName}.paperin-save-backup`), confirmed)
      await writeFile(join(directory, `.${fileName}.paperin-save-journal`), JSON.stringify({
        version: 1,
        phase: 'prepared',
        ownerPid: 2_147_483_647,
        contentSha256: digest(unconfirmed),
        backupSha256: digest(confirmed),
      }))

      await expect(readTextAutoEncoding(filePath)).resolves.toEqual({ content: confirmed, encoding: 'UTF-8' })
      await expect(readFile(join(directory, `.${fileName}.paperin-save-journal`), 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(readFile(join(directory, `.${fileName}.paperin-save-backup`), 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' })
    }
  })

  it('读取已提交的保存记录时保留新版本并清理恢复材料', async () => {
    const directory = await createTemporaryDirectory()
    const filePath = join(directory, '已提交.md')
    const confirmed = '已提交的新版本'
    const previous = '上一次确认版本'
    const digest = (content: string) => createHash('sha256').update(content).digest('hex')
    await writeFile(filePath, confirmed)
    await writeFile(join(directory, '.已提交.md.paperin-save-backup'), previous)
    await writeFile(join(directory, '.已提交.md.paperin-save-journal'), JSON.stringify({
      version: 1,
      phase: 'committed',
      ownerPid: 2_147_483_647,
      contentSha256: digest(confirmed),
      backupSha256: digest(previous),
    }))

    await expect(readTextAutoEncoding(filePath)).resolves.toEqual({ content: confirmed, encoding: 'UTF-8' })
    await expect(readFile(join(directory, '.已提交.md.paperin-save-journal'), 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(directory, '.已提交.md.paperin-save-backup'), 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('不会用已提交记录的旧副本覆盖之后的外部修改', async () => {
    const directory = await createTemporaryDirectory()
    const filePath = join(directory, '外部修改.md')
    const committed = 'Paperin 已确认版本'
    const previous = '上一次确认版本'
    const external = '外部编辑器的新版本'
    const digest = (content: string) => createHash('sha256').update(content).digest('hex')
    await writeFile(filePath, external)
    await writeFile(join(directory, '.外部修改.md.paperin-save-backup'), previous)
    await writeFile(join(directory, '.外部修改.md.paperin-save-journal'), JSON.stringify({
      version: 1,
      phase: 'committed',
      ownerPid: 2_147_483_647,
      contentSha256: digest(committed),
      backupSha256: digest(previous),
    }))

    await expect(readTextAutoEncoding(filePath)).resolves.toEqual({ content: external, encoding: 'UTF-8' })
    await expect(readFile(join(directory, '.外部修改.md.paperin-save-journal'), 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(directory, '.外部修改.md.paperin-save-backup'), 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' })
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
