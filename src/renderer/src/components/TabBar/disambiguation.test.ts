import { describe, expect, it } from 'vitest'
import { tabSubdirLabels } from './disambiguation'
import type { OpenFile } from '../Sidebar'

const file = (id: string, name: string, path?: string): OpenFile => ({ id, name, path })

describe('tabSubdirLabels', () => {
  it('同名库内文件：各自标注相对目录', () => {
    const same = [
      file('a', 'readme.md', 'D:/notes/learn/readme.md'),
      file('b', 'readme.md', 'D:/notes/work/readme.md'),
    ]
    expect(tabSubdirLabels(same, 'D:/notes')).toEqual({ a: 'learn', b: 'work' })
  })

  it('唯一名称不生成标记', () => {
    const files = [
      file('a', 'unique.md', 'D:/notes/unique.md'),
      file('b', 'other.md', 'D:/notes/other.md'),
    ]
    expect(tabSubdirLabels(files, 'D:/notes')).toEqual({})
  })

  it('无路径的标签（示例/未命名）不生成标记', () => {
    const files = [file('a', '欢迎'), file('b', '欢迎')]
    expect(tabSubdirLabels(files, 'D:/notes')).toEqual({})
  })

  it('同名混合：有路径的标注，无路径的不标注', () => {
    const files = [
      file('a', 'todo.md', 'D:/notes/a/todo.md'),
      file('b', 'todo.md'),
    ]
    expect(tabSubdirLabels(files, 'D:/notes')).toEqual({ a: 'a' })
  })

  it('外部同名文件：标注父目录名', () => {
    const files = [
      file('a', 'tmp.md', 'D:/downloads/tmp.md'),
      file('b', 'tmp.md', 'D:/docs/tmp.md'),
    ]
    expect(tabSubdirLabels(files)).toEqual({ a: 'downloads', b: 'docs' })
  })

  it('嵌套库内目录：标注完整相对目录链；根级同名无目录段则不标注', () => {
    const files = [
      file('a', 'c.md', 'D:/notes/learn/method/c.md'),
      file('b', 'c.md', 'D:/notes/c.md'),
    ]
    expect(tabSubdirLabels(files, 'D:/notes')).toEqual({ a: 'learn/method' })
  })
})
