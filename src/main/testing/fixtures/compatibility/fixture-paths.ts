import { isAbsolute, normalize, resolve, sep } from 'path'

/** 断言相对路径在夹具根内，禁止绝对路径与 `..` 穿越。 */
export const assertRelativePathWithinRoot = (root: string, relativePath: string): void => {
  if (!relativePath || typeof relativePath !== 'string') {
    throw new Error('INVALID_FIXTURE_PATH')
  }
  if (isAbsolute(relativePath) || relativePath.includes(':')) {
    throw new Error('ABSOLUTE_FIXTURE_PATH')
  }
  const normalized = normalize(relativePath).replace(/\\/g, '/')
  if (normalized.startsWith('../') || normalized === '..') {
    throw new Error('TRAVERSAL_FIXTURE_PATH')
  }
  const resolved = resolve(root, normalized)
  const resolvedRoot = resolve(root)
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${sep}`)) {
    throw new Error('OUTSIDE_FIXTURE_ROOT')
  }
}

export const normalizeFixtureRelativePath = (relativePath: string): string =>
  normalize(relativePath).replace(/\\/g, '/')
