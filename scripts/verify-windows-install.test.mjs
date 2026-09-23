import { describe, expect, it } from 'vitest'

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

import {
  assertAllowedInstallDirectory,
  buildDryRunPlan,
  buildNsisInstallArgs,
  buildNsisUninstallArgs,
  discoverCandidateSetupExes,
  interpretInstallerExit,
  listSetupEntriesInDirectory,
  NSIS_SILENT_FLAG,
  parseSetupVersionFromName,
  parseVerifyWindowsInstallArgv,
  runCommandWithTimeout,
  runVerifyWindowsInstall,
  serializeWindowsInstallEvidence,
} from './windows-install-verify.mjs'

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CONFIRM_ISOLATED_ENVIRONMENT = '--confirm-isolated-environment'

describe('verify-windows-install NSIS 参数', () => {
  it('安静安装使用 /S 且 /D= 位于末尾', () => {
    expect(buildNsisInstallArgs('C:\\Program Files\\Paperin')).toEqual([
      NSIS_SILENT_FLAG,
      '/D=C:\\Program Files\\Paperin',
    ])
  })

  it('安静卸载仅使用 /S', () => {
    expect(buildNsisUninstallArgs()).toEqual([NSIS_SILENT_FLAG])
  })
})

describe('候选 Setup exe 发现', () => {
  it('从目录条目解析 semver 并排序', () => {
    const found = discoverCandidateSetupExes([
      { name: 'Paperin-Setup-0.7.0.exe', isFile: true },
      { name: 'Paperin-Setup-0.6.0.exe', isFile: true },
      { name: 'readme.txt', isFile: true },
      { name: 'Paperin-Setup-bad.exe', isFile: true },
      { name: 'Paperin-Setup-0.8.0.exe', isFile: false },
    ])
    expect(found.map((item) => item.version)).toEqual(['0.6.0', '0.7.0'])
    expect(parseSetupVersionFromName('Paperin-Setup-0.6.0.exe')).toBe('0.6.0')
  })

  it('listSetupEntriesInDirectory 读取真实临时目录', () => {
    const dir = mkdtempSync(join(tmpdir(), 'paperin-setup-discover-'))
    try {
      writeFileSync(join(dir, 'Paperin-Setup-0.7.0.exe'), '')
      writeFileSync(join(dir, 'notes.md'), '# x')
      const entries = listSetupEntriesInDirectory(dir)
      expect(discoverCandidateSetupExes(entries).map((item) => item.version)).toEqual(['0.7.0'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('超时与退出码', () => {
  it('interpretInstallerExit 识别超时、信号与非零退出', () => {
    expect(interpretInstallerExit({ code: 0, signal: null, timedOut: false })).toMatchObject({
      success: true,
      outcome: 'pass',
      exitCode: 0,
    })
    expect(interpretInstallerExit({ code: 2, signal: null, timedOut: false })).toMatchObject({
      success: false,
      outcome: 'fail',
      exitCode: 2,
    })
    expect(interpretInstallerExit({ code: null, signal: 'SIGTERM', timedOut: true })).toMatchObject({
      success: false,
      outcome: 'timeout',
    })
  })

  it('runCommandWithTimeout 在子进程不退出时标记超时', async () => {
    const { EventEmitter } = await import('node:events')
    let killed = false
    const spawnFn = () => {
      const child = new EventEmitter()
      child.kill = () => {
        killed = true
      }
      return child
    }
    const promise = runCommandWithTimeout('ignored.exe', [NSIS_SILENT_FLAG], 25, spawnFn)
    const result = await promise
    expect(result.timedOut).toBe(true)
    expect(killed).toBe(true)
  })
})

describe('argv 与隔离门禁', () => {
  it('无 confirm 旗标时不允许 live 执行', async () => {
    const config = parseVerifyWindowsInstallArgv([
      '--from',
      'release/0.6.0/Paperin-Setup-0.6.0.exe',
      '--to',
      'release/0.7.0/Paperin-Setup-0.7.0.exe',
    ])
    expect(config.confirmIsolatedEnvironment).toBe(false)
    const dir = mkdtempSync(join(tmpdir(), 'paperin-install-dry-'))
    try {
      mkdirSync(join(dir, 'release', '0.6.0'), { recursive: true })
      mkdirSync(join(dir, 'release', '0.7.0'), { recursive: true })
      writeFileSync(join(dir, 'release', '0.6.0', 'Paperin-Setup-0.6.0.exe'), '')
      writeFileSync(join(dir, 'release', '0.7.0', 'Paperin-Setup-0.7.0.exe'), '')
      const result = await runVerifyWindowsInstall({
        ...config,
        from: join(dir, 'release', '0.6.0', 'Paperin-Setup-0.6.0.exe'),
        to: join(dir, 'release', '0.7.0', 'Paperin-Setup-0.7.0.exe'),
      })
      expect(result.executed).toBe(false)
      expect(result.evidence.mode).toBe('dry-run')
      expect(result.plan?.mode).toBe('dry-run')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('显式 --confirm-isolated-environment 才进入 live 分支', () => {
    const config = parseVerifyWindowsInstallArgv([
      CONFIRM_ISOLATED_ENVIRONMENT,
      '--from',
      'a.exe',
      '--to',
      'b.exe',
    ])
    expect(config.confirmIsolatedEnvironment).toBe(true)
  })
})

describe('证据脱敏序列化', () => {
  it('JSON 不得包含用户目录、工作区路径、文件名或正文 marker', () => {
    const workspaceMarker = join(scriptRoot, 'src', 'marker')
    const secretFile = 'Paperin-Setup-0.7.0.exe'
    const bodyMarker = 'paperin_body_must_not_persist'
    const userPrefix = 'C:\\Users\\tester\\AppData\\Local\\Temp\\paperin'

    const evidence = {
      fromVersion: '0.6.0',
      toVersion: '0.7.0',
      install: 'pass',
      association: 'pass',
      upgrade: 'pass',
      smoke: 'pass',
      uninstall: 'pass',
      userFilesRetained: true,
      mode: 'dry-run',
    }

    const json = serializeWindowsInstallEvidence(evidence, {
      forbidden: [workspaceMarker, secretFile, bodyMarker, userPrefix],
    })
    expect(json).not.toContain('C:\\Users\\')
    expect(json).not.toContain(workspaceMarker)
    expect(json).not.toContain(secretFile)
    expect(json).not.toContain(bodyMarker)
    expect(json).not.toContain(userPrefix)
    expect(JSON.parse(json)).toEqual({
      fromVersion: '0.6.0',
      toVersion: '0.7.0',
      install: 'pass',
      association: 'pass',
      upgrade: 'pass',
      smoke: 'pass',
      uninstall: 'pass',
      userFilesRetained: true,
      mode: 'dry-run',
    })
  })

  it('dry-run 计划步骤只暴露 phase 与 NSIS 参数，不含安装包路径', () => {
    const plan = buildDryRunPlan({
      fromVersion: '0.6.0',
      toVersion: '0.7.0',
      installDirToken: 'C:\\Program Files\\Paperin',
    })
    const serialized = JSON.stringify(plan)
    expect(serialized).not.toContain('Paperin-Setup')
    expect(serialized).not.toContain(scriptRoot)
    expect(plan.steps.some((step) => step.phase === 'uninstall')).toBe(true)
  })
})

describe('install-dir 安全边界', () => {
  it('允许 Temp 与 Program Files\\Paperin', () => {
    expect(assertAllowedInstallDirectory('C:\\Program Files\\Paperin')).toContain('Paperin')
    expect(
      assertAllowedInstallDirectory('C:\\Users\\sandbox\\AppData\\Local\\Temp\\paperin-install'),
    ).toContain('paperin-install')
  })

  it('拒绝非白名单目录', () => {
    expect(() => assertAllowedInstallDirectory('D:\\project\\Paperin\\release')).toThrow(
      /Temp|Program Files/,
    )
  })
})
