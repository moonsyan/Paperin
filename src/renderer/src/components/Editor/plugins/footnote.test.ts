// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { fireEvent } from '@testing-library/react'
import {
  Editor as MilkdownCore,
  defaultValueCtx,
  editorViewCtx,
  rootCtx,
  remarkPluginsCtx,
} from '@milkdown/kit/core'
import { TextSelection } from '@milkdown/kit/prose/state'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { getMarkdown } from '@milkdown/kit/utils'
import type { EditorView } from '@milkdown/kit/prose/view'
import type { Editor } from '@milkdown/kit/core'
import {
  footnoteDefInputRule,
  footnoteRefInputRule,
  footnoteRefClickPlugin,
  footnoteOrphanAsRefPlugin,
} from './footnote'
import { ensureFootnoteDefinitions } from '../../../lib/footnote-normalize'
import { frontmatterKeymap, frontmatterRemarkPlugin, frontmatterSchema } from './frontmatter'

/** 与 useMilkdownInstance 相同的脚注相关插件栈（gfm 内置节点 + 输入规则） */
const buildDoc = async (
  md: string,
): Promise<{
  view: EditorView
  out: string
  root: HTMLElement
  editor: Editor
}> => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const editor = MilkdownCore.make()
    .config((ctx) => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, md)
    })
    .use(commonmark)
    .use(gfm)
    .use([footnoteDefInputRule, footnoteRefInputRule])
    .use(footnoteRefClickPlugin)
  await editor.create()
  const view = editor.action((ctx) => ctx.get(editorViewCtx))
  const out = editor.action(getMarkdown())
  return { view, out, root, editor }
}

/** 模拟真实键入（经 handleTextInput 触发输入规则） */
const typeText = (view: EditorView, text: string) => {
  for (const character of text) {
    const { from, to } = view.state.selection
    const handled = view.someProp('handleTextInput', (handler) =>
      handler(view, from, to, character, () =>
        view.state.tr.insertText(character, from, to),
      ),
    )
    if (handled) continue
    view.dispatch(view.state.tr.insertText(character, from, to))
  }
}

const nodeNames = (view: EditorView): string[] => {
  const names: string[] = []
  view.state.doc.descendants((node) => {
    names.push(node.type.name)
  })
  return names
}

describe('脚注：加载解析', () => {
  it('数字标签引用与定义解析为 gfm 内置节点', async () => {
    const { view, out } = await buildDoc(
      ['文字[^1]，补充说明。', '', '[^1]: 第一个脚注内容。'].join('\n'),
    )
    const names = nodeNames(view)
    expect(names).toContain('footnote_reference')
    expect(names).toContain('footnote_definition')
    expect(out).toBe('文字[^1]，补充说明。\n\n[^1]: 第一个脚注内容。\n')
  })

  it('DOM 中渲染为 sup 上标与 dl 定义块', async () => {
    const { root } = await buildDoc(
      ['文字[^dwqdq]，补充。', '', '[^dwqdq]: 脚注定义内容。'].join('\n'),
    )
    const sup = root.querySelector('sup[data-type="footnote_reference"]')
    expect(sup).toBeTruthy()
    expect(sup?.getAttribute('data-label')).toBe('dwqdq')
    const dl = root.querySelector('dl[data-type="footnote_definition"]')
    expect(dl).toBeTruthy()
    expect(dl?.getAttribute('data-label')).toBe('dwqdq')
  })

  it('中文标签往返一致', async () => {
    const { view, out } = await buildDoc(
      ['中文标签[^注释]，测试。', '', '[^注释]: 中文标签内容。'].join('\n'),
    )
    const names = nodeNames(view)
    expect(names).toContain('footnote_reference')
    expect(names).toContain('footnote_definition')
    expect(out).toBe('中文标签[^注释]，测试。\n\n[^注释]: 中文标签内容。\n')
  })

  it('孤立引用经占位定义补全后渲染为上标（Typora 风格）', async () => {
    // 加载期对 md 做占位定义补全（与 useMilkdownInstance 的 defaultValueCtx 一致）
    const { view, root, out } = await buildDoc(
      ensureFootnoteDefinitions('未定义引用[^missing]。'),
    )
    expect(nodeNames(view)).toContain('footnote_reference')
    const sup = root.querySelector('sup[data-type="footnote_reference"]')
    expect(sup).toBeTruthy()
    expect(sup?.getAttribute('data-label')).toBe('missing')
    // 占位定义已追加到文末
    expect(out).toContain('[^missing]:')
  })

  it('只有定义没有引用：定义保留', async () => {
    const { out: out2 } = await buildDoc(
      ['正文段落。', '', '[^1]: 孤立定义内容。'].join('\n'),
    )
    expect(out2).toContain('[^1]: 孤立定义内容。')
  })

  it('定义行紧跟段落（无空行）：micromark 允许打断段落', async () => {
    const { view } = await buildDoc('前缀段落\n[^1]: 紧跟定义。')
    expect(nodeNames(view)).toContain('footnote_definition')
  })

  it('定义块内容包含行内 [^标签] 说明文本时仍能解析', async () => {
    const md = [
      'Paperin 支持脚注语法[^dwqdq]，适合学术写作。',
      '',
      '[^dwqdq]: 行内输入 [^标签] 插入引用；行首输入 [^标签]: 内容 定义脚注。',
    ].join('\n')
    const { view, out, root } = await buildDoc(md)
    expect(nodeNames(view)).toContain('footnote_reference')
    expect(nodeNames(view)).toContain('footnote_definition')
    expect(root.querySelector('sup[data-type="footnote_reference"]')?.getAttribute('data-label')).toBe('dwqdq')
    expect(out).toContain('[^dwqdq]')
  })
})

