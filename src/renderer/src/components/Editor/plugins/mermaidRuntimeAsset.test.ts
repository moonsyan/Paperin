import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { mermaidSandboxDocument } from './mermaidCodeBlock'

describe('Mermaid 静态运行时', () => {
  it('随渲染进程发布原始浏览器运行时，避免被模块打包转换', () => {
    const runtimePath = join(process.cwd(), 'src', 'renderer', 'public', 'mermaid.min.js')

    expect(existsSync(runtimePath)).toBe(true)
    expect(readFileSync(runtimePath, 'utf8')).toContain('mermaid')
  })

  it('在独立文档中加载运行时，避免编辑器页面的全局样式参与布局测量', () => {
    const documentHtml = mermaidSandboxDocument('file:///app/mermaid.min.js')

    expect(documentHtml).toContain('<script src="file:///app/mermaid.min.js"></script>')
    expect(documentHtml).toContain('<body></body>')
  })
})
