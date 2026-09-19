import { describe, expect, it } from 'vitest'
import { collectExportTargets, inspectExportMarkdown, resolveExportTarget } from './export-preflight'

describe('inspectExportMarkdown', () => {
  it('空图片和不安全链接会阻止导出，且不改写正文', () => {
    const source = '正文\n![]()\n[点我](javascript:alert(1))\n- [ ] 还没做'
    const report = inspectExportMarkdown(source)
    expect(report.block).toContain('缺少路径')
    expect(source).toContain('- [ ] 还没做')
    expect(report.reminder).toContain('未完成任务')
  })

  it('缺少的本地图片和断链需要确认，未完成任务只提醒', () => {
    const report = inspectExportMarkdown('# 标题\n![图](a.png)\n[笔记](missing.md)\n- [ ] 待办', ['a.png', 'missing.md'])
    expect(report.block).toBeNull()
    expect(report.confirm).toEqual(['缺少本地目标：a.png', '缺少本地目标：missing.md'])
    expect(report.reminder).toContain('1 个未完成任务')
  })

  it('外链和已完成任务不产生阻止项', () => {
    const report = inspectExportMarkdown('![网图](https://example.com/a.png)\n- [x] 完成')
    expect(report.block).toBeNull()
    expect(report.confirm).toEqual([])
    expect(report.reminder).toBeNull()
    expect(collectExportTargets('![网图](https://example.com/a.png)\n[外链](https://example.com)')).toEqual([])
  })

  it('相对图片解析到文档目录，并折叠上级目录', () => {
    expect(resolveExportTarget('D:/notes', 'img/a.png')).toBe('D:/notes/img/a.png')
    expect(resolveExportTarget('D:/notes/chapters', '../img/a.png')).toBe('D:/notes/img/a.png')
    expect(resolveExportTarget('D:/notes', 'https://example.com/a.png')).toBeNull()
  })
})