describe('脚注：输入规则', () => {
  it('键入 [^1] 后跟空格 → 转为引用并自动补占位定义', async () => {
    const { view, editor } = await buildDoc('看这里')
    typeText(view, ' [^1] ')
    const names = nodeNames(view)
    expect(names).toContain('footnote_reference')
    expect(names).toContain('footnote_definition')
    expect(view.state.doc.textContent).toContain('看这里')
    // 自动补的占位定义随文档序列化，不影响引用本身
    const out = editor.action(getMarkdown())
    expect(out).toContain('[^1]')
    expect(out).toContain('[^1]:')
  })

  it('同一标签只补一次定义（不重复追加）', async () => {
    const { view } = await buildDoc('a')
    typeText(view, ' [^x] ')
    typeText(view, ' [^x] ')
    let xDefs = 0
    view.state.doc.descendants((node) => {
      if (node.type.name === 'footnote_definition' && node.attrs.label === 'x') xDefs++
    })
    expect(xDefs).toBe(1)
  })

  it('键入 [^1] 后跟中文标点 → 转为引用', async () => {
    // 行首键入时 ref 规则让位定义语法，由 orphan 兜底在下一键（非 `:`）后转换，
    // 因此这里必须用与真实应用一致的全量插件栈
    const { view } = await buildWithFullStack('说明')
    typeText(view, '[^注]。')
    expect(nodeNames(view)).toContain('footnote_reference')
  })

  it('键入 [^1]: → 立即转为定义块，后续输入进入定义', async () => {
    const { view } = await buildDoc('')
    typeText(view, '[^1]:')
    expect(nodeNames(view)).toContain('footnote_definition')
    typeText(view, '定义内容')
    expect(view.state.doc.textContent).toContain('定义内容')
  })

  it('切换文档（replaceContent 路径）时孤立引用同样补占位定义', async () => {
    // 模拟 useEditorContentReplacement.applyReplaceContent 的真实行为：
    // 拿到现有编辑器后对 markdown 做 ensureFootnoteDefinitions 再走 parserCtx
    const { editor, root, view } = await buildDoc('初始内容')
    const { ensureFootnoteDefinitions } = await import('../../../lib/footnote-normalize')
    const { parserCtx, schemaCtx, prosePluginsCtx } = await import('@milkdown/kit/core')
    const { EditorState } = await import('@milkdown/kit/prose/state')
    const newDoc = editor.ctx.get(parserCtx)(
      ensureFootnoteDefinitions('哈哈哈哈[^aaa]'),
    )
    const schema = editor.ctx.get(schemaCtx)
    const plugins = editor.ctx.get(prosePluginsCtx)
    view.updateState(EditorState.create({ schema, doc: newDoc, plugins }))
    // 经 ensureFootnoteDefinitions 后孤立的 [^aaa] 应解析为 footnote_reference
    const names = nodeNames(view)
    expect(names).toContain('footnote_reference')
    const sup = root.querySelector('sup[data-type="footnote_reference"]')
    expect(sup?.getAttribute('data-label')).toBe('aaa')
  })

  it('已有段落的行首输入 [^1]: 同样转定义（与加载解析一致），前缀文本保留为段落', async () => {
    const { view } = await buildDoc('前缀')
    // 光标移动到段首再输入
    moveCursorToDocStart(view)
    typeText(view, '[^1]:')
    expect(nodeNames(view)).toContain('footnote_definition')
    expect(view.state.doc.textContent).toContain('前缀')
  })

  it('空标签 [^] 不转换', async () => {
    const { view } = await buildDoc('文字')
    typeText(view, ' [^] ')
    expect(nodeNames(view)).not.toContain('footnote_reference')
  })
})

