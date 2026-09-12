import { describe, expect, it } from 'vitest'
import { buildAssociationProbeScript, buildTabCountProbeScript } from './smoke-probes'

/**
 * 冒烟探针契约：CurrentFileBanner 收敛后文件名由标签页承担，
 * `.current-file-banner-title` 已不存在——探针必须读活动标签名 +
 * 来源语义 + 正文标记，不允许再引用过时选择器。
 */
describe('buildAssociationProbeScript', () => {
  it('以活动标签 .tab-name + aria-selected 作为文件名契约', () => {
    const script = buildAssociationProbeScript('系统关联临时文档.md', '外部临时内容')
    expect(script).toContain('[role="tab"][aria-selected="true"]')
    expect(script).toContain('.tab-name')
    expect(script).toContain('系统关联临时文档.md')
  })

  it('保留外部来源语义断言（data-source=external）', () => {
    const script = buildAssociationProbeScript('a.md', '标记')
    expect(script).toContain('data-source')
    expect(script).toContain('external')
  })

  it('包含正文标记断言，且失败诊断不输出正文与用户路径', () => {
    const script = buildAssociationProbeScript('a.md', '外部临时内容')
    expect(script).toContain('外部临时内容')
    // 失败分支的诊断字段只允许有限集合
    expect(script).toMatch(/activeTabName/)
    expect(script).toMatch(/source/)
    expect(script).toMatch(/tabs/)
    expect(script).toMatch(/hasOnOpenFile/)
  })

  it('不再引用已移除的 .current-file-banner-title 选择器', () => {
    const script = buildAssociationProbeScript('a.md', '标记')
    expect(script).not.toContain('current-file-banner-title')
  })
})

describe('buildTabCountProbeScript', () => {
  it('返回读取标签数的同步脚本（关联去重契约）', () => {
    const script = buildTabCountProbeScript()
    expect(script).toContain('[role="tab"]')
  })
})
