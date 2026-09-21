import { describe, expect, it } from 'vitest'
import {
  MAX_PUBLISH_PROFILES,
  createPublishProfile,
  parsePublishProfiles,
  rememberPublishProfile,
  removePublishProfile,
  sanitizePublishProfileName,
  type PublishOptions,
  type PublishScope,
} from './publish-profile'

const options: PublishOptions = {
  template: 'technical',
  includeToc: false,
  inlineImages: true,
  cleanWikiLinks: true,
}

const scope: PublishScope = { kind: 'document' }

describe('publish-profile', () => {
  it('清洗配置名称：控制字符、空白和超长', () => {
    expect(sanitizePublishProfileName('  博客\n导出  ')).toBe('博客 导出')
    expect(sanitizePublishProfileName('   ')).toBeNull()
    expect(sanitizePublishProfileName('a'.repeat(50))).toHaveLength(40)
  })

  it('记住配置时同 id 覆盖并置顶，最多 20 条', () => {
    const first = createPublishProfile('博客', options, scope, 'p-blog')
    const second = createPublishProfile('论文', { ...options, template: 'paper' }, scope, 'p-paper')
    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    const remembered = rememberPublishProfile(rememberPublishProfile([], first!), second!)
    expect(remembered.map((item) => item.id)).toEqual(['p-paper', 'p-blog'])
    const updated = rememberPublishProfile(remembered, {
      ...first!,
      name: '博客改',
      options: { ...options, includeToc: true },
    })
    expect(updated).toHaveLength(2)
    expect(updated[0]).toMatchObject({ id: 'p-blog', name: '博客改', options: { includeToc: true } })

    const overflow = Array.from({ length: MAX_PUBLISH_PROFILES }, (_, index) =>
      createPublishProfile(`配置${index}`, options, scope, `p-${index}`)!,
    )
    const next = rememberPublishProfile(overflow, createPublishProfile('新', options, scope, 'p-new')!)
    expect(next).toHaveLength(MAX_PUBLISH_PROFILES)
    expect(next[0]?.id).toBe('p-new')
    expect(next.some((item) => item.id === overflow[overflow.length - 1]?.id)).toBe(false)
  })

  it('删除配置只按 id，不改其余项', () => {
    const kept = createPublishProfile('留', options, scope, 'p-keep')!
    const gone = createPublishProfile('删', options, scope, 'p-drop')!
    expect(removePublishProfile([kept, gone], 'p-drop')).toEqual([kept])
  })

  it('解析时丢掉非法项、绝对路径式 id 和空标签范围', () => {
    expect(parsePublishProfiles(undefined)).toEqual([])
    expect(parsePublishProfiles([
      { id: '../x', name: '坏', options, scope },
      { id: 'p-ok', name: '好', options, scope: { kind: 'tag', tag: '  发布  ' } },
      { id: 'p-empty-tag', name: '空标签', options, scope: { kind: 'tag', tag: '   ' } },
      { id: 'p-ok', name: '重复', options, scope },
    ])).toEqual([
      {
        id: 'p-ok',
        name: '好',
        options,
        scope: { kind: 'tag', tag: '发布' },
      },
    ])
  })
})
