import { describe, expect, it } from 'vitest'
import { findNotes, headings, sampleNotes } from './model'

describe('原型搜索与目录契约', () => {
  it('匹配正文中文并忽略首尾空格', () => {
    expect(findNotes(sampleNotes, '  播客  ').map(note => note.id)).toEqual(['walk'])
  })
  it('空查询列出当前样本，异常标点没有匹配', () => {
    expect(findNotes(sampleNotes, '')).toHaveLength(5)
    expect(findNotes(sampleNotes, '[[不完整')).toEqual([])
  })
  it('只提取完整二级标题，不把未完成语法和正文当作目录', () => {
    expect(headings('# 标题\n## 中文标题\n##\n普通文字\n### 子标题')).toEqual(['中文标题'])
  })
})
