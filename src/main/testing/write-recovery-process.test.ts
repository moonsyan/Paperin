import { spawn, type ChildProcess } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { recoverInterruptedFileWrite } from '../ipc/file-write-recovery'
import type { WriteRecoveryStopPhase } from './write-recovery-child'

/** 每阶段重复次数：完整 Q01 口径为 20（可用 PAPERIN_WR_REPEATS 覆盖做本地快测）。 */
const REPEATS_PER_PHASE = Number(process.env.PAPERIN_WR_REPEATS ?? 20)

const CHILD_SCRIPT = fileURLToPath(new URL('./write-recovery-child.ts', import.meta.url))
const VITE_NODE = resolve(process.cwd(), 'node_modules/vite-node/vite-node.mjs')

const temporaryDirectories: string[] = []

const createTemporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'paperin-write-recovery-proc-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

const journalPathFor = (targetPath: string): string =>
  join(dirname(targetPath), `.${basename(targetPath)}.paperin-save-journal`)

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

interface RecoveryAgainResult {
  recovered: number
  failed: number
}

const recoverAgain = async (targetPath: string): Promise<RecoveryAgainResult> => {
  const journal = journalPathFor(targetPath)
  const hadJournal = await fileExists(journal)
  try {
    await recoverInterruptedFileWrite(targetPath)
    const stillHasJournal = await fileExists(journal)
    return {
      recovered: hadJournal && !stillHasJournal ? 1 : 0,
      failed: 0,
    }
  } catch {
    return { recovered: 0, failed: 1 }
  }
}

const waitForMarker = async (markerDir: string, phase: WriteRecoveryStopPhase, timeoutMs: number): Promise<void> => {
  const marker = join(markerDir, `${phase}.ready`)
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await fileExists(marker)) return
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25))
  }
  throw new Error(`等待阶段 marker 超时：${phase}`)
}

const killProcessTree = (child: ChildProcess): void => {
  if (!child.pid) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    child.kill('SIGKILL')
  }
}

const waitForExit = (child: ChildProcess, timeoutMs: number): Promise<void> =>
  new Promise((resolveExit, reject) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolveExit()
      return
    }
    const timer = setTimeout(() => resolveExit(), timeoutMs)
    child.once('exit', () => {
      clearTimeout(timer)
      resolveExit()
    })
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })

const spawnInterruptedSave = async (
  directory: string,
  attempt: number,
  stopAfter: WriteRecoveryStopPhase,
  oldConfirmed: string,
  newUnconfirmed: string,
): Promise<{ targetPath: string }> => {
  const targetPath = join(directory, `中断-${stopAfter}-${attempt}.md`)
  const newContentPath = join(directory, `new-${stopAfter}-${attempt}.txt`)
  const markerDirectory = join(directory, `marker-${stopAfter}-${attempt}`)
  await writeFile(targetPath, oldConfirmed, 'utf8')
  await writeFile(newContentPath, newUnconfirmed, 'utf8')
  await mkdir(markerDirectory, { recursive: true })

  const child = spawn(process.execPath, [VITE_NODE, CHILD_SCRIPT], {
    env: {
      ...process.env,
      PAPERIN_WR_TARGET: targetPath,
      PAPERIN_WR_NEW_CONTENT: newContentPath,
      PAPERIN_WR_MARKER_DIR: markerDirectory,
      PAPERIN_WR_STOP_AFTER: stopAfter,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  await waitForMarker(markerDirectory, stopAfter, 60_000)
  killProcessTree(child)
  await waitForExit(child, 30_000).catch(() => {})
  child.kill()
  return { targetPath }
}

const assertTargetAfterRecovery = async (
  stopAfter: WriteRecoveryStopPhase,
  targetPath: string,
  oldConfirmed: string,
  newUnconfirmed: string,
): Promise<void> => {
  const actual = await readFile(targetPath, 'utf8')
  if (stopAfter === 'target-synced' || stopAfter === 'committed') {
    expect(actual).toBe(newUnconfirmed)
    return
  }
  if (stopAfter === 'target-copy') {
    expect([oldConfirmed, newUnconfirmed]).toContain(actual)
    return
  }
  expect(actual).toBe(oldConfirmed)
}

const phases: WriteRecoveryStopPhase[] = [
  'preparing',
  'prepared',
  'target-copy',
  'target-synced',
  'committed',
]

describe('真进程保存中断恢复（P0-06）', () => {
  for (const stopAfter of phases) {
    it(`${stopAfter} 阶段 SIGKILL 后 ${REPEATS_PER_PHASE} 次均保留契约`, async () => {
      for (let attempt = 1; attempt <= REPEATS_PER_PHASE; attempt++) {
        const directory = await createTemporaryDirectory()
        const oldConfirmed = `确认版本-${stopAfter}-${attempt} 中文 📝\n`
        const newUnconfirmed =
          stopAfter === 'target-copy'
            ? `${'未确认大块-'.repeat(32_000)}${attempt}\n`
            : `未确认版本-${stopAfter}-${attempt} emoji ✨\n`

        const { targetPath } = await spawnInterruptedSave(
          directory,
          attempt,
          stopAfter,
          oldConfirmed,
          newUnconfirmed,
        )

        await recoverInterruptedFileWrite(targetPath)
        await assertTargetAfterRecovery(stopAfter, targetPath, oldConfirmed, newUnconfirmed)

        expect(await recoverAgain(targetPath)).toEqual({ recovered: 0, failed: 0 })
      }
    }, 600_000)
  }
})
