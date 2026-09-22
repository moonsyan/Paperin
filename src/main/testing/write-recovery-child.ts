/**
 * 真进程保存中断夹具：在指定阶段写入 marker 后阻塞，供父测试 SIGKILL。
 * 仅测试使用；走生产 writeFileAtomicallyWithIo，I/O 除阶段 marker 外不 mock。
 */
import {
  copyFile as fsCopyFile,
  readFile,
  writeFile as fsWriteFile,
  chmod,
  lstat,
  realpath,
  rename,
  unlink,
  open,
} from 'fs/promises'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { writeFileAtomicallyWithIo } from '../ipc/file-write-recovery'

export type WriteRecoveryStopPhase =
  | 'preparing'
  | 'prepared'
  | 'target-copy'
  | 'target-synced'
  | 'committed'

const parseArgs = (): {
  targetPath: string
  newContentPath: string
  markerDir: string
  stopAfter: WriteRecoveryStopPhase
} => {
  const env = process.env
  const targetPath = env.PAPERIN_WR_TARGET
  const newContentPath = env.PAPERIN_WR_NEW_CONTENT
  const markerDir = env.PAPERIN_WR_MARKER_DIR
  const stopAfter = env.PAPERIN_WR_STOP_AFTER as WriteRecoveryStopPhase | undefined
  if (!targetPath || !newContentPath || !markerDir || !stopAfter) {
    console.error('missing PAPERIN_WR_* env')
    process.exit(2)
  }
  const allowed: WriteRecoveryStopPhase[] = [
    'preparing',
    'prepared',
    'target-copy',
    'target-synced',
    'committed',
  ]
  if (!allowed.includes(stopAfter)) {
    console.error('invalid PAPERIN_WR_STOP_AFTER')
    process.exit(2)
  }
  return { targetPath, newContentPath, markerDir, stopAfter }
}

const blockUntilKilled = (): Promise<never> => new Promise(() => {})

const realSyncFile = async (path: string): Promise<void> => {
  const handle = await open(path, 'r+')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

const run = async (): Promise<void> => {
  const { targetPath, newContentPath, markerDir, stopAfter } = parseArgs()
  const newContent = await readFile(newContentPath)
  let copyCalls = 0

  const emitMarker = async (phase: WriteRecoveryStopPhase): Promise<void> => {
    await writeFile(join(markerDir, `${phase}.ready`), String(process.pid), 'utf8')
  }

  const maybeStop = async (phase: WriteRecoveryStopPhase): Promise<void> => {
    await emitMarker(phase)
    if (phase === stopAfter) await blockUntilKilled()
  }

  await writeFileAtomicallyWithIo(targetPath, newContent, undefined, {
    chmod,
    lstat,
    readFile,
    realpath,
    rename,
    unlink,
    writeFile: async (path, content) => {
      await fsWriteFile(path, content)
      // journal 经 staging 临时路径写入，只能按 JSON 内容识别阶段。
      if (typeof content === 'string') {
        try {
          const parsed = JSON.parse(content) as { phase?: WriteRecoveryStopPhase; version?: number }
          if (parsed.version !== 1) return
          if (parsed.phase === 'preparing' || parsed.phase === 'prepared' || parsed.phase === 'committed') {
            await maybeStop(parsed.phase)
          }
        } catch {
          // 非 journal 正文
        }
      }
    },
    copyFile: async (source, destination) => {
      copyCalls++
      if (copyCalls === 2) {
        await emitMarker('target-copy')
        if (stopAfter === 'target-copy') {
          void fsCopyFile(source, destination).catch(() => {})
          await blockUntilKilled()
          return
        }
      }
      await fsCopyFile(source, destination)
    },
    syncFile: async (path) => {
      await realSyncFile(path)
      if (stopAfter === 'target-synced' && path === targetPath) {
        await maybeStop('target-synced')
      }
    },
  })
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
