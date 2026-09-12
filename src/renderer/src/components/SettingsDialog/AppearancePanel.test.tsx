// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { AppearancePanel } from './AppearancePanel'
import { THEMES } from './constants'

afterEach(() => cleanup())

const baseProps = {
  theme: THEMES[0].id,
  onThemeChange: vi.fn(),
  workspaceAvailable: false,
  workspaceThemeEnabled: false,
  onWorkspaceThemeEnabledChange: vi.fn(),
  fontSize: 17,
  onFontSizeChange: vi.fn(),
  contentWidth: 760,
  onContentWidthChange: vi.fn(),
  lineHeight: 1.75,
  onLineHeightChange: vi.fn(),
  contentFont: 'default' as const,
  onContentFontChange: vi.fn(),
  zoom: 1,
  onZoomChange: vi.fn(),
  onImportCss: vi.fn(),
  onRemoveCss: vi.fn(),
}

describe('AppearancePanel 主题样张（T13 / NEXT-UI-SPEC §7）', () => {
  it('每张主题卡都带真实主题作用域的样张（data-theme 与主题一致）', () => {
    render(<AppearancePanel {...baseProps} />)
    const samples = document.querySelectorAll('.theme-card-sample')
    expect(samples.length).toBe(THEMES.length)
    for (const t of THEMES) {
      const sample = document.querySelector(`.theme-card-sample[data-theme="${t.id}"]`)
      expect(sample).toBeTruthy()
    }
  })

  it('样张覆盖标题/链接/代码/选中/错误状态且对读屏隐藏', () => {
    render(<AppearancePanel {...baseProps} />)
    expect(document.querySelector('.tcs-title')?.textContent).toBe('标题样式')
    expect(document.querySelector('.tcs-link')).toBeTruthy()
    expect(document.querySelector('.tcs-code')).toBeTruthy()
    expect(document.querySelector('.tcs-selected')).toBeTruthy()
    expect(document.querySelector('.tcs-error')).toBeTruthy()
    // 装饰性预览：对辅助技术隐藏
    expect(document.querySelector('.theme-card-sample')?.getAttribute('aria-hidden')).toBe('true')
  })
})