/** 与 useMilkdownInstance 完全一致的全量插件栈（输入规则 + orphan 兜底） */
const buildWithFullStack = async (
  md: string,
): Promise<{ view: EditorView; root: HTMLElement }> => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const editor = MilkdownCore.make()
    .config((ctx) => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, md)
    })
    .use(commonmark)
    .use(gfm)
    .use([footnoteDefInputRule, footnoteRefInputRule])
    .use(footnoteRefClickPlugin)
    .use(footnoteOrphanAsRefPlugin)
  await editor.create()
  const view = editor.action((ctx) => ctx.get(editorViewCtx))
  return { view, root }
}

const moveCursorToEnd = (view: EditorView) => {
  view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)))
}

const moveCursorToDocStart = (view: EditorView) => {
  view.dispatch(view.state.tr.setSelection(TextSelection.atStart(view.state.doc)))
}

describe('脚注：全量插件栈（输入规则 + orphan 兜底，对标真实应用）', () => {
  it('多字符 label 实时键入：引用标签不被截断为单字符', async () => {
    const { view } = await buildWithFullStack('看这里')
    moveCursorToEnd(view)
    typeText(view, '[^aaa]')
    const labels: string[] = []
    view.state.doc.descendants((n) => {
      if (n.type.name === 'footnote_reference') labels.push(n.attrs.label)
    })
    expect(labels).toContain('aaa')
  })

  it('引用后跟空格：无游离 ]、ref 节点在 DOM 中是 sup', async () => {
    const { view, root } = await buildWithFullStack('看这里')
    moveCursorToEnd(view)
    typeText(view, ' [^aaa] ')
    // ref 是原子节点，doc.textContent 不计入 label；转换后不得残留游离 `]`
    //（游离 `]` 会让序列化变成 `[^aaa]]`，gfm 重解析时不再视为脚注）
    expect(view.state.doc.textContent).toBe('看这里' + '  ')
    expect(view.state.doc.textContent).not.toContain(']')
    expect(root.querySelector('sup[data-label="aaa"]')).toBeTruthy()
  })

  it('引用后直接接中文：ref 后紧跟中文、label 完整保留', async () => {
    const { view, root } = await buildWithFullStack('看这里')
    moveCursorToEnd(view)
    typeText(view, '[^aaa]后续')
    expect(view.state.doc.textContent).toBe('看这里' + '后续')
    expect(view.state.doc.textContent).not.toContain(']')
    expect(root.querySelector('sup[data-label="aaa"]')).toBeTruthy()
  })

  it('行首键入 [^label]: → def rule 完整接管，不留游离冒号', async () => {
    const { view, root } = await buildWithFullStack('')
    moveCursorToDocStart(view)
    typeText(view, '[^multi]:')
    const defLabels: string[] = []
    view.state.doc.descendants((n) => {
      if (n.type.name === 'footnote_definition') defLabels.push(n.attrs.label)
    })
    expect(defLabels).toContain('multi')
    // 定义块不含游离 `:`；doc 主体段落 textContent 不应残留 `[^multi]:`
    expect(view.state.doc.textContent).not.toContain(':')
    expect(root.querySelector('dl[data-label="multi"]')).toBeTruthy()
  })

  it('行首键入 [^label] 空格（引用而非定义）：标签仍为多字符', async () => {
    const { view } = await buildWithFullStack('')
    moveCursorToDocStart(view)
    typeText(view, '[^note1] 正文')
    const labels: string[] = []
    view.state.doc.descendants((n) => {
      if (n.type.name === 'footnote_reference') labels.push(n.attrs.label)
    })
    expect(labels).toContain('note1')
  })

  it('回归：段中键入 哈哈哈哈[^hhhh] → label 为 hhhh 且无游离 ]（可序列化往返）', async () => {
    const { view, editor, root } = await buildWithFullStackAndMarkdown('看这里')
    moveCursorToEnd(view)
    typeText(view, '哈哈哈哈[^hhhh]')
    const labels: string[] = []
    view.state.doc.descendants((n) => {
      if (n.type.name === 'footnote_reference') labels.push(n.attrs.label)
    })
    expect(labels).toEqual(['hhhh'])
    // 游离 `]` 会让序列化变成 `[^hhhh]]`，gfm 重解析不再视为脚注
    expect(view.state.doc.textContent).not.toContain(']')
    const md = editor.action(getMarkdown())
    expect(md).toContain('哈哈哈哈[^hhhh]')
    expect(md).not.toContain(']]')
    expect(root.querySelector('sup[data-label="hhhh"]')).toBeTruthy()
  })

  it('回归：IME 组合提交（绕过 handleTextInput）→ orphan 转换且 label 完整', async () => {
    const { view } = await buildWithFullStack('看这里')
    moveCursorToEnd(view)
    // 模拟 IME：字符直接落盘，不经 handleTextInput（输入规则不触发）
    for (const character of '哈哈哈哈[^hhhh]') {
      const { from, to } = view.state.selection
      view.dispatch(view.state.tr.insertText(character, from, to))
    }
    const labels: string[] = []
    view.state.doc.descendants((n) => {
      if (n.type.name === 'footnote_reference') labels.push(n.attrs.label)
    })
    expect(labels).toEqual(['hhhh'])
    expect(view.state.doc.textContent).not.toContain(']')
  })

  it('回归：行首键入 [^label] 后接非 `:` 内容 → 延迟转换为引用且 label 完整', async () => {
    // 行首是定义候选区：`]` 键入时不转换（等 `:`），继续键入非 `:` 内容后
    // 由 orphan 在下一 dispatch 转换——旧实现会永久保留字面文本
    const { view } = await buildWithFullStack('')
    moveCursorToDocStart(view)
    typeText(view, '[^note9] 后续')
    const labels: string[] = []
    view.state.doc.descendants((n) => {
      if (n.type.name === 'footnote_reference') labels.push(n.attrs.label)
    })
    expect(labels).toEqual(['note9'])
    expect(view.state.doc.textContent).not.toContain('[^note9]')
  })

  it('回归：光标未越过 ] 时不转换（IME 自动补配 ] 场景，标签不被截断）', async () => {
    const { view } = await buildWithFullStack('')
    moveCursorToEnd(view)
    const insertWith = (text: string, cursorOffset: number) => {
      const { from, to } = view.state.selection
      view.dispatch(view.state.tr.insertText(text, from, to))
      view.dispatch(
        view.state.tr.setSelection(
          TextSelection.create(view.state.doc, view.state.selection.from - cursorOffset),
        ),
      )
    }
    // 模拟 IME 自动补配：键入 [ 时落下 [] 且光标在两者之间
    insertWith('[]', 1)
    typeText(view, '^')
    typeText(view, 'haha')
    // 光标仍在 [^ 与自动补配的 ] 之间：不得提前转换
    let labels: string[] = []
    view.state.doc.descendants((n) => {
      if (n.type.name === 'footnote_reference') labels.push(n.attrs.label)
    })
    expect(labels).toEqual([])
    expect(view.state.doc.textContent).toContain('[^haha]')
    // 键入闭合 ]（光标越过）：立即转换为完整标签的引用
    typeText(view, ']')
    labels = []
    view.state.doc.descendants((n) => {
      if (n.type.name === 'footnote_reference') labels.push(n.attrs.label)
    })
    expect(labels).toEqual(['haha'])
  })

  it('IME：composition 期间 orphan 不转换，compositionend 后再转为引用', async () => {
    const { view } = await buildWithFullStack('看这里')
    moveCursorToEnd(view)
    fireEvent.compositionStart(view.dom)
    for (const character of '[^note]') {
      const { from, to } = view.state.selection
      view.dispatch(view.state.tr.insertText(character, from, to))
    }
    let labels: string[] = []
    view.state.doc.descendants((n) => {
      if (n.type.name === 'footnote_reference') labels.push(n.attrs.label)
    })
    expect(labels).toEqual([])
    fireEvent.compositionEnd(view.dom)
    labels = []
    view.state.doc.descendants((n) => {
      if (n.type.name === 'footnote_reference') labels.push(n.attrs.label)
    })
    expect(labels).toEqual(['note'])
  })

  it('回归：正文残留旧 ] 时键入 [^h 不被立即转换（光标保护）', async () => {
    // 文件里此前的残骸（如 `]啊哈`）会让刚键入的 `[^h` 立刻满足 `[^h]` 字面
    const { view, editor } = await buildWithFullStackAndMarkdown('哈哈哈哈')
    moveCursorToEnd(view)
    // 在光标后方放置残留的 ] 与后续文字（模拟旧文件残骸）
    const { from } = view.state.selection
    view.dispatch(view.state.tr.insertText(']啊哈', from))
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, from)),
    )
    typeText(view, '[^haha]')
    const labels: string[] = []
    view.state.doc.descendants((n) => {
      if (n.type.name === 'footnote_reference') labels.push(n.attrs.label)
    })
    // 用户自己键入的 ] 触发输入规则，label 为完整 haha，而非被残留 ] 截断的 h
    expect(labels).toEqual(['haha'])
    expect(editor.action(getMarkdown())).toContain('哈哈哈哈[^haha]')
  })
})

