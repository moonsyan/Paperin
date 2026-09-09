import { describe, expect, it } from 'vitest'
import { diffLines } from './diff'

const types = (result: { lines: Array<{ type: string }> }) =>
  result.lines.map((l) => l.type).join(',')

describe('diffLines：基本行为', () => {
  it('完全相同的文本全部为 same，无增删', () => {
    const result = diffLines('a\nb\nc', 'a\nb\nc')
    expect(types(result)).toBe('same,same,same')
    expect(result.added).toBe(0)
    expect(result.removed).toBe(0)
    expect(result.truncated).toBe(false)
    expect(result.lines.map((l) => l.text)).toEqual(['a', 'b', 'c'])
  })

  it('修改一行产生相邻的 del+add 对，行号正确', () => {
    const result = diffLines('# 标题\n旧内容\n结尾', '# 标题\n新内容\n结尾')
    expect(types(result)).toBe('same,del,add,same')
    const del = result.lines[1]
    const add = result.lines[2]
    expect(del).toMatchObject({ type: 'del', text: '旧内容', oldNumber: 2 })
    expect(add).toMatchObject({ type: 'add', text: '新内容', newNumber: 2 })
    expect(result.added).toBe(1)
    expect(result.removed).toBe(1)
  })

  it('末尾追加行只产生 add（公共后缀裁剪）', () => {
    const result = diffLines('第一段', '第一段\n第二段\n第三段')
    expect(types(result)).toBe('same,add,add')
    expect(result.lines[2]).toMatchObject({ type: 'add', text: '第三段', newNumber: 3 })
    expect(result.added).toBe(2)
    expect(result.removed).toBe(0)
  })

  it('删除中间行只产生 del 且后续行号连续', () => {
    const result = diffLines('a\nb\nc', 'a\nc')
    expect(types(result)).toBe('same,del,same')
    // 尾部 same 行的 new 行号基于新文档计数
    expect(result.lines[2]?.newNumber).toBe(2)
  })

  it('空旧文本按单个空行处理：删除空行后新增全部内容', () => {
    const result = diffLines('', '第一行\n第二行')
    expect(types(result)).toBe('del,add,add')
    expect(result.added).toBe(2)
    expect(result.removed).toBe(1)
  })

  it('两份空文本等价于单个相同的空行，无增删', () => {
    const result = diffLines('', '')
    expect(result.lines.map((l) => l.type)).toEqual(['same'])
    expect(result.added).toBe(0)
    expect(result.removed).toBe(0)
  })
})

describe('diffLines：中文与边界', () => {
  it('中文段落往返对比保持文本完整不乱码', () => {
    const oldText = '中文标题\n第一段包含中文与 English 混排。'
    const newText = '中文标题\n第一段已修改，含「标点」符号。'
    const result = diffLines(oldText, newText)
    const texts = result.lines.map((l) => l.text)
    expect(texts).toContain('中文标题')
    expect(texts).toContain('第一段包含中文与 English 混排。')
    expect(texts).toContain('第一段已修改，含「标点」符号。')
  })

  it('重排顺序经 LCS 对齐：公共行保留，其余 del+add', () => {
    const result = diffLines('甲\n乙', '乙\n甲')
    // LCS 找到公共的「乙」：只对「甲」做一次删除与一次新增
    expect(types(result)).toBe('del,same,add')
    expect(result.added).toBe(1)
    expect(result.removed).toBe(1)
  })

  it('超限中段退化为整块替换并标记 truncated', () => {
    const oldText = Array.from({ length: 6 }, (_, i) => `旧${i}`).join('\n')
    const newText = Array.from({ length: 4 }, (_, i) => `新${i}`).join('\n')
    // cap=2 < 中段规模：放弃逐行对齐
    const result = diffLines(oldText, newText, 2)
    expect(result.truncated).toBe(true)
    expect(result.removed).toBe(6)
    expect(result.added).toBe(4)
    // 内容仍然完整保留
    expect(result.lines.filter((l) => l.type === 'del').map((l) => l.text)).toEqual(
      Array.from({ length: 6 }, (_, i) => `旧${i}`),
    )
  })

  it('公共前缀裁剪后小差异区不受 cap 影响', () => {
    const prefix = Array.from({ length: 50 }, (_, i) => `同${i}`).join('\n')
    const result = diffLines(`${prefix}\n旧`, `${prefix}\n新`, 2)
    expect(result.truncated).toBe(false)
    expect(types(result)).toBe(
      `${Array.from({ length: 50 }, () => 'same').join(',')},del,add`,
    )
  })
})
