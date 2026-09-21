import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const buildWorkflowPath = resolve(root, '.github', 'workflows', 'build.yml')
const releaseWorkflowPath = resolve(root, '.github', 'workflows', 'release.yml')

export const BUILD_JOBS = ['build-win:', 'build-mac:', 'build-linux:']
export const BUILD_REQUIRED_STEPS = [
  'npm ci',
  'npm run typecheck',
  'npm run lint',
  'npm run test:ci',
  'npm run build',
]

export function readWorkflowOrThrow(workflowPath) {
  try {
    return readFileSync(workflowPath, 'utf8')
  } catch {
    throw new Error(`未找到 CI workflow：${workflowPath}`)
  }
}

export function sliceJobSections(content, jobMarkers) {
  return jobMarkers.map((marker) => {
    const start = content.indexOf(marker)
    const next = jobMarkers
      .map((m) => content.indexOf(m))
      .filter((i) => i > start)
      .reduce((min, i) => Math.min(min, i), content.length)
    return { marker, text: content.slice(start, next) }
  })
}

export function validateBuildWorkflowSteps(content, jobMarkers, requiredSteps) {
  const errors = []
  const jobSections = sliceJobSections(content, jobMarkers)

  for (const { marker, text } of jobSections) {
    const positions = requiredSteps.map((step) => ({ step, index: text.indexOf(step) }))
    const missing = positions.filter(({ index }) => index === -1).map(({ step }) => step)
    if (missing.length > 0) {
      errors.push(`${marker} 缺少步骤: ${missing.join('、')}`)
      continue
    }
    let previous = -1
    for (const { step, index } of positions) {
      if (index < previous) {
        errors.push(`${marker} 步骤乱序: "${step}" 应位于前一个门禁之后`)
        break
      }
      previous = index
    }
  }

  return errors
}

function sliceJobSection(content, marker) {
  const start = content.indexOf(marker)
  if (start === -1) return null
  const afterMarker = start + marker.length
  const tail = content.slice(afterMarker)
  const nextJob = tail.search(/\n  [a-z][a-z0-9-]+:/)
  if (nextJob === -1) return content.slice(start)
  return content.slice(start, afterMarker + nextJob)
}

export function validateReleaseWorkflowGates(content) {
  const errors = []

  if (!content.includes('candidate-acceptance:')) {
    errors.push('release.yml 缺少 candidate-acceptance job（候选包验收）')
  }
  const acceptanceSection = sliceJobSection(content, 'candidate-acceptance:')
  const hasSmokeStep =
    acceptanceSection && /- run: npm run smoke\s*$/m.test(acceptanceSection)
  if (!hasSmokeStep) {
    errors.push('release.yml 的 candidate-acceptance job 缺少 npm run smoke（候选验收步骤）')
  }
  if (!content.includes('candidate-release:')) {
    errors.push('release.yml 缺少 candidate-release job（候选 draft 发布）')
  }
  if (!content.includes('publish-formal:')) {
    errors.push('release.yml 缺少 publish-formal job（正式发行显式门禁）')
  }
  if (!content.includes("inputs.confirm_publish == 'PUBLISH'")) {
    errors.push('publish-formal 必须要求 confirm_publish == PUBLISH')
  }
  if (!content.includes('inputs.candidate_sha')) {
    errors.push('publish-formal 必须绑定 inputs.candidate_sha（与候选记录同一 commit）')
  }

  const candidateSection = sliceJobSection(content, 'candidate-release:')
  if (candidateSection && !candidateSection.includes('draft: true')) {
    errors.push('candidate-release 必须使用 draft: true，不得直接正式发布')
  }

  const publishSection = sliceJobSection(content, 'publish-formal:')
  if (publishSection && publishSection.includes('softprops/action-gh-release@v2')) {
    errors.push('publish-formal 不得无条件创建/覆盖 Release；应校验候选后 gh release edit')
  }

  if (/draft:\s*false/.test(content)) {
    const withoutFormalEdit =
      !content.includes('gh release edit') || !content.includes('--draft=false')
    if (withoutFormalEdit) {
      errors.push('release.yml 存在 draft: false 但未通过 publish-formal 的 gh release edit 门禁')
    }
  }

  return errors
}

const parseVersionParts = (version) =>
  String(version)
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0)

const isVersionLower = (version, minimum) => {
  const left = parseVersionParts(version)
  const right = parseVersionParts(minimum)
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index++) {
    const a = left[index] ?? 0
    const b = right[index] ?? 0
    if (a < b) return true
    if (a > b) return false
  }
  return false
}

const JS_YAML_MIN_PRODUCTION = '4.3.2'

/** 生产锁文件不得包含低于修复 CPU 消耗漏洞所需版本的 js-yaml。dev 依赖单独审计。 */
export function validateProductionJsYaml(lockfile, minVersion = JS_YAML_MIN_PRODUCTION) {
  const errors = []
  const packages = lockfile?.packages ?? {}
  for (const [path, pkg] of Object.entries(packages)) {
    if (!path.endsWith('/js-yaml') && path !== 'node_modules/js-yaml') continue
    if (pkg?.dev === true) continue
    const version = String(pkg?.version ?? '')
    if (!version || isVersionLower(version, minVersion)) {
      errors.push(`生产依赖 js-yaml@${version || '未知'} 低于 ${minVersion}（${path}）`)
    }
  }
  return errors
}

export function verifyCiConfig() {
  const errors = []

  let buildContent
  let releaseContent
  try {
    buildContent = readWorkflowOrThrow(buildWorkflowPath)
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
    buildContent = ''
  }
  try {
    releaseContent = readWorkflowOrThrow(releaseWorkflowPath)
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
    releaseContent = ''
  }

  if (buildContent) {
    errors.push(...validateBuildWorkflowSteps(buildContent, BUILD_JOBS, BUILD_REQUIRED_STEPS))
  }
  if (releaseContent) {
    errors.push(...validateReleaseWorkflowGates(releaseContent))
  }

  try {
    const lockfile = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'))
    errors.push(...validateProductionJsYaml(lockfile))
  } catch (error) {
    errors.push(`无法读取 package-lock.json：${error instanceof Error ? error.message : String(error)}`)
  }

  return { ok: errors.length === 0, errors }
}