/** 全量插件栈 + 可序列化输出（回归测试用） */
const buildWithFullStackAndMarkdown = async (
  md: string,
): Promise<{ view: EditorView; root: HTMLElement; editor: Editor }> => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const editor = MilkdownCore.make()
    .config((ctx) => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, md)
    })
    .use(commonmark)
    .use(gfm)
    .use([footnoteDefInputRule, footnoteRefInputRule])
    .use(footnoteRefClickPlugin)
    .use(footnoteOrphanAsRefPlugin)
  await editor.create()
  const view = editor.action((ctx) => ctx.get(editorViewCtx))
  return { view, root, editor }
}

describe('脚注：点击跳转', () => {
  it('点击引用上标跳转到同标签定义', async () => {
    const { view, root } = await buildDoc(
      ['引用[^1]处。', '', '[^1]: 目标定义。'].join('\n'),
    )
    // 光标先放远处，跳转后应落在定义块内
    moveCursorToDocStart(view)
    const sup = root.querySelector('sup[data-type="footnote_reference"]')
    expect(sup).toBeTruthy()
    const fakeEvent = {
      target: sup,
      ctrlKey: false,
      metaKey: false,
      preventDefault: () => {},
    } as unknown as MouseEvent
    view.someProp('handleClick', (handler) => handler(view, 1, fakeEvent))
    // 光标应位于定义块内（文档后半部分）
    const sel = view.state.selection.from
    const docLen = view.state.doc.content.size
    expect(sel).toBeGreaterThan(docLen / 2)
  })

  it('无同标签定义时不动作（光标不动）', async () => {
    const { view, root } = await buildDoc('引用[^1]处。')
    moveCursorToDocStart(view)
    const sup = root.querySelector('sup[data-type="footnote_reference"]')
    const fakeEvent = {
      target: sup,
      ctrlKey: false,
      metaKey: false,
      preventDefault: () => {},
    } as unknown as MouseEvent
    view.someProp('handleClick', (handler) => handler(view, 1, fakeEvent))
    // 无定义可跳：光标保持原位
    expect(view.state.selection.from).toBe(1)
  })
})

