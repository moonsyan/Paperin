import { createHash } from 'crypto'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  FileWriteRecoveryPendingError,
  recoverInterruptedFileWrite,
  writeFileAtomically,
} from './file-io'

const temporaryDirectories: string[] = []

const createTemporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'paperin-file-write-concurrency-'))
  temporaryDirectories.push(directory)
  return directory
}

const digest = (content: string): string => createHash('sha256').update(content).digest('hex')

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((dir) => rm(dir, { recursive: true })))
})

describe('可恢复文件写入的并发保护', () => {
  it('活动进程持有 prepared journal 时，连续 20 次拒绝恢复和覆盖写入', async () => {
    for (let attempt = 1; attempt <= 20; attempt++) {
      const directory = await createTemporaryDirectory()
      const fileName = `活动保存-${attempt}.md`
      const filePath = join(directory, fileName)
      const confirmed = `确认版本-${attempt}`
      const unconfirmed = `未确认版本-${attempt}`
      const partial = `部分内容-${attempt}`
      await writeFile(filePath, partial)
      await writeFile(join(directory, `.${fileName}.paperin-save-backup`), confirmed)
      await writeFile(join(directory, `.${fileName}.paperin-save-journal`), JSON.stringify({
        version: 1,
        phase: 'prepared',
        ownerPid: process.pid,
        contentSha256: digest(unconfirmed),
        backupSha256: digest(confirmed),
      }))

      await expect(recoverInterruptedFileWrite(filePath)).rejects.toBeInstanceOf(FileWriteRecoveryPendingError)
      await expect(writeFileAtomically(filePath, `竞争写入-${attempt}`)).rejects.toBeInstanceOf(FileWriteRecoveryPendingError)
      await expect(readFile(filePath, 'utf-8')).resolves.toBe(partial)
      await expect(readFile(join(directory, `.${fileName}.paperin-save-journal`), 'utf-8')).resolves.toContain('prepared')
      await expect(readFile(join(directory, `.${fileName}.paperin-save-backup`), 'utf-8')).resolves.toBe(confirmed)
    }
  })
})
