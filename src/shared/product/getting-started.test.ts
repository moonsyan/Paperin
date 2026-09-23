import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CORE_TASK_HEADLINE } from './core-task'
import { buildGettingStartedMarkdown } from './getting-started'

const MODULES = [
  '打开资料',
  '写成文档',
  '找来源并引用',
  '保存与继续维护',
  '检查质量',
  '交付',
  '界面',
  '数据放在哪里',
]

describe('首次打开入门说明', () => {
  const markdown = buildGettingStartedMarkdown()

  it('保留核心任务，并按模块覆盖当前能力', () => {
    expect(markdown.startsWith('# 欢迎使用 Paperin')).toBe(true)
    expect(markdown).toContain(CORE_TASK_HEADLINE)
    expect(markdown).toContain('插入引用')
    expect(markdown).toContain('**不会**写入你稍后打开的知识库文件夹')
    for (const title of MODULES) {
      expect(markdown).toContain(`## ${title}`)
    }
    expect(markdown).toContain('reports/paperin-delivery-report.json')
    expect(markdown).toContain('来源已变化')
    expect(markdown).not.toContain('实时多人协作已经')
  })

  it('小任务区分演示熟悉与开库后的完整闭环，且不承诺无库即可搜索引用', () => {
    expect(markdown).toContain('先熟悉界面')
    expect(markdown).toContain('完整闭环')
    expect(markdown).toContain('打开知识库文件夹')
    expect(markdown).toContain('另存为')
    expect(markdown).toContain('用不了全文搜索')
    expect(markdown).not.toContain('硬编码关闭拼写检查')
    expect(markdown).toContain('打开后正文编辑面会启用拼写检查')
  })

  it('仓库入门文档与首次打开看到的正文一致', () => {
    const documented = readFileSync(join(process.cwd(), 'docs/getting-started.md'), 'utf8').replace(/\r\n/g, '\n')
    expect(documented.trimEnd()).toBe(markdown.trimEnd())
  })
})
