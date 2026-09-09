import { describe, expect, it } from 'vitest'
import { applyTypographyFixes, inspectChineseTypography } from './chinese-typography'

describe('inspectChineseTypography 规则', () => {
  it('中文与英文相邻建议插入空格（保留既有空格与数字紧排）', () => {
    const issues = inspectChineseTypography('你好world 与 English中文 与 第3章')
    // 你好world：插入点在 index 2；English中文：插入点在 index 17
    expect(issues).toHaveLength(2)
    expect(issues[0]).toMatchObject({ code: 'CJK_LATIN_SPACING', start: 2, end: 2, replacement: ' ' })
    expect(issues[1]).toMatchObject({ code: 'CJK_LATIN_SPACING', start: 17, end: 17, replacement: ' ' })
  })

  it('全角标点前后空格建议删除', () => {
    const issues = inspectChineseTypography('你好 ，世界。 继续')
    // "你好 ，世界" 中"，"前有一个多余空格；"。 继续" 中"。"后有一个多余空格
    const codes = issues.map((issue) => issue.code)
    expect(codes).toEqual(['FULLWIDTH_PUNCTUATION', 'FULLWIDTH_PUNCTUATION'])
    expect(issues[0].replacement).toBe('')
    expect(issues[1].replacement).toBe('')
  })

  it('行中连续空格建议合并为一个', () => {
    const issues = inspectChineseTypography('文字  太散')
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ code: 'DUPLICATE_SPACE', replacement: ' ' })
    // 行首缩进不处理
    expect(inspectChineseTypography('  缩进保留')).toHaveLength(0)
  })

  it('标题标记后缺空格建议插入', () => {
    const issues = inspectChineseTypography('##标题\n# 也正常\n###无空格')
    expect(issues).toHaveLength(2)
    expect(issues[0]).toMatchObject({ code: 'HEADING_SPACE', line: 1, replacement: ' ' })
    expect(issues[1]).toMatchObject({ code: 'HEADING_SPACE', line: 3, replacement: ' ' })
  })

  it('围栏代码与行内代码不做检查', () => {
    const markdown = ['# 正常', '', '```ts', 'const a = "中文abc  ，"', '```', '', '使用 `代码 中文x` 不查'].join('\n')
    expect(inspectChineseTypography(markdown)).toHaveLength(0)
  })

  it('URL 与公式不做检查', () => {
    const markdown = '详见 https://example.com/中文abc 说明，公式 $a 中文 b$ 结束'
    expect(inspectChineseTypography(markdown)).toHaveLength(0)
  })

  it('Frontmatter 不检查，未闭合围栏安全跳过其后内容', () => {
    const unclosed = ['---', 'title: 中文English', '---', '正文正常', '', '```ts', '中文abc 未闭合'].join('\n')
    expect(inspectChineseTypography(unclosed)).toHaveLength(0)
    expect(inspectChineseTypography('')).toEqual([])
    expect(inspectChineseTypography(undefined as unknown as string)).toEqual([])
  })
})

describe('applyTypographyFixes', () => {
  it('按 issue 从后往前应用替换，多问题一次修复', () => {
    const markdown = '你好world  ，下一句。 结束'
    const issues = inspectChineseTypography(markdown)
    const fixed = applyTypographyFixes(markdown, issues)
    expect(fixed).toBe('你好 world，下一句。结束')
  })

  it('标题缺空格可修复', () => {
    expect(applyTypographyFixes('##标题', inspectChineseTypography('##标题'))).toBe('## 标题')
  })

  it('无 replacement 的 issue 与非法范围被忽略', () => {
    const markdown = '正文'
    expect(applyTypographyFixes(markdown, [
      { code: 'CJK_LATIN_SPACING', start: 1, end: 1, message: '无修复', line: 1 },
      { code: 'FULLWIDTH_PUNCTUATION', start: -1, end: 3, message: '非法', replacement: '', line: 1 },
      { code: 'FULLWIDTH_PUNCTUATION', start: 9, end: 20, message: '越界', replacement: '', line: 1 },
    ])).toBe(markdown)
  })

  it('空列表与异常输入安全', () => {
    expect(applyTypographyFixes('内容', [])).toBe('内容')
    expect(applyTypographyFixes(undefined as unknown as string, [])).toBeUndefined()
  })
})