/** 不开输入规则，只挂 orphan 兜底插件：对所有 docChanged 都生效 */
const buildWithOrphanPlugin = async (
  md: string,
): Promise<{ view: EditorView; root: HTMLElement }> => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const editor = MilkdownCore.make()
    .config((ctx) => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, md)
    })
    .use(commonmark)
    .use(gfm)
    .use(footnoteOrphanAsRefPlugin)
  await editor.create()
  const view = editor.action((ctx) => ctx.get(editorViewCtx))
  return { view, root }
}

describe('脚注：orphanAsRef 兜底插件', () => {
  it('加载残留的 [^label] 文本节点会改为 footnote_reference + 文末补 definition', async () => {
    const { view, root } = await buildWithOrphanPlugin('哈哈哈哈[^hhhh]')
    // 节点层：应有引用节点
    let refCount = 0
    let defCount = 0
    view.state.doc.descendants((node) => {
      if (node.type.name === 'footnote_reference' && node.attrs.label === 'hhhh') refCount++
      if (node.type.name === 'footnote_definition' && node.attrs.label === 'hhhh') defCount++
    })
    expect(refCount).toBe(1)
    expect(defCount).toBe(1)
    // DOM 层：上标可见
    const sup = root.querySelector('sup[data-type="footnote_reference"][data-label="hhhh"]')
    expect(sup).toBeTruthy()
  })

  it('同一标签多次出现只补一个 definition（幂等）', async () => {
    const { view } = await buildWithOrphanPlugin('a[^x] b[^x] c[^x]')
    let defCount = 0
    view.state.doc.descendants((node) => {
      if (node.type.name === 'footnote_definition' && node.attrs.label === 'x') defCount++
    })
    expect(defCount).toBe(1)
  })

  it('已有 definition 时不重复追加', async () => {
    const md = ['引用[^aaa] 处。', '', '[^aaa]: 我已存在。'].join('\n')
    const { view } = await buildWithOrphanPlugin(md)
    let defCount = 0
    const defTexts: string[] = []
    view.state.doc.descendants((node) => {
      if (node.type.name === 'footnote_definition' && node.attrs.label === 'aaa') {
        defCount++
        defTexts.push(node.textContent)
      }
    })
    expect(defCount).toBe(1)
    expect(defTexts.join('|')).toContain('我已存在')
  })

  it('行内代码里的 [^label] 保持字面（不强制变上标）', async () => {
    const md = '代码 `let x = 1; // [^nope]` 不应改写。'
    const { view, root } = await buildWithOrphanPlugin(md)
    // 应没有 footnote_reference 节点
    let refCount = 0
    view.state.doc.descendants((node) => {
      if (node.type.name === 'footnote_reference') refCount++
    })
    expect(refCount).toBe(0)
    // DOM 中行内代码应保留字面 [^nope]
    expect(root.textContent).toContain('[^nope]')
  })

  it('代码围栏里的 [^label] 保持字面', async () => {
    const md = ['```', 'let x = 1; // [^nope]', '```'].join('\n')
    const { view } = await buildWithOrphanPlugin(md)
    let refCount = 0
    view.state.doc.descendants((node) => {
      if (node.type.name === 'footnote_reference') refCount++
    })
    expect(refCount).toBe(0)
  })

  it('appendTransaction 不会无限重写（同一 tr 触发一次后稳定）', async () => {
    const { view } = await buildWithOrphanPlugin('text[^once]')
    // 跑一次后 doc 里 footnote_reference 应有，但 placeholder def 也只增一次
    let refs = 0
    let defs = 0
    view.state.doc.descendants((node) => {
      if (node.type.name === 'footnote_reference' && node.attrs.label === 'once') refs++
      if (node.type.name === 'footnote_definition' && node.attrs.label === 'once') defs++
    })
    expect(refs).toBe(1)
    expect(defs).toBe(1)
    // 再 dispatch 一个无害事务，节点数应保持稳定（不会自我膨胀）
    moveCursorToDocStart(view)
    refs = 0
    defs = 0
    view.state.doc.descendants((node) => {
      if (node.type.name === 'footnote_reference' && node.attrs.label === 'once') refs++
      if (node.type.name === 'footnote_definition' && node.attrs.label === 'once') defs++
    })
    expect(refs).toBe(1)
    expect(defs).toBe(1)
  })
})

