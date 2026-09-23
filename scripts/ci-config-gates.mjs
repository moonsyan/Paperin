import { existsSync, readdirSync, readFileSync } from 'node:fs'
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
    acceptanceSection
    && /(?:^|\s)npm run smoke(?:\s|$)/m.test(acceptanceSection)
  if (!hasSmokeStep) {
    errors.push('release.yml 的 candidate-acceptance job 缺少 npm run smoke（候选验收步骤）')
  }
  const hasBuildBeforeSmoke =
    acceptanceSection
    && /npm run build[\s\S]*?(?:^|\s)npm run smoke(?:\s|$)/m.test(acceptanceSection)
  if (hasSmokeStep && !hasBuildBeforeSmoke) {
    errors.push('release.yml 的 candidate-acceptance 须在 smoke 前执行 npm run build')
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

  errors.push(...validateWindowsInstallAcceptanceJob(content))

  return errors
}

export const WINDOWS_INSTALL_VERIFY_SCRIPT = 'scripts/verify-windows-install.mjs'

/**
 * 可选 installed-acceptance-win job：未启用时不报错；启用时必须跑 verify-windows-install 且不得伪造通过。
 * @param {string} content
 */
export function validateWindowsInstallAcceptanceJob(content) {
  const errors = []
  const marker = 'installed-acceptance-win:'
  if (!/\n  installed-acceptance-win:/.test(content)) {
    return errors
  }
  const section = sliceJobSection(content, marker)
  if (!section) {
    return errors
  }
  const disabled = /\n\s+if:\s*false\b/.test(section) || section.includes('if: ${{ false }}')
  if (disabled) {
    return errors
  }
  if (!section.includes('verify-windows-install.mjs')) {
    errors.push('installed-acceptance-win 必须运行 scripts/verify-windows-install.mjs')
  }
  if (!section.includes('--confirm-isolated-environment')) {
    errors.push('installed-acceptance-win 必须显式传入 --confirm-isolated-environment')
  }
  if (/run:\s*echo\s+.*(pass|success|通过)/i.test(section) && !section.includes('verify-windows-install.mjs')) {
    errors.push('installed-acceptance-win 不得用 echo 伪造验收通过')
  }
  return errors
}

const SCRIPT_FLAG_PATH = /(?:--config|-p)\s+(?:"([^"]+)"|'([^']+)'|(\S+))/g

