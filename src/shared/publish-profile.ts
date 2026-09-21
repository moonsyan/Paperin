export const MAX_PUBLISH_PROFILES = 20
export const MAX_PUBLISH_PROFILE_NAME_LENGTH = 40
export const MAX_PUBLISH_TAG_LENGTH = 64

const PROFILE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const PUBLISH_TEMPLATES = ['blog', 'technical', 'paper', 'wechat'] as const

export type PublishTemplate = (typeof PUBLISH_TEMPLATES)[number]

export interface PublishOptions {
  template: PublishTemplate
  includeToc: boolean
  inlineImages: boolean
  cleanWikiLinks: boolean
}

/** 发布范围：当前文档 / 当前目录集合 / 按标签集合 */
export type PublishScope =
  | { kind: 'document' }
  | { kind: 'directory' }
  | { kind: 'tag'; tag: string }

export interface PublishProfile {
  id: string
  name: string
  options: PublishOptions
  scope: PublishScope
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const asBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback

/** 配置名称：去掉控制字符、压缩空白、限长；空名称不可用。 */
export const sanitizePublishProfileName = (value: string): string | null => {
  const cleaned = value.replace(/[\r\n\u0000]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_PUBLISH_PROFILE_NAME_LENGTH)
  return cleaned || null
}

const sanitizeTag = (value: string): string | null => {
  const cleaned = value.replace(/[\r\n\u0000]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_PUBLISH_TAG_LENGTH)
  return cleaned || null
}

export const parsePublishOptions = (value: unknown): PublishOptions | null => {
  if (!isRecord(value)) return null
  const template = value.template
  if (typeof template !== 'string' || !(PUBLISH_TEMPLATES as readonly string[]).includes(template)) {
    return null
  }
  return {
    template: template as PublishTemplate,
    includeToc: asBoolean(value.includeToc, true),
    inlineImages: asBoolean(value.inlineImages, true),
    cleanWikiLinks: asBoolean(value.cleanWikiLinks, true),
  }
}

export const parsePublishScope = (value: unknown): PublishScope | null => {
  if (!isRecord(value) || typeof value.kind !== 'string') return null
  if (value.kind === 'document') return { kind: 'document' }
  if (value.kind === 'directory') return { kind: 'directory' }
  if (value.kind === 'tag') {
    if (typeof value.tag !== 'string') return null
    const tag = sanitizeTag(value.tag)
    if (!tag) return null
    return { kind: 'tag', tag }
  }
  return null
}

export const parsePublishProfile = (value: unknown): PublishProfile | null => {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') return null
  if (!PROFILE_ID_PATTERN.test(value.id)) return null
  const name = sanitizePublishProfileName(value.name)
  const options = parsePublishOptions(value.options)
  const scope = parsePublishScope(value.scope)
  if (!name || !options || !scope) return null
  return { id: value.id, name, options, scope }
}

export const parsePublishProfiles = (value: unknown): PublishProfile[] => {
  if (!Array.isArray(value)) return []
  const profiles: PublishProfile[] = []
  const seen = new Set<string>()
  for (const candidate of value) {
    const profile = parsePublishProfile(candidate)
    if (!profile || seen.has(profile.id)) continue
    seen.add(profile.id)
    profiles.push(profile)
    if (profiles.length >= MAX_PUBLISH_PROFILES) break
  }
  return profiles
}

export const createPublishProfile = (
  name: string,
  options: PublishOptions,
  scope: PublishScope,
  id?: string,
): PublishProfile | null => {
  const sanitizedName = sanitizePublishProfileName(name)
  const parsedOptions = parsePublishOptions(options)
  const parsedScope = parsePublishScope(scope)
  if (!sanitizedName || !parsedOptions || !parsedScope) return null
  const profileId =
    typeof id === 'string' && PROFILE_ID_PATTERN.test(id)
      ? id
      : `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return { id: profileId, name: sanitizedName, options: parsedOptions, scope: parsedScope }
}

/** 记住一条发布配置。同 id 覆盖并置顶，最多 20 条。 */
export const rememberPublishProfile = (
  current: readonly PublishProfile[],
  profile: PublishProfile,
): PublishProfile[] => {
  const parsed = parsePublishProfile(profile)
  if (!parsed) return [...current]
  return [parsed, ...current.filter((item) => item.id !== parsed.id)].slice(0, MAX_PUBLISH_PROFILES)
}

export const removePublishProfile = (
  current: readonly PublishProfile[],
  id: string,
): PublishProfile[] => current.filter((item) => item.id !== id)
