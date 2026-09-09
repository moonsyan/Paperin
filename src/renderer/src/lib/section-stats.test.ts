import { describe, expect, it } from 'vitest'
import { computeSectionStats, goalProgress } from './section-stats'

describe('computeSectionStats 基本结构', () => {
  it('空串与空白输入安全，返回单个 0 字全文节', () => {
    for (const input of ['', '   ', '\n\n']) {
      const res = computeSectionStats(input)
      expect(res.sections).toHaveLength(1)
      expect(res.sections[0].level).toBe(0)
      expect(res.sections[0].words).toBe(0)
      expect(res.totalWords).toBe(0)
    }
  })

  it('无标题文档整篇一节（含中英混排计数）', () => {
    // 你好世界 = 4 字符，hello world = 10 非空白字符
    const res = computeSectionStats('你好世界\nhello world')
    expect(res.sections).toHaveLength(1)
    expect(res.sections[0]).toMatchObject({ level: 0, text: '', startLine: 1, words: 14 })
    expect(res.sections[0].readingMinutes).toBe(1)
    expect(res.totalWords).toBe(14)
  })
})

describe('computeSectionStats 章节归属', () => {
  const DOC = [
    '# 开头', // 1
    '', // 2
    '引言文字四字。', // 3
    '', // 4
    '## 第一节', // 5
    '', // 6
    '第一节内容。', // 7
    '', // 8
    '### 子节', // 9
    '', // 10
    '子节内容。', // 11
    '', // 12
    '## 第二节', // 13
    '', // 14
    '第二节内容。', // 15
  ].join('\n')

  it('嵌套子标题内容归属最近祖先标题（父节累计含子节）', () => {
    const res = computeSectionStats(DOC)
    expect(res.sections.map((s) => s.text)).toEqual(['开头', '第一节', '子节', '第二节'])
    // 开头：标题 2 + 引言 7 + 第一节节 16 + 第二节节 9 = 34
    expect(res.sections[0].words).toBe(34)
    // 第一节：标题 3 + 正文 6 + 子节节 7 = 16
    expect(res.sections[1].words).toBe(16)
    // 子节：标题 2 + 正文 5 = 7
    expect(res.sections[2].words).toBe(7)
    // 第二节：标题 3 + 正文 6 = 9
    expect(res.sections[3].words).toBe(9)
    expect(res.totalWords).toBe(34)
  })

  it('startLine 以正文为基准且默认无 Frontmatter 时等于物理行号', () => {
    const res = computeSectionStats(DOC)
    expect(res.sections.map((s) => s.startLine)).toEqual([1, 5, 9, 13])
  })

  it('章节阅读时长与字数同向递增', () => {
    const res = computeSectionStats(DOC)
    expect(res.sections[0].readingMinutes).toBeGreaterThanOrEqual(res.sections[2].readingMinutes)
    expect(res.sections[0].readingMinutes).toBeGreaterThanOrEqual(1)
  })
})

describe('computeSectionStats 跳过规则', () => {
  it('startLine 以 Frontmatter 之后为基准，Frontmatter 内容不计入字数', () => {
    const res = computeSectionStats(['---', 'title: 示例文档', '---', '# 正文标题', '', '内容。'].join('\n'))
    // 正文标题 4 + 内容。 3 = 7；frontmatter 的 "title: 示例文档" 不计入
    expect(res.totalWords).toBe(7)
    expect(res.sections[0]).toMatchObject({ level: 1, text: '正文标题', startLine: 1, words: 7 })
  })

  it('未闭合 Frontmatter 安全处理，不产生标题也不计入字数', () => {
    const res = computeSectionStats(['---', 'title: 未闭合', '# 伪标题', '正文'].join('\n'))
    expect(res.sections).toHaveLength(1)
    expect(res.sections[0].level).toBe(0)
    expect(res.totalWords).toBe(0)
  })

  it('围栏代码内的伪标题不构成章节，代码内容不计入字数', () => {
    const res = computeSectionStats(
      ['# 真标题', '', '```ts', '# 伪标题', 'const a = "code"', '```', '', '正文。'].join('\n'),
    )
    expect(res.sections).toHaveLength(1)
    // 真标题 3 + 正文。 3 = 6；围栏内容（伪标题/const a = "code"）不计入
    expect(res.sections[0].words).toBe(6)
    expect(res.totalWords).toBe(6)
  })

  it('行内代码与行内公式不计入字数，代码内的美元符号不被当作公式', () => {
    const res = computeSectionStats(
      '# 标题\n\n使用 `code span` 与 $a^2+b$ 公式，花费 $5 美元。',
    )
    // 精确口径：标题(2)+使用(2)+与(1)+公式(2)+，(1)+花费(2)+$(1)+5(1)+美元(2)+。(1)
    expect(res.totalWords).toBe(15)
  })

  it('块级公式整段跳过，公式后的正文正常计数', () => {
    const res = computeSectionStats(['# 题', '', '$$', 'E = mc^2', '\\sum_i x_i', '$$', '', '证毕。'].join('\n'))
    expect(res.sections).toHaveLength(1)
    expect(res.totalWords).toBe(4) // 题 1 + 证毕。 3
  })

  it('列表、引用与链接按既有口径剥离标记、保留文字', () => {
    const res = computeSectionStats(['## 清单', '', '- 第一项', '- [ ] 第二项', '> 引用文字', '看[链接文字](https://example.com/a)即可'].join('\n'))
    // 清单 2 + 第一项 3 + 第二项 3 + 引用文字 4 + 看 1 + 链接文字 4 + 即可 2 = 19
    expect(res.totalWords).toBe(19)
  })
})

describe('computeSectionStats 性能', () => {
  it('约 50 万字符输入在 200ms 内完成', () => {
    const para = `${'这是中英文混合的性能测试段落 '.repeat(3)}performance section stats benchmark。`
    const lines: string[] = []
    let total = 0
    let i = 0
    while (total < 500_000) {
      const line = i % 40 === 0 ? `## 第 ${i} 节标题` : para
      lines.push(line)
      total += line.length + 1
      i++
    }
    const markdown = lines.join('\n')
    const start = performance.now()
    const res = computeSectionStats(markdown)
    const elapsed = performance.now() - start
    expect(res.sections.length).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(200)
  })
})

describe('goalProgress', () => {
  it('0 词数返回 0，超额封顶 100', () => {
    expect(goalProgress(0, 1000)).toBe(0)
    expect(goalProgress(250, 1000)).toBe(25)
    expect(goalProgress(1500, 1000)).toBe(100)
  })

  it('null 或非正目标返回 null', () => {
    expect(goalProgress(100, null)).toBeNull()
    expect(goalProgress(100, 0)).toBeNull()
    expect(goalProgress(100, -5)).toBeNull()
  })
})
