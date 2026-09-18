import { createHash, randomUUID } from 'crypto'
import { chmod, copyFile, lstat, open, readFile, realpath, rename, unlink, writeFile } from 'fs/promises'
import { basename, dirname, join } from 'path'

const JOURNAL_SCHEMA_VERSION = 1

type RecoveryPhase = 'preparing' | 'prepared' | 'committed'

interface FileWriteJournal {
  version: typeof JOURNAL_SCHEMA_VERSION
  phase: RecoveryPhase
  ownerPid: number
  contentSha256: string
  backupSha256?: string
}

const defaultFileWriteIo = {
  chmod,
  copyFile,
  lstat,
  readFile,
  realpath,
  rename,
  unlink,
  writeFile,
  syncFile: async (path: string): Promise<void> => {
    // Windows rejects fsync on a read-only descriptor even when the file itself
    // is writable. The save path has already opened the file for writing.
    const handle = await open(path, 'r+')
    try {
      await handle.sync()
    } finally {
      await handle.close()
    }
  },
}

type FileWriteIo = typeof defaultFileWriteIo

interface RecoveryPaths {
  backupPath: string
  journalPath: string
}

interface RecoveryOptions {
  allowActiveOwner?: boolean
  isTargetAuthorized?: (target: string) => Promise<boolean>
}

export interface FileWriteOptions {
  isTargetAuthorized?: (target: string) => Promise<boolean>
}

export class FileWriteRecoveryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FileWriteRecoveryError'
  }
}

export class FileWriteRecoveryPendingError extends FileWriteRecoveryError {
  constructor() {
    super('文件正在由另一个进程保存，请稍后重试')
    this.name = 'FileWriteRecoveryPendingError'
  }
}

/** Desktop shells associate icon positions with the existing file object.
 * Replacing it via temp+rename can look like a delete/create pair. */
export const shouldPreserveFileIdentity = (
  platform: NodeJS.Platform,
  targetExists: boolean,
): boolean => (platform === 'win32' || platform === 'darwin' || platform === 'linux') && targetExists

const isNotFound = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'

const hash = (content: Uint8Array): string => createHash('sha256').update(content).digest('hex')

const optionalRead = async (
  io: FileWriteIo,
  path: string,
): Promise<Buffer | null> => {
  try {
    return await io.readFile(path)
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }
}

const resolveTarget = async (
  filePath: string,
  io: FileWriteIo,
): Promise<{ target: string; targetExists: boolean }> => {
  try {
    const linkStat = await io.lstat(filePath)
    if (!linkStat.isFile() && !linkStat.isSymbolicLink()) return { target: filePath, targetExists: false }
    if (!linkStat.isSymbolicLink()) return { target: filePath, targetExists: true }
    return { target: await io.realpath(filePath), targetExists: true }
  } catch (error) {
    if (isNotFound(error)) return { target: filePath, targetExists: false }
    throw error
  }
}

const ensureTargetAuthorized = async (
  target: string,
  isTargetAuthorized: ((target: string) => Promise<boolean>) | undefined,
): Promise<void> => {
  if (!isTargetAuthorized) return
  if (await isTargetAuthorized(target)) return
  throw new FileWriteRecoveryError('保存目标未获授权')
}

const recoveryPathsFor = (target: string): RecoveryPaths => ({
  backupPath: join(dirname(target), `.${basename(target)}.paperin-save-backup`),
  journalPath: join(dirname(target), `.${basename(target)}.paperin-save-journal`),
})

const transientPathFor = (path: string): string =>
  `${path}.${process.pid}-${randomUUID()}.tmp`

const isJournal = (value: unknown): value is FileWriteJournal => {
  if (typeof value !== 'object' || value === null) return false
  const journal = value as Partial<FileWriteJournal>
  return journal.version === JOURNAL_SCHEMA_VERSION
    && (journal.phase === 'preparing' || journal.phase === 'prepared' || journal.phase === 'committed')
    && typeof journal.ownerPid === 'number'
    && Number.isInteger(journal.ownerPid)
    && journal.ownerPid > 0
    && typeof journal.contentSha256 === 'string'
    && /^[a-f0-9]{64}$/.test(journal.contentSha256)
    && (journal.backupSha256 === undefined || /^[a-f0-9]{64}$/.test(journal.backupSha256))
}

const readJournal = async (io: FileWriteIo, journalPath: string): Promise<FileWriteJournal | null> => {
  const content = await optionalRead(io, journalPath)
  if (!content) return null
  try {
    const parsed: unknown = JSON.parse(content.toString('utf8'))
    if (isJournal(parsed)) return parsed
  } catch {
    // The recovery materials must remain in place for manual recovery.
  }
  throw new FileWriteRecoveryError('检测到无法识别的保存恢复记录，已保留恢复材料')
}

const writeDurably = async (
  io: FileWriteIo,
  path: string,
  content: string | Uint8Array,
): Promise<void> => {
  const stagingPath = transientPathFor(path)
  try {
    await io.writeFile(stagingPath, content)
    await io.syncFile(stagingPath)
    await io.rename(stagingPath, path)
    await io.syncFile(path)
  } finally {
    await io.unlink(stagingPath).catch(() => {})
  }
}

const writeJournal = async (
  io: FileWriteIo,
  paths: RecoveryPaths,
  journal: FileWriteJournal,
): Promise<void> => writeDurably(io, paths.journalPath, JSON.stringify(journal))

const cleanupRecoveryMaterials = async (io: FileWriteIo, paths: RecoveryPaths): Promise<void> => {
  await Promise.all([
    io.unlink(paths.backupPath).catch(() => {}),
    io.unlink(paths.journalPath).catch(() => {}),
  ])
}

const processIsAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return !(typeof error === 'object' && error !== null && 'code' in error && error.code === 'ESRCH')
  }
}

const restoreBackup = async (
  io: FileWriteIo,
  target: string,
  paths: RecoveryPaths,
  journal: FileWriteJournal,
): Promise<void> => {
  const backup = await optionalRead(io, paths.backupPath)
  if (!backup || !journal.backupSha256 || hash(backup) !== journal.backupSha256) {
    throw new FileWriteRecoveryError('保存未完成且无法验证恢复副本，已保留恢复材料')
  }
  await io.copyFile(paths.backupPath, target)
  await io.syncFile(target)
  const restored = await optionalRead(io, target)
  if (!restored || hash(restored) !== journal.backupSha256) {
    throw new FileWriteRecoveryError('恢复最后确认版本失败，已保留恢复材料')
  }
}

export const recoverInterruptedFileWriteWithIo = async (
  filePath: string,
  overrides: Partial<FileWriteIo> = {},
  options: RecoveryOptions = {},
): Promise<void> => {
  const io: FileWriteIo = { ...defaultFileWriteIo, ...overrides }
  const { target } = await resolveTarget(filePath, io)
  await ensureTargetAuthorized(target, options.isTargetAuthorized)
  const paths = recoveryPathsFor(target)
  const journal = await readJournal(io, paths.journalPath)
  if (!journal) return
  if (journal.phase === 'committed') {
    // `committed` is written only after the destination hash was verified. A
    // later external edit must win over stale cleanup materials; restoring the
    // backup here would silently overwrite that newer external version.
    await cleanupRecoveryMaterials(io, paths)
    return
  }
  if (!options.allowActiveOwner && processIsAlive(journal.ownerPid)) {
    throw new FileWriteRecoveryPendingError()
  }
  if (journal.phase === 'preparing') {
    // Copying a source to its backup cannot mutate the source. The target is
    // therefore still the last confirmed version at this point.
    await cleanupRecoveryMaterials(io, paths)
    return
  }
  await restoreBackup(io, target, paths, journal)
  await cleanupRecoveryMaterials(io, paths)
}

export const recoverInterruptedFileWrite = async (
  filePath: string,
  options?: FileWriteOptions,
): Promise<void> => recoverInterruptedFileWriteWithIo(filePath, {}, options)

/**
 * Existing desktop files are overwritten in place to preserve their OS file
 * object. A verified, durable backup and journal make that non-atomic step
 * recoverable. New files still use temp+rename. A save is acknowledged only
 * after the target is synced and the journal records `committed`.
 */
export const writeFileAtomicallyWithIo = async (
  filePath: string,
  content: string | Uint8Array,
  mode?: number,
  overrides: Partial<FileWriteIo> = {},
  options: FileWriteOptions = {},
): Promise<void> => {
  const io: FileWriteIo = { ...defaultFileWriteIo, ...overrides }
  await recoverInterruptedFileWriteWithIo(filePath, io, options)
  const { target, targetExists } = await resolveTarget(filePath, io)
  await ensureTargetAuthorized(target, options.isTargetAuthorized)
  const tempPath = transientPathFor(join(dirname(target), `.${basename(target)}`))
  try {
    await io.writeFile(tempPath, content)
    await io.syncFile(tempPath)
    if (mode !== undefined && process.platform !== 'win32') {
      await io.chmod(tempPath, mode & 0o777).catch(() => {})
    }
    if (!shouldPreserveFileIdentity(process.platform, targetExists)) {
      await io.rename(tempPath, target)
      await io.syncFile(target)
      return
    }
    const paths = recoveryPathsFor(target)
    const contentSha256 = hash(await io.readFile(tempPath))
    await writeJournal(io, paths, {
      version: JOURNAL_SCHEMA_VERSION,
      phase: 'preparing',
      ownerPid: process.pid,
      contentSha256,
    })
    await io.copyFile(target, paths.backupPath)
    await io.syncFile(paths.backupPath)
    const backupSha256 = hash(await io.readFile(paths.backupPath))
    await writeJournal(io, paths, {
      version: JOURNAL_SCHEMA_VERSION,
      phase: 'prepared',
      ownerPid: process.pid,
      contentSha256,
      backupSha256,
    })
    await io.copyFile(tempPath, target)
    await io.syncFile(target)
    const saved = await optionalRead(io, target)
    if (!saved || hash(saved) !== contentSha256) {
      throw new FileWriteRecoveryError('保存内容校验失败，正在恢复最后确认版本')
    }
    await writeJournal(io, paths, {
      version: JOURNAL_SCHEMA_VERSION,
      phase: 'committed',
      ownerPid: process.pid,
      contentSha256,
      backupSha256,
    })
    await cleanupRecoveryMaterials(io, paths)
  } catch (error) {
    try {
      await recoverInterruptedFileWriteWithIo(filePath, io, {
        allowActiveOwner: true,
        isTargetAuthorized: options.isTargetAuthorized,
      })
    } catch (recoveryError) {
      throw new FileWriteRecoveryError(`保存失败，且无法恢复最后确认版本：${String(recoveryError)}`)
    }
    throw error
  } finally {
    await io.unlink(tempPath).catch(() => {})
  }
}

export const writeFileAtomically = async (
  filePath: string,
  content: string | Uint8Array,
  mode?: number,
  options?: FileWriteOptions,
): Promise<void> => writeFileAtomicallyWithIo(filePath, content, mode, {}, options)
