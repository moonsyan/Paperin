import { describe, expect, it } from 'vitest'
import { buildAssociationProbeScript, buildTabCountProbeScript } from './smoke-probes'
import { CORE_TASK_STEPS, formatCoreTaskFail } from '../../shared/testing/core-task-contract'
import { buildCompactMenuPathScript } from './core-task-smoke-ui'

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

describe('核心任务失败输出', () => {
  it('按步骤输出 CORE_TASK_FAIL <step> <reason>，不只检查最终 toast', () => {
    expect(CORE_TASK_STEPS).toEqual(['find-source', 'insert-citation', 'save-reopen', 'export-bundle'])
    expect(formatCoreTaskFail('find-source', 'NO_MATCH')).toBe('CORE_TASK_FAIL find-source NO_MATCH')
    expect(formatCoreTaskFail('insert-citation', 'INSERT_BUTTON_MISSING')).toBe(
      'CORE_TASK_FAIL insert-citation INSERT_BUTTON_MISSING',
    )
    expect(formatCoreTaskFail('save-reopen', 'SAVE_MISSING_CITATION')).toMatch(/^CORE_TASK_FAIL save-reopen /)
    expect(formatCoreTaskFail('export-bundle', 'EXPORT_DIR_DENIED')).toMatch(/^CORE_TASK_FAIL export-bundle /)
  })
})

describe('核心任务更多菜单路径脚本', () => {
  it('在同一次脚本里点击打开文件夹并等待工作区壳层变为 open', () => {
    const script = buildCompactMenuPathScript(
      ['更多菜单', '文档与知识库', '打开文件夹'],
      'document.querySelector(\'[role="region"][aria-label="工作区"]\')?.getAttribute("data-workspace-state") === "open"',
    )
    expect(script).toContain('更多菜单')
    expect(script).toContain('打开文件夹')
    expect(script).toContain('data-workspace-state')
    expect(script).toContain('button.disabled')
  })

  it('工作区搜索走全工作区搜索菜单项，失败带 toast 诊断', () => {
    const script = buildCompactMenuPathScript(
      ['更多菜单', '文档与知识库', '全工作区搜索…'],
      'Boolean(document.querySelector(\'[aria-label="工作区搜索关键词"]\'))',
    )
    expect(script).toContain('全工作区搜索…')
    expect(script).toContain('工作区搜索关键词')
    expect(script).toContain('.toast')
  })
})
