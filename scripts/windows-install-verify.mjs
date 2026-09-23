/**
 * Windows NSIS 候选安装/升级/卸载循环驱动（仅隔离环境）。
 * 无 --confirm-isolated-environment 时只输出脱敏 dry-run 计划，不启动安装器。
 */

import { spawn } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const NSIS_SILENT_FLAG = '/S'
export const DEFAULT_COMMAND_TIMEOUT_MS = 10 * 60 * 1000
export const SETUP_NAME_PREFIX = 'Paperin-Setup-'
export const SETUP_NAME_SUFFIX = '.exe'
export const CONFIRM_ISOLATED_FLAG = '--confirm-isolated-environment'

/**
 * @param {string[]} argv
 */
export function parseVerifyWindowsInstallArgv(argv) {
  const flags = new Set()
  let from = ''
  let to = ''
  let installDir = ''
  let timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === CONFIRM_ISOLATED_FLAG || token === '--dry-run') {
      flags.add(token)
      continue
    }
    if (token === '--from') {
      from = argv[i + 1] ?? ''
      i += 1
      continue
    }
    if (token === '--to') {
      to = argv[i + 1] ?? ''
      i += 1
      continue
    }
    if (token === '--install-dir') {
      installDir = argv[i + 1] ?? ''
      i += 1
      continue
    }
    if (token === '--timeout-ms') {
      const parsed = Number.parseInt(argv[i + 1] ?? '', 10)
      if (Number.isFinite(parsed) && parsed > 0) timeoutMs = parsed
      i += 1
    }
  }

  return {
    confirmIsolatedEnvironment: flags.has(CONFIRM_ISOLATED_FLAG),
    explicitDryRun: flags.has('--dry-run'),
    from,
    to,
    installDir,
    timeoutMs,
  }
}

/** electron-builder NSIS：安静安装用 /S；/D= 必须是最后一个参数且路径不含引号。 */
export function buildNsisInstallArgs(installDir) {
  const normalized = String(installDir).replace(/\/+$/, '')
  return [NSIS_SILENT_FLAG, `/D=${normalized}`]
}

/** NSIS 卸载器安静模式 */
export function buildNsisUninstallArgs() {
  return [NSIS_SILENT_FLAG]
}

/**
 * @param {string} fileName
 */
export function parseSetupVersionFromName(fileName) {
  const base = basename(fileName)
  if (!base.startsWith(SETUP_NAME_PREFIX) || !base.endsWith(SETUP_NAME_SUFFIX)) {
    return null
  }
  const inner = base.slice(SETUP_NAME_PREFIX.length, -SETUP_NAME_SUFFIX.length)
  return /^\d+\.\d+\.\d+$/.test(inner) ? inner : null
}

/**
 * @param {readonly { name: string; isFile?: boolean }[]} entries
 */
export function discoverCandidateSetupExes(entries) {
  return entries
    .filter((entry) => {
      if (!entry.name.startsWith(SETUP_NAME_PREFIX) || !entry.name.endsWith(SETUP_NAME_SUFFIX)) {
        return false
      }
      if (entry.isFile === false) return false
      return parseSetupVersionFromName(entry.name) !== null
    })
    .map((entry) => ({
      version: parseSetupVersionFromName(entry.name),
      label: `setup-v${parseSetupVersionFromName(entry.name)}`,
    }))
    .sort((a, b) => compareSemver(a.version, b.version))
}

/**
 * @param {string} a
 * @param {string} b
 */
export function compareSemver(a, b) {
  const left = a.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const right = b.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const length = Math.max(left.length, right.length)
  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/**
 * @param {{ code: number | null; signal: NodeJS.Signals | null; timedOut?: boolean }} result
 */
export function interpretInstallerExit(result) {
  if (result.timedOut) {
    return { success: false, outcome: 'timeout', exitCode: null }
  }
  if (result.signal) {
    return { success: false, outcome: 'signal', exitCode: result.code }
  }
  const code = result.code ?? 1
  return {
    success: code === 0,
    outcome: code === 0 ? 'pass' : 'fail',
    exitCode: code,
  }
}

const TEMP_DIR_HINT = /^(?:[A-Z]:\\Windows\\Temp\\|[A-Z]:\\Users\\[^\\]+\\AppData\\Local\\Temp\\)/i
const PROGRAM_FILES_HINT = /^[A-Z]:\\Program Files(?: \(x86\))?\\Paperin$/i

/**
 * 真实安装只允许临时目录或标准 Paperin 安装目录（由调用方传入绝对路径）。
 * @param {string} candidate
 */
export function assertAllowedInstallDirectory(candidate) {
  const normalized = resolve(String(candidate))
  if (!isAbsolute(normalized)) {
    throw new Error('install-dir 必须是绝对路径')
  }
  if (TEMP_DIR_HINT.test(normalized) || PROGRAM_FILES_HINT.test(normalized)) {
    return normalized
  }
  throw new Error('install-dir 必须位于系统 Temp 或 Program Files\\Paperin')
}

/**
 * @param {WindowsInstallEvidence} evidence
 * @param {{ forbidden?: readonly string[] }} [options]
 */
export function serializeWindowsInstallEvidence(evidence, options = {}) {
  const payload = {
    fromVersion: evidence.fromVersion,
    toVersion: evidence.toVersion,
    install: evidence.install,
    association: evidence.association,
    upgrade: evidence.upgrade,
    smoke: evidence.smoke,
    uninstall: evidence.uninstall,
    userFilesRetained: evidence.userFilesRetained,
    mode: evidence.mode,
  }
  const json = JSON.stringify(payload)
  const forbidden = options.forbidden ?? []
  for (const fragment of forbidden) {
    if (fragment && json.includes(fragment)) {
      throw new Error('证据序列化包含禁止片段')
    }
  }
  if (json.includes('C:\\Users\\')) {
    throw new Error('证据序列化不得包含用户目录前缀')
  }
  return json
}

/**
 * @param {{ fromVersion: string; toVersion: string; installDirToken: string }} input
 */
export function buildDryRunPlan(input) {
  return {
    mode: 'dry-run',
    steps: [
      { phase: 'install-base', nsisArgs: buildNsisInstallArgs(input.installDirToken) },
      { phase: 'smoke-core-tasks', nsisArgs: [] },
      { phase: 'upgrade-candidate', nsisArgs: buildNsisInstallArgs(input.installDirToken) },
      { phase: 'association-check', nsisArgs: [] },
      { phase: 'uninstall', nsisArgs: buildNsisUninstallArgs() },
      { phase: 'user-files-hash', nsisArgs: [] },
    ],
    fromVersion: input.fromVersion,
    toVersion: input.toVersion,
  }
}

/**
 * @param {string} directory
 */
export function listSetupEntriesInDirectory(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory).map((name) => {
    const full = resolve(directory, name)
    let isFile = false
    try {
      isFile = statSync(full).isFile()
    } catch {
      isFile = false
    }
    return { name, isFile }
  })
}

