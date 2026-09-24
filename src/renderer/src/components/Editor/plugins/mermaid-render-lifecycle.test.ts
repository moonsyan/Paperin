import { describe, expect, it } from 'vitest'
import {
  decideMermaidRender,
  mermaidThemeFromDocument,
  shouldCommitMermaidRender,
  shouldRerenderMermaidForTheme,
} from './mermaid-render-lifecycle'

describe('mermaid-render-lifecycle', () => {
  it('销毁旧文档的异步渲染结果不会提交到新文档', () => {
    expect(shouldCommitMermaidRender(true, 3, 3)).toBe(true)
    expect(shouldCommitMermaidRender(false, 3, 3)).toBe(false)
    expect(shouldCommitMermaidRender(true, 2, 3)).toBe(false)
  })

  it('同源仍在飞行中时复用进行中的渲染，避免代次抖动永远无法提交', () => {
    expect(
      decideMermaidRender({
        prepared: 'graph TD\nA-->B',
        force: false,
        inFlightPrepared: 'graph TD\nA-->B',
        hasInFlightPromise: true,
        committedPrepared: null,
        hasSvg: false,
      }),
    ).toEqual({ action: 'reuse-inflight' })
  })

  it('同源已有 SVG 且非强制时跳过重渲', () => {
    expect(
      decideMermaidRender({
        prepared: 'graph TD\nA-->B',
        force: false,
        inFlightPrepared: null,
        hasInFlightPromise: false,
        committedPrepared: 'graph TD\nA-->B',
        hasSvg: true,
      }),
    ).toEqual({ action: 'reuse-committed' })
  })

  it('强制重渲或源码变化时才会重新 start', () => {
    expect(
      decideMermaidRender({
        prepared: 'graph TD\nA-->B',
        force: true,
        inFlightPrepared: 'graph TD\nA-->B',
        hasInFlightPromise: true,
        committedPrepared: 'graph TD\nA-->B',
        hasSvg: true,
      }),
    ).toEqual({ action: 'start' })
    expect(
      decideMermaidRender({
        prepared: 'graph TD\nA-->C',
        force: false,
        inFlightPrepared: 'graph TD\nA-->B',
        hasInFlightPromise: true,
        committedPrepared: 'graph TD\nA-->B',
        hasSvg: true,
      }),
    ).toEqual({ action: 'start' })
  })

  it('主题未变不触发重渲；深色主题 id 映射到 mermaid dark', () => {
    expect(shouldRerenderMermaidForTheme(null, 'pine')).toBe(false)
    expect(shouldRerenderMermaidForTheme('pine', 'pine')).toBe(false)
    expect(shouldRerenderMermaidForTheme('pine', 'github')).toBe(true)
    expect(mermaidThemeFromDocument('pine')).toBe('dark')
    expect(mermaidThemeFromDocument('github')).toBe('dark')
    expect(mermaidThemeFromDocument('default')).toBe('default')
    expect(mermaidThemeFromDocument('ocean')).toBe('default')
  })
})