const localPathFromFlagValue = (raw) => {
  const normalized = String(raw).replace(/\\/g, '/').replace(/\/\*\*.*$/, '')
  if (!normalized || normalized.startsWith('-') || /^[a-z]+:\/\//i.test(normalized)) return ''
  return normalized
}

/** 检查 npm scripts 中 --config / -p 指向的仓库相对路径是否真实存在。 */
export function validateLocalScriptPaths(scripts, exists) {
  const errors = []
  for (const [name, command] of Object.entries(scripts ?? {})) {
    const seen = new Set()
    for (const match of String(command).matchAll(SCRIPT_FLAG_PATH)) {
      const candidate = localPathFromFlagValue(match[1] ?? match[2] ?? match[3] ?? '')
      if (!candidate || seen.has(candidate)) continue
      seen.add(candidate)
      if (!exists(candidate)) {
        errors.push(`${name} 引用不存在的本地路径: ${candidate}`)
      }
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

  try {
    const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
    errors.push(
      ...validateLocalScriptPaths(packageJson.scripts, (relativePath) => existsSync(resolve(root, relativePath))),
    )
    errors.push(...validateReleaseIdentity(packageJson, readReleaseScriptContents(root)))
  } catch (error) {
    errors.push(`无法读取 package.json：${error instanceof Error ? error.message : String(error)}`)
  }

  errors.push(...validateReleaseMaterials(root))

  if (!existsSync(resolve(root, WINDOWS_INSTALL_VERIFY_SCRIPT))) {
    errors.push(`缺少 Windows 安装验收脚本: ${WINDOWS_INSTALL_VERIFY_SCRIPT}`)
  }

  return { ok: errors.length === 0, errors }
}

export const RELEASE_MATERIAL_FILES = [
  'LICENSE',
  'THIRD-PARTY-NOTICES.md',
  'PRIVACY.md',
  'SECURITY.md',
  '.github/ISSUE_TEMPLATE/bug.yml',
  '.github/ISSUE_TEMPLATE/compatibility.yml',
  '.github/ISSUE_TEMPLATE/data-safety.yml',
  '.github/ISSUE_TEMPLATE/feature.yml',
]

export const RELEASE_GITHUB_OWNER = 'moonsyan'
export const RELEASE_GITHUB_REPO = 'Paperin'
export const FORBIDDEN_LEGACY_GITEE_REPO_MARKERS = ['mk-editormkEditor']

const normalizeRepositoryUrl = (repository) => {
  if (typeof repository === 'string') return repository.trim()
  if (repository && typeof repository.url === 'string') {
    return repository.url.replace(/^git\+/, '').trim()
  }
  return ''
}

/** 校验 package.json 发布身份与 electron-builder publish 目标一致，均为 GitHub moonsyan/Paperin。 */
export function validateReleaseIdentity(packageMeta, scriptContents = {}) {
  const errors = []
  const owner = RELEASE_GITHUB_OWNER
  const repo = RELEASE_GITHUB_REPO
  const expectedHomepage = `https://github.com/${owner}/${repo}#readme`
  const expectedBugsUrl = `https://github.com/${owner}/${repo}/issues`

  const repositoryUrl = normalizeRepositoryUrl(packageMeta?.repository)
  if (!repositoryUrl) {
    errors.push('package.json 缺少 repository（GitHub moonsyan/Paperin）')
  } else if (!repositoryUrl.includes(`github.com/${owner}/${repo}`)) {
    errors.push(`repository 必须为 GitHub ${owner}/${repo}，当前: ${repositoryUrl}`)
  }

  const homepage = String(packageMeta?.homepage ?? '').trim()
  if (!homepage) {
    errors.push('package.json 缺少 homepage')
  } else if (homepage !== expectedHomepage) {
    errors.push(`homepage 应对齐 ${expectedHomepage}`)
  }

  const bugsUrl = String(packageMeta?.bugs?.url ?? '').trim()
  if (!bugsUrl) {
    errors.push('package.json 缺少 bugs.url')
  } else if (bugsUrl !== expectedBugsUrl) {
    errors.push(`bugs.url 应对齐 ${expectedBugsUrl}`)
  }

  const publish = packageMeta?.build?.publish ?? packageMeta?.publish
  if (!publish || typeof publish !== 'object') {
    errors.push('package.json 缺少 build.publish（GitHub 发布目标）')
  } else {
    if (publish.provider !== 'github') {
      errors.push(`build.publish.provider 必须为 github，当前: ${publish.provider ?? '缺失'}`)
    }
    if (publish.owner !== owner || publish.repo !== repo) {
      errors.push(
        `build.publish 必须为 owner=${owner} repo=${repo}，当前: owner=${publish.owner ?? '缺失'} repo=${publish.repo ?? '缺失'}`,
      )
    }
  }

  for (const [relativePath, content] of Object.entries(scriptContents)) {
    const text = String(content)
    for (const marker of FORBIDDEN_LEGACY_GITEE_REPO_MARKERS) {
      if (text.includes(marker)) {
        errors.push(`${relativePath} 仍含已废弃的 Gitee 仓库标识: ${marker}`)
      }
    }
    if (/access_token\s*=\s*['"][^{$][^'"]*['"]/.test(text)) {
      errors.push(`${relativePath} 不得硬编码 access_token`)
    }
  }

  return errors
}

const RELEASE_SCRIPT_SCAN_SKIP = new Set(['ci-config-gates.mjs'])

/** 读取 scripts 下 JS/MJS 文本，供 validateReleaseIdentity 扫描废弃 Gitee 标识（跳过门禁与单测文件）。 */
export function readReleaseScriptContents(rootDir) {
  const scriptsDir = resolve(rootDir, 'scripts')
  const contents = {}
  if (!existsSync(scriptsDir)) return contents
  for (const name of readdirSync(scriptsDir)) {
    if (!/\.(js|mjs|cjs)$/.test(name)) continue
    if (RELEASE_SCRIPT_SCAN_SKIP.has(name) || /\.test\.(js|mjs|cjs)$/.test(name)) continue
    const relativePath = `scripts/${name}`
    contents[relativePath] = readFileSync(resolve(scriptsDir, name), 'utf8')
  }
  return contents
}

/** 公开发布前置材料：存在性检查，不把 package.json 的 license 字段当作完整授权。 */
export function validateReleaseMaterials(rootDir) {
  const errors = []
  for (const relative of RELEASE_MATERIAL_FILES) {
    if (!existsSync(resolve(rootDir, relative))) {
      errors.push(`缺少发行材料: ${relative}`)
    }
  }
  return errors
}
