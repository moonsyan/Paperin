import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  readWorkflowOrThrow,
  validateBuildWorkflowSteps,
  validateReleaseWorkflowGates,
  verifyCiConfig,
} from './ci-config-gates.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const releasePath = resolve(root, '.github', 'workflows', 'release.yml')
const buildPath = resolve(root, '.github', 'workflows', 'build.yml')

describe('verify-ci-config', () => {
  it('当前仓库 build.yml 与 release.yml 满足门禁', () => {
    const { ok, errors } = verifyCiConfig()
    expect(errors, errors.join('\n')).toEqual([])
    expect(ok).toBe(true)
  })

  it('release.yml 缺 smoke 或无条件正式发布时应失败', () => {
    const release = readWorkflowOrThrow(releasePath)
    expect(validateReleaseWorkflowGates(release)).toEqual([])

    const noSmoke = release.replace('- run: npm run smoke', '- run: npm run smoke-disabled')
    expect(validateReleaseWorkflowGates(noSmoke).some((e) => e.includes('candidate-acceptance'))).toBe(
      true,
    )

    const directPublish = release.replace('draft: true', 'draft: false')
    expect(validateReleaseWorkflowGates(directPublish).length).toBeGreaterThan(0)
  })

  it('build.yml 三平台步骤顺序可被校验', () => {
    const build = readFileSync(buildPath, 'utf8')
    const errors = validateBuildWorkflowSteps(build, ['build-win:', 'build-mac:', 'build-linux:'], [
      'npm ci',
      'npm run typecheck',
      'npm run lint',
      'npm run test:ci',
      'npm run build',
    ])
    expect(errors).toEqual([])
  })
})