/**
 * @param {string} installerPath
 */
export function resolveSetupInstaller(installerPath) {
  const absolute = resolve(installerPath)
  if (!existsSync(absolute)) {
    throw new Error('安装包不存在')
  }
  const version = parseSetupVersionFromName(basename(absolute))
  if (!version) {
    throw new Error('安装包文件名不符合 Paperin-Setup-x.y.z.exe')
  }
  return { absolute, version }
}

export function runCommandWithTimeout(command, args, timeoutMs, spawnFn = spawn) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawnFn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill()
      resolvePromise({ code: null, signal: 'SIGTERM', timedOut: true })
    }, timeoutMs)

    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      rejectPromise(error)
    })

    child.on('close', (code, signal) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolvePromise({ code, signal, timedOut: false })
    })
  })
}

export async function runVerifyWindowsInstall(config) {
  const fromResolved = config.from ? resolveSetupInstaller(config.from) : null
  const toResolved = config.to ? resolveSetupInstaller(config.to) : null
  const fromVersion = fromResolved?.version ?? '0.0.0'
  const toVersion = toResolved?.version ?? fromVersion
  const installDirToken = config.installDir || 'C:\\Program Files\\Paperin'

  if (!config.confirmIsolatedEnvironment || config.explicitDryRun) {
    const plan = buildDryRunPlan({ fromVersion, toVersion, installDirToken })
    const evidence = {
      fromVersion,
      toVersion,
      install: 'fail',
      association: 'fail',
      upgrade: 'fail',
      smoke: 'fail',
      uninstall: 'fail',
      userFilesRetained: false,
      mode: 'dry-run',
    }
    return { plan, evidence, executed: false }
  }

  if (process.platform !== 'win32') {
    throw new Error('真实安装循环仅允许在 win32 隔离环境执行')
  }

  const installDir = assertAllowedInstallDirectory(installDirToken)
  if (!fromResolved || !toResolved) {
    throw new Error('真实执行需要 --from 与 --to 指向有效安装包')
  }

  const evidence = {
    fromVersion: fromResolved.version,
    toVersion: toResolved.version,
    install: 'fail',
    association: 'fail',
    upgrade: 'fail',
    smoke: 'fail',
    uninstall: 'fail',
    userFilesRetained: false,
    mode: 'live',
  }

  const installResult = await runCommandWithTimeout(
    fromResolved.absolute,
    buildNsisInstallArgs(installDir),
    config.timeoutMs,
  )
  evidence.install = interpretInstallerExit(installResult).success ? 'pass' : 'fail'

  // 关联、smoke、升级、卸载与知识库 hash 在 P0-05 后续步骤接入；此处保留 live 骨架。
  return { evidence, executed: true, plan: null }
}

async function main() {
  const config = parseVerifyWindowsInstallArgv(process.argv.slice(2))
  const result = await runVerifyWindowsInstall(config)
  const json = serializeWindowsInstallEvidence(result.evidence)
  process.stdout.write(`${json}\n`)
  if (result.plan) {
    process.stdout.write(`${JSON.stringify({ dryRunPlan: result.plan })}\n`)
  }
  if (!config.confirmIsolatedEnvironment) {
    process.stderr.write(
      '未提供 --confirm-isolated-environment：已拒绝真实安装，仅输出 dry-run 证据。\n',
    )
  }
  if (!result.executed) {
    process.exit(0)
  }
  const failed =
    result.evidence.install === 'fail' ||
    result.evidence.upgrade === 'fail' ||
    result.evidence.smoke === 'fail' ||
    result.evidence.uninstall === 'fail' ||
    result.evidence.association === 'fail'
  process.exit(failed ? 1 : 0)
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])

if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
