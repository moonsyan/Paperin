/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorView } from '@milkdown/kit/prose/view'
import { setFullRangeOverride } from './editorViewport'
import {
  buildPreviewHtml,
  enterExportViewport,
  ensureRichContentRendered,
  restoreExportViewport,
} from './editor-export-snapshot'

const mocks = vi.hoisted(() => ({ ensureMermaidRendered: vi.fn<() => Promise<void>>() }))

vi.mock('../plugins/mermaidCodeBlock', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../plugins/mermaidCodeBlock')>()
  return { ...actual, ensureMermaidRendered: mocks.ensureMermaidRendered }
})

/**
 * 编辑器 DOM 样本，结构对齐 mermaid 插件的真实产物：
 * `.mermaid-block` 与紧随其后的源码 `pre[data-language=mermaid]` 是兄弟节点。
 */
const editorDom = (): HTMLElement => {
  const dom = document.createElement('div')
  dom.innerHTML = `
    <p class="block-active">正文<span class="search-hit current">命中</span></p>
    <p class="folded-hidden">被折叠隐藏的段落</p>
    <span class="bracket-match">[</span>
    <div class="code-line-numbers">1</div>
    <button class="fold-toggle">折叠</button>
    <div class="structured-code-tools">格式化</div>
    <button class="code-fold-toggle">▾</button>
    <span class="code-fold-hidden">被折叠的代码</span>
    <div class="mermaid-block is-editing-source">
      <div class="mermaid-preview"><svg viewBox="0 0 10 10"></svg></div>
      <div class="mermaid-toolbar">工具栏</div>
    </div>
    <pre data-language="mermaid">graph TD;A--&gt;B;</pre>
    <div class="mermaid-block is-editing-source"></div>
    <pre data-language="mermaid">graph TD;C--&gt;D;</pre>
    <p>说明</p>
    <pre data-language="mermaid">graph TD;E--&gt;F;</pre>
    <pre data-language="ts">const a = 1</pre>
  `
  return dom
}

/** 测试替身：被测函数只用到 view.dom / view.isDestroyed / view.state.tr / view.dispatch。 */
const createViewStub = (dom: HTMLElement) => {
  const dispatched: unknown[] = []
  const view = {
    dom,
    isDestroyed: false,
    state: { tr: { setMeta: (key: unknown, value: unknown) => ({ key, value }) } },
    dispatch: (tr: unknown) => dispatched.push(tr),
  } as unknown as EditorView
  return { view, dispatched }
}

beforeEach(() => {
  mocks.ensureMermaidRendered.mockReset()
  // 导出等待逻辑挂在 rAF 上；测试中同步执行以便断言
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 0
  })
})

afterEach(() => {
  setFullRangeOverride(false)
  vi.unstubAllGlobals()
})

describe('导出视口开关', () => {
  it('进入导出态后只允许释放一次', () => {
    const { view, dispatched } = createViewStub(editorDom())

    enterExportViewport(view)

    expect(dispatched).toHaveLength(1)
    expect(restoreExportViewport(view)).toBe(true)
    expect(restoreExportViewport(view)).toBe(false)
  })

  it('未进入导出态时释放是空操作', () => {
    const { view, dispatched } = createViewStub(editorDom())

    expect(restoreExportViewport(view)).toBe(false)
    expect(dispatched).toHaveLength(0)
  })

  it('没有可用 view 时消费掉导出态但不下发事务', () => {
    enterExportViewport(null)

    expect(restoreExportViewport(null)).toBe(false)
  })
})

describe('ensureRichContentRendered', () => {
  it('渲染成功后保持导出态，交由调用方释放', async () => {
    const { view, dispatched } = createViewStub(editorDom())
    mocks.ensureMermaidRendered.mockResolvedValue(undefined)

    await expect(ensureRichContentRendered(view)).resolves.toBeUndefined()

    expect(dispatched).toHaveLength(1)
    expect(restoreExportViewport(view)).toBe(true)
  })

  it('渲染失败时回滚导出态再抛出，避免视口卡在全量', async () => {
    const { view } = createViewStub(editorDom())
    mocks.ensureMermaidRendered.mockRejectedValue(new Error('Mermaid 渲染超时'))

    await expect(ensureRichContentRendered(view)).rejects.toThrow('Mermaid 渲染超时')
    expect(restoreExportViewport(view)).toBe(false)
  })
})

describe('buildPreviewHtml', () => {
  it('剥离编辑器装饰与交互挂件，保留正文', () => {
    const { view } = createViewStub(editorDom())
    const release = vi.fn()

    const html = buildPreviewHtml(view, release)

    expect(html).toContain('正文')
    expect(html).toContain('命中')
    expect(html).toContain('被折叠隐藏的段落')
    expect(html).not.toContain('search-hit')
    expect(html).not.toContain('block-active')
    expect(html).not.toContain('bracket-match')
    expect(html).not.toContain('folded-hidden')
    expect(html).not.toContain('code-line-numbers')
    expect(html).not.toContain('fold-toggle')
    expect(html).not.toContain('structured-code-tools')
    expect(html).not.toContain('code-fold-toggle')
    expect(html).not.toContain('code-fold-hidden')
    expect(html).toContain('被折叠的代码')
    expect(html).not.toContain('mermaid-toolbar')
    expect(release).toHaveBeenCalledWith(view)
  })

  it('已渲染出图的 Mermaid 源码被移除，仍在编辑源码的保留', () => {
    const { view } = createViewStub(editorDom())

    const html = buildPreviewHtml(view, vi.fn())

    expect(html).not.toContain('A--&gt;B')
    expect(html).toContain('C--&gt;D')
    expect(html).toContain('E--&gt;F')
    expect(html).toContain('const a = 1')
  })

  it('先克隆再释放，实时编辑器 DOM 不受影响', () => {
    const dom = editorDom()
    const { view } = createViewStub(dom)

    buildPreviewHtml(view, vi.fn())

    expect(dom.querySelector('.search-hit')).not.toBeNull()
    expect(dom.querySelector('.fold-toggle')).not.toBeNull()
    expect(dom.querySelectorAll('pre[data-language="mermaid"]')).toHaveLength(3)
  })
})
