import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { createHash } from 'crypto'
import { tmpdir } from 'os'
import { basename, join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  FileWriteRecoveryError,
  readTextAutoEncoding,
  recoverInterruptedFileWrite,
  writeFileAtomically,
  writeFileAtomicallyWithIo,
} from './file-io'

const temporaryDirectories: string[] = []

const createTemporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'paperin-file-write-recovery-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((dir) => rm(dir, { recursive: true })))
})

describe('可恢复桌面文件写入', () => {
  it('实际写入目标未获授权时拒绝保存，且不修改最后确认版本', async () => {
    const directory = await createTemporaryDirectory()
    const filePath = join(directory, '未授权目标.md')
    await writeFile(filePath, '最后确认版本')
    const authorizedTargets: string[] = []

    await expect(writeFileAtomicallyWithIo(filePath, '未确认版本', undefined, {}, {
      isTargetAuthorized: async (target) => {
        authorizedTargets.push(target)
        return false
      },
    })).rejects.toBeInstanceOf(FileWriteRecoveryError)

    expect(authorizedTargets[0]).toBe(filePath)
    expect(new Set(authorizedTargets)).toEqual(new Set([filePath]))
    await expect(readFile(filePath, 'utf-8')).resolves.toBe('最后确认版本')
    await expect(readFile(join(directory, '.未授权目标.md.paperin-save-journal'), 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(directory, '.未授权目标.md.paperin-save-backup'), 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

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

  it('目标同步失败连续 20 次时，均恢复最后确认版本', async () => {
    for (let attempt = 1; attempt <= 20; attempt++) {
      const directory = await createTemporaryDirectory()
      const fileName = `同步失败-${attempt}.md`
      const filePath = join(directory, fileName)
      const confirmed = `确认版本-${attempt}`
      await writeFile(filePath, confirmed)
      let targetSyncFailed = false

      await expect(writeFileAtomicallyWithIo(filePath, `未确认版本-${attempt}`, undefined, {
        syncFile: async (path) => {
          if (path === filePath && !targetSyncFailed) {
            targetSyncFailed = true
            throw new Error(`模拟目标同步失败-${attempt}`)
          }
        },
      })).rejects.toThrow(`模拟目标同步失败-${attempt}`)

      await expect(readFile(filePath, 'utf-8')).resolves.toBe(confirmed)
      await expect(readFile(join(directory, `.${fileName}.paperin-save-journal`), 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(readFile(join(directory, `.${fileName}.paperin-save-backup`), 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' })
    }
  })

  it('恢复备份复制失败连续 20 次时，均保留原版本并清理 preparing 记录', async () => {
    for (let attempt = 1; attempt <= 20; attempt++) {
      const directory = await createTemporaryDirectory()
      const fileName = `备份失败-${attempt}.md`
      const filePath = join(directory, fileName)
      const confirmed = `确认版本-${attempt}`
      await writeFile(filePath, confirmed)
      let copyCalls = 0

      await expect(writeFileAtomicallyWithIo(filePath, `未确认版本-${attempt}`, undefined, {
        copyFile: async (source, destination) => {
          copyCalls++
          if (copyCalls === 1) throw new Error(`模拟备份复制失败-${attempt}`)
          await writeFile(destination, await readFile(source))
        },
      })).rejects.toThrow(`模拟备份复制失败-${attempt}`)

      await expect(readFile(filePath, 'utf-8')).resolves.toBe(confirmed)
      await expect(readFile(join(directory, `.${fileName}.paperin-save-journal`), 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(readFile(join(directory, `.${fileName}.paperin-save-backup`), 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' })
      await writeFileAtomically(filePath, `恢复后确认版本-${attempt}`)
      await expect(readFile(filePath, 'utf-8')).resolves.toBe(`恢复后确认版本-${attempt}`)
    }
  })

  it('临时写入拒绝连续 20 次时，不修改原版本或遗留恢复材料', async () => {
    for (let attempt = 1; attempt <= 20; attempt++) {
      const directory = await createTemporaryDirectory()
      const fileName = `临时写入拒绝-${attempt}.md`
      const filePath = join(directory, fileName)
      const confirmed = `确认版本-${attempt}`
      await writeFile(filePath, confirmed)
      let writeRejected = false

      await expect(writeFileAtomicallyWithIo(filePath, `未确认版本-${attempt}`, undefined, {
        writeFile: async (path, content) => {
          if (!writeRejected) {
            writeRejected = true
            const error = new Error(`模拟磁盘满或权限拒绝-${attempt}`)
            Object.assign(error, { code: 'ENOSPC' })
            throw error
          }
          await writeFile(path, content)
        },
      })).rejects.toMatchObject({ code: 'ENOSPC' })

      await expect(readFile(filePath, 'utf-8')).resolves.toBe(confirmed)
      await expect(readFile(join(directory, `.${fileName}.paperin-save-journal`), 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(readFile(join(directory, `.${fileName}.paperin-save-backup`), 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' })
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

    await expect(readTextAutoEncoding(filePath, { isTargetAuthorized: async () => true })).resolves.toMatchObject({ content: confirmed, encoding: 'UTF-8' })
    await expect(readFile(join(directory, '.崩溃恢复.md.paperin-save-journal'), 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(directory, '.崩溃恢复.md.paperin-save-backup'), 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('prepared journal 且目标已是新内容时保留新版本，不回滚到 backup', async () => {
    const directory = await createTemporaryDirectory()
    const filePath = join(directory, '已写出未提交.md')
    const confirmed = '最后确认版本'
    const unconfirmed = '已校验的新版本'
    const digest = (content: string) => createHash('sha256').update(content).digest('hex')
    await writeFile(filePath, unconfirmed)
    await writeFile(join(directory, '.已写出未提交.md.paperin-save-backup'), confirmed)
    await writeFile(join(directory, '.已写出未提交.md.paperin-save-journal'), JSON.stringify({
      version: 1,
      phase: 'prepared',
      ownerPid: 2_147_483_647,
      contentSha256: digest(unconfirmed),
      backupSha256: digest(confirmed),
    }))

    await expect(readTextAutoEncoding(filePath, { isTargetAuthorized: async () => true })).resolves.toMatchObject({ content: unconfirmed, encoding: 'UTF-8' })
    await expect(readFile(join(directory, '.已写出未提交.md.paperin-save-journal'), 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(directory, '.已写出未提交.md.paperin-save-backup'), 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' })
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

      await expect(readTextAutoEncoding(filePath, { isTargetAuthorized: async () => true })).resolves.toMatchObject({ content: confirmed, encoding: 'UTF-8' })
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

    await expect(readTextAutoEncoding(filePath, { isTargetAuthorized: async () => true })).resolves.toMatchObject({ content: confirmed, encoding: 'UTF-8' })
    await expect(readFile(join(directory, '.已提交.md.paperin-save-journal'), 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(directory, '.已提交.md.paperin-save-backup'), 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('committed journal 重启清理连续 20 次时，均保留已确认的新版本', async () => {
    const digest = (content: string) => createHash('sha256').update(content).digest('hex')
    for (let attempt = 1; attempt <= 20; attempt++) {
      const directory = await createTemporaryDirectory()
      const fileName = `已提交重启-${attempt}.md`
      const filePath = join(directory, fileName)
      const committed = `已确认新版本-${attempt}`
      const previous = `上次确认版本-${attempt}`
      await writeFile(filePath, committed)
      await writeFile(join(directory, `.${fileName}.paperin-save-backup`), previous)
      await writeFile(join(directory, `.${fileName}.paperin-save-journal`), JSON.stringify({
        version: 1,
        phase: 'committed',
        ownerPid: 2_147_483_647,
        contentSha256: digest(committed),
        backupSha256: digest(previous),
      }))

      await expect(readTextAutoEncoding(filePath, { isTargetAuthorized: async () => true })).resolves.toMatchObject({ content: committed, encoding: 'UTF-8' })
      await expect(readFile(join(directory, `.${fileName}.paperin-save-journal`), 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(readFile(join(directory, `.${fileName}.paperin-save-backup`), 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' })
    }
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

    await expect(readTextAutoEncoding(filePath, { isTargetAuthorized: async () => true })).resolves.toMatchObject({ content: external, encoding: 'UTF-8' })
    await expect(readFile(join(directory, '.外部修改.md.paperin-save-journal'), 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(directory, '.外部修改.md.paperin-save-backup'), 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('已提交后的外部修改连续 20 次时，清理不会覆盖外部版本', async () => {
    const digest = (content: string) => createHash('sha256').update(content).digest('hex')
    for (let attempt = 1; attempt <= 20; attempt++) {
      const directory = await createTemporaryDirectory()
      const fileName = `外部修改-${attempt}.md`
      const filePath = join(directory, fileName)
      const committed = `Paperin 已确认版本-${attempt}`
      const previous = `上次确认版本-${attempt}`
      const external = `外部编辑器新版本-${attempt}`
      await writeFile(filePath, external)
      await writeFile(join(directory, `.${fileName}.paperin-save-backup`), previous)
      await writeFile(join(directory, `.${fileName}.paperin-save-journal`), JSON.stringify({
        version: 1,
        phase: 'committed',
        ownerPid: 2_147_483_647,
        contentSha256: digest(committed),
        backupSha256: digest(previous),
      }))

      await expect(readTextAutoEncoding(filePath, { isTargetAuthorized: async () => true })).resolves.toMatchObject({ content: external, encoding: 'UTF-8' })
      await expect(readFile(join(directory, `.${fileName}.paperin-save-journal`), 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(readFile(join(directory, `.${fileName}.paperin-save-backup`), 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' })
    }
  })

  it('授权函数拒绝时不把 backup 写回目标', async () => {
    const directory = await createTemporaryDirectory()
    const filePath = join(directory, '未授权恢复.md')
    const confirmed = '最后确认版本'
    const damaged = '损坏的部分内容'
    const digest = (content: string) => createHash('sha256').update(content).digest('hex')
    await writeFile(filePath, damaged)
    await writeFile(join(directory, '.未授权恢复.md.paperin-save-backup'), confirmed)
    await writeFile(join(directory, '.未授权恢复.md.paperin-save-journal'), JSON.stringify({
      version: 1,
      phase: 'prepared',
      ownerPid: 2_147_483_647,
      contentSha256: digest('未确认版本'),
      backupSha256: digest(confirmed),
    }))

    await recoverInterruptedFileWrite(filePath, { isTargetAuthorized: async () => false })
    await expect(readFile(filePath, 'utf-8')).resolves.toBe(damaged)
    await expect(readFile(join(directory, '.未授权恢复.md.paperin-save-journal'), 'utf-8')).resolves.toContain('prepared')
  })
})