describe('脚注孤立引用扫描与 frontmatter 共存', () => {
  /** 真实产品栈：frontmatter（schema + remark 插件 + keymap）+ gfm + 脚注 orphan 兜底 */
  const buildWithFrontmatter = async (md: string) => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const editor = MilkdownCore.make()
      .config((ctx) => {
        ctx.set(rootCtx, root)
        ctx.set(defaultValueCtx, md)
        ctx.get(remarkPluginsCtx).push({ plugin: frontmatterRemarkPlugin, options: {} } as never)
      })
      .use(frontmatterKeymap)
      .use(commonmark)
      .use(gfm)
      .use(frontmatterSchema)
      .use([footnoteDefInputRule, footnoteRefInputRule])
      .use(footnoteRefClickPlugin)
      .use(footnoteOrphanAsRefPlugin)
    await editor.create()
    const view = editor.action((ctx) => ctx.get(editorViewCtx))
    const out = editor.action(getMarkdown())
    return { view, out }
  }

  it('frontmatter 中的 [^label] 不触发转换：YAML 完整保留、无幽灵占位定义', async () => {
    const md = ['---', 'title: 笔记', 'refs: 详见 [^1]', '---', '', '正文段落。'].join('\n')
    const { view, out } = await buildWithFrontmatter(md)
    // frontmatter 仍是第一个块且未被拆毁成幽灵围栏
    expect(view.state.doc.firstChild?.type.name).toBe('frontmatter')
    expect(view.state.doc.childCount).toBe(2)
    // YAML 内容原样保留，[^1] 未被转成引用，也未追加占位定义
    expect(out).toContain('refs: 详见 [^1]')
    expect(out).not.toContain('[^1]:')
    expect(nodeNames(view)).not.toContain('footnote_reference')
  })
})
