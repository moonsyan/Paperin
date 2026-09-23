#!/usr/bin/env node
/**
 * Windows NSIS 候选安装/升级/卸载循环驱动（仅隔离环境）。
 * 实现见 windows-install-verify.mjs（无 shebang，供 Vitest 加载）。
 */
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import {
  parseVerifyWindowsInstallArgv,
  runVerifyWindowsInstall,
  serializeWindowsInstallEvidence,
} from './windows-install-verify.mjs'

async function main() {
  const config = parseVerifyWindowsInstallArgv(process.argv.slice(2))
  const result = await runVerifyWindowsInstall(config)
  const json = serializeWindowsInstallEvidence(result.evidence)
  process.stdout.write(json + '\n')
  if (result.plan) {
    process.stdout.write(JSON.stringify({ dryRunPlan: result.plan }) + '\n')
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
