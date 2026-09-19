/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Schema } from '@milkdown/kit/prose/model'
import { EditorState, type Transaction } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import {
  applyViewState,
  captureViewState,
  findScrollParent,
  focusDocEnd,
  focusEditorRoot,
  focusPosition,
  restoreScrollTop,
} from './editor-view-state'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    text: { group: 'inline' },
    paragraph: { content: 'inline*', group: 'block' },
  },
})

const buildDoc = () =>
  schema.nodes.doc.create(null, [
    schema.nodes.paragraph.create(null, schema.text('第一段')),
    schema.nodes.paragraph.create(null, schema.text('第二段')),
  ])

/** 测试替身：只实现被测函数用到的 view 表面（state/dispatch/dom/focus）。 */
const createViewStub = () => {
  let state = EditorState.create({ schema, doc: buildDoc() })
  const dispatched: Transaction[] = []
  const focus = vi.fn()
  const view = {
    get state() {
      return state
    },
    dispatch: (tr: Transaction) => {
      dispatched.push(tr)
      state = state.apply(tr)
    },
    dom: document.createElement('div'),
    isDestroyed: false,
    focus,
  } as unknown as EditorView
  return { view, dispatched, focus, readState: () => state }
}

const createContainer = (scrollTop: number): HTMLElement => {
  const container = document.createElement('div')
  const scroll = document.createElement('div')
  scroll.className = 'editor-scroll'
  Object.defineProperty(scroll, 'scrollTop', { value: scrollTop, writable: true })
  const editable = document.createElement('div')
  editable.className = 'milkdown'
  editable.innerHTML = '<div class="editor" tabindex="-1"></div>'
  container.append(scroll, editable)
  document.body.append(container)
  return container
}

beforeEach(() => {
  // 滚动恢复在实现里延到下一帧；测试中同步执行以便断言
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 0
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('captureViewState', () => {
  it('读取当前选区与滚动容器位置', () => {
    const { view } = createViewStub()
    const container = createContainer(240)

    expect(captureViewState(view, container)).toEqual({
      selection: { anchor: 1, head: 1 },
      scrollTop: 240,
    })
  })

  it('无滚动容器时 scrollTop 归零', () => {
    const { view } = createViewStub()

    expect(captureViewState(view, document.createElement('div')).scrollTop).toBe(0)
  })
})

describe('applyViewState', () => {
  it('恢复选区并回滚滚动位置', () => {
    const { view, readState } = createViewStub()
    const container = createContainer(0)
    const scroll = findScrollParent(container)

    applyViewState(view, container, { selection: { anchor: 1, head: 3 }, scrollTop: 180 })

    expect(readState().selection.anchor).toBe(1)
    expect(readState().selection.head).toBe(3)
    expect(scroll?.scrollTop).toBe(180)
    expect(view.focus).toHaveBeenCalled()
  })

  it('越界位置钳到文档范围内且不抛错', () => {
    const { view, readState } = createViewStub()
    const container = createContainer(0)
    const maxPosition = view.state.doc.content.size

    expect(() =>
      applyViewState(view, container, {
        selection: { anchor: -5, head: maxPosition + 999 },
        scrollTop: 0,
      }),
    ).not.toThrow()
    expect(readState().selection.anchor).toBeGreaterThanOrEqual(0)
    expect(readState().selection.head).toBeLessThanOrEqual(maxPosition)
  })

  it('负滚动值归零', () => {
    const container = createContainer(120)

    restoreScrollTop(container, -30)

    expect(findScrollParent(container)?.scrollTop).toBe(0)
  })
})

describe('聚焦', () => {
  it('focusEditorRoot 聚焦可编辑区', () => {
    const container = createContainer(0)
    const editable = container.querySelector<HTMLElement>('.milkdown .editor')

    focusEditorRoot(container)

    expect(document.activeElement).toBe(editable)
  })

  it('focusDocEnd 把光标移到文档末尾并聚焦视图', () => {
    const { view, focus, readState } = createViewStub()

    focusDocEnd(view)

    // atEnd 落在末段正文结尾：第二段内容区间 6..9
    expect(readState().selection.from).toBe(9)
    expect(focus).toHaveBeenCalledTimes(1)
  })

  it('focusPosition 定位到指定位置', () => {
    const { view, focus, readState } = createViewStub()

    focusPosition(view, 2)

    expect(readState().selection.from).toBe(2)
    expect(focus).toHaveBeenCalledTimes(1)
  })

  it('focusPosition 对不可解析位置保持原状且不抛错', () => {
    const { view, focus, dispatched, readState } = createViewStub()
    const before = readState().selection.from

    expect(() => focusPosition(view, 99999)).not.toThrow()
    expect(dispatched).toHaveLength(0)
    expect(readState().selection.from).toBe(before)
    expect(focus).not.toHaveBeenCalled()
  })
})
