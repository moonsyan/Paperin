import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  readWorkflowOrThrow,
  RELEASE_MATERIAL_FILES,
  validateBuildWorkflowSteps,
  validateLocalScriptPaths,
  validateProductionJsYaml,
  validateReleaseIdentity,
  validateReleaseMaterials,
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

describe('validateProductionJsYaml', () => {
  it('拒绝生产树中低于 4.3.2 的 js-yaml', () => {
    expect(
      validateProductionJsYaml({
        packages: {
          'node_modules/js-yaml': { version: '4.3.1' },
          'node_modules/eslint/node_modules/js-yaml': { version: '4.1.0', dev: true },
        },
      }),
    ).toEqual(['生产依赖 js-yaml@4.3.1 低于 4.3.2（node_modules/js-yaml）'])
  })

  it('允许 4.3.2 及以上的生产 js-yaml，并忽略 dev 依赖', () => {
    expect(
      validateProductionJsYaml({
        packages: {
          'node_modules/js-yaml': { version: '4.3.2' },
          'node_modules/eslint/node_modules/js-yaml': { version: '4.1.0', dev: true },
        },
      }),
    ).toEqual([])
  })
})

describe('validateLocalScriptPaths', () => {
  it('报告脚本中不存在的本地配置与目录引用', () => {
    expect(
      validateLocalScriptPaths(
        { demo: 'vite --config design/soft-workbench/vite.config.ts' },
        () => false,
      ),
    ).toEqual(['demo 引用不存在的本地路径: design/soft-workbench/vite.config.ts'])
  })

  it('允许存在的本地路径并忽略 npm run 转发', () => {
    expect(
      validateLocalScriptPaths(
        {
          typecheck: 'tsc -p tsconfig.web.json --noEmit',
          follow: 'npm run typecheck',
        },
        (candidate) => candidate === 'tsconfig.web.json',
      ),
    ).toEqual([])
  })
})

describe('validateReleaseIdentity', () => {
  const validMeta = {
    repository: { type: 'git', url: 'git+https://github.com/moonsyan/Paperin.git' },
    homepage: 'https://github.com/moonsyan/Paperin#readme',
    bugs: { url: 'https://github.com/moonsyan/Paperin/issues' },
    build: {
      publish: { provider: 'github', owner: 'moonsyan', repo: 'Paperin' },
    },
  }

  it('对齐 GitHub moonsyan/Paperin 时无错误', () => {
    expect(
      validateReleaseIdentity({
        repository: 'https://github.com/moonsyan/Paperin.git',
        homepage: 'https://github.com/moonsyan/Paperin#readme',
        bugs: { url: 'https://github.com/moonsyan/Paperin/issues' },
        publish: { provider: 'github', owner: 'moonsyan', repo: 'Paperin' },
      }),
    ).toEqual([])
    expect(validateReleaseIdentity(validMeta)).toEqual([])
  })

  it('repository 缺失或 publish 不一致时应失败', () => {
    expect(validateReleaseIdentity({ ...validMeta, repository: undefined }).some((e) => e.includes('repository'))).toBe(
      true,
    )
    expect(
      validateReleaseIdentity({
        ...validMeta,
        build: { publish: { provider: 'github', owner: 'moonsyan', repo: 'Other' } },
      }).some((e) => e.includes('build.publish')),
    ).toBe(true)
  })

  it('Gitee 脚本含旧仓库名或硬编码 token 时应失败', () => {
    expect(
      validateReleaseIdentity(validMeta, {
        'scripts/sync-gitee.js': "const GITEE_REPO = 'MingProject/mk-editormkEditor'",
      }).some((e) => e.includes('mk-editormkEditor')),
    ).toBe(true)
    expect(
      validateReleaseIdentity(validMeta, {
        'scripts/sync-gitee.js': "const t = access_token = 'secret-token-value'",
      }).some((e) => e.includes('access_token')),
    ).toBe(true)
  })
})

describe('validateReleaseMaterials', () => {
  it('仅有 package.json 时同时报告许可证、隐私、安全和四类 Issue 模板缺失', () => {
    const dir = mkdtempSync(join(tmpdir(), 'paperin-release-empty-'))
    writeFileSync(join(dir, 'package.json'), '{"name":"fixture","license":"MIT"}\n')
    expect(validateReleaseMaterials(dir)).toEqual(
      RELEASE_MATERIAL_FILES.map((relative) => `缺少发行材料: ${relative}`),
    )
  })

  it('补齐合成占位文件后无错误，且占位内容不是仓库许可证文本', () => {
    const dir = mkdtempSync(join(tmpdir(), 'paperin-release-filled-'))
    writeFileSync(join(dir, 'package.json'), '{"name":"fixture","license":"MIT"}\n')
    mkdirSync(join(dir, '.github', 'ISSUE_TEMPLATE'), { recursive: true })
    const placeholder = 'SYNTHETIC-RELEASE-MATERIAL-NOT-A-LICENSE'
    for (const relative of RELEASE_MATERIAL_FILES) {
      writeFileSync(join(dir, relative), `${placeholder}\n${relative}\n`)
    }
    expect(validateReleaseMaterials(dir)).toEqual([])
    expect(readFileSync(join(dir, 'LICENSE'), 'utf8')).toContain(placeholder)
    expect(readFileSync(join(dir, 'LICENSE'), 'utf8')).not.toMatch(/Permission is hereby granted/)
  })
})
