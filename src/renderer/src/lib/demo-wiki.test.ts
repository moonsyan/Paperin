import { describe, expect, it } from 'vitest'
import { resolveDemoWikiTarget, listDemoWikiLinkFiles } from './demo-wiki'

const demos = [
  { id: 'r11-old-note', name: '网关改造备忘（旧笔记）.md' },
  { id: 'r11-tech-note', name: 'API 网关技术说明（草稿）.md' },
  { id: 'r11-source-a', name: '缓存失效策略（合成来源 A）.md' },
]

describe('resolveDemoWikiTarget', () => {
  it('按演示文件名（去掉扩展名）解析双链目标', () => {
    expect(resolveDemoWikiTarget('网关改造备忘（旧笔记）', demos)).toEqual({
      resolved: true,
      id: 'r11-old-note',
    })
    expect(resolveDemoWikiTarget('API 网关技术说明（草稿）.md', demos)).toEqual({
      resolved: true,
      id: 'r11-tech-note',
    })
  })

  it('带锚点时仍解析到演示文件', () => {
    expect(resolveDemoWikiTarget('网关改造备忘（旧笔记）#背景', demos)).toEqual({
      resolved: true,
      id: 'r11-old-note',
    })
  })

  it('找不到时返回未解析', () => {
    expect(resolveDemoWikiTarget('不存在的笔记', demos)).toEqual({ resolved: false, id: '' })
  })
})

describe('listDemoWikiLinkFiles', () => {
  it('列出可补全的演示笔记标题', () => {
    expect(listDemoWikiLinkFiles(demos)).toEqual([
      { name: '网关改造备忘（旧笔记）', path: 'demo:r11-old-note' },
      { name: 'API 网关技术说明（草稿）', path: 'demo:r11-tech-note' },
      { name: '缓存失效策略（合成来源 A）', path: 'demo:r11-source-a' },
    ])
  })
})
