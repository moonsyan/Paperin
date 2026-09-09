import { schemaCtx } from '@milkdown/kit/core'
import { TextSelection } from '@milkdown/kit/prose/state'
import { InputRule } from '@milkdown/kit/prose/inputrules'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import type { EditorState, Transaction } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { $inputRule, $prose } from '@milkdown/kit/utils'

/* ==================== 脚注支持（gfm 内置节点） ==================== */

/**
 * 调试开关：dev（Vite DEV）模式下给输入规则与 orphan 兜底打 console.info，
 * 方便在 DevTools（dev 启动自动 detach 打开）观察"规则是否触发 / 为什么被
 * 跳过"，避免把日志散到 console 干扰生产用户。仅模块级常量，运行期不会变化。
 */
const DEV_FOOTNOTE_TRACE: boolean = (() => {
  try {
    // Vite 在生产构建把 import.meta.env.DEV 替换为 false，DEV/生产都不引入开销
    return Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV)
  } catch {
    return false
  }
})()

/**
 * 脚注的 Markdown 语法解析由 gfm 预设的 remarkGFM 插件原生完成
 * （micromark/mdast 的 footnote 扩展），节点采用 gfm 内置的
 * footnote_reference（行内原子上标）与 footnote_definition（block+ 定义块）。
 * 此前自建的一套同名竞争 schema 已移除——双重注册时内置 schema 抢先命中，
 * 自建输入规则/键位产出的却是另一套节点，导致"加载无样式、输入不生效"。
 * 本文件只补 gfm 预设缺失的两件事：输入规则与点击跳转。
 */

/** 文档中是否已存在某标签的脚注定义块 */
const hasFootnoteDef = (doc: EditorState['doc'], label: string): boolean => {
  let found = false
  doc.descendants((node) => {
    if (found) return false
    if (node.type.name === 'footnote_definition' && node.attrs.label === label) {
      found = true
      return false
    }
  })
  return found
}

/** 输入 [^label] → 转为脚注引用（label 是 `[^` 与 `]` 之间的非 `]` 非空白内容）。
 *
 *  regex 用 `$` 锚定到 textBefore 末尾：只在用户敲下闭合 `]` 的那一刻触发。
 *  不能去掉锚定——InputRule 对 textBefore 从前往后 exec，段落里若残留更早的
 *  字面 `[^old]`（如行首让位后未转换的），非锚定会命中它而不是刚键入的这个；
 *  且 `]` 之后再键入字符时会以错位起点二次触发，把 `[`、`]` 留成字面文本。
 *
 *  示例输入与最终 doc 一一对应：
 *    `[^h]`       → ref label `h`
 *    `[^hhhh]`    → ref label `hhhh`
 *    `[^hhhh]后`  → ref label `hhhh` + 普通文字 `后`（`后` 的键入不会再次触发）
 *    `[^hhh]:`    → **不**触发（`]` 后跟 `:` 不满足 `$` 锚定，让位给 footnoteDefInputRule）
 *    行首 `[^label]` → **不**触发（让位给定义语法；行首引用由 orphan 兜底转换）
 */
export const footnoteRefInputRule = $inputRule((ctx) => {
  const schema = ctx.get(schemaCtx)
  return new InputRule(/\[\^([^\]\s]+)\]$/, (state, match, start, end) => {
    const type = schema.nodes.footnote_reference
    if (!type) {
      if (DEV_FOOTNOTE_TRACE) console.info('[footnote-ref] skip: schema missing footnote_reference')
      return null
    }
    const label = match[1]
    if (!label) {
      if (DEV_FOOTNOTE_TRACE) console.info('[footnote-ref] skip: empty label')
      return null
    }
    // 若被替换的 `[^label` 段位于段落行首（parentOffset === 0），让位给
    // footnoteDefInputRule：用户极可能在连续键入 `[^label]: ...`；这里抢先转
    // ref 节点会让 `:` 落下变成游离字符、定义内容再也进不到脚注里。
    const $start = state.doc.resolve(start)
    if ($start.parentOffset === 0) {
      if (DEV_FOOTNOTE_TRACE)
        console.info('[footnote-ref] skip: 行首让位 def rule, label=', label)
      return null
    }
    if (DEV_FOOTNOTE_TRACE)
      console.info('[footnote-ref] trigger label=', label, 'start=', start, 'end=', end)
    // handler 返回事务后，触发字符 `]` 的默认插入被跳过，因此 [start, end)
    // 恰好覆盖 `[^label`，整段替换为原子引用节点即可，最终 doc = [..., refNode]。
    // 此前"先 insertText(']') 再替换 `[^label`"的实现会在节点后残留游离 `]`，
    // 序列化成 `[^label]]`——gfm 不会把双 `]]` 解析为脚注，保存重开后整段
    // 退化为字面文本（并带 `\[` 转义），再经 orphan 兜底反复转换产生残骸。
    let tr = state.tr.replaceRangeWith(start, end, type.create({ label }))
    // Typora 风格：孤立引用（无定义）补一个空定义块到文末
    const defType = schema.nodes.footnote_definition
    if (defType && !hasFootnoteDef(state.doc, label)) {
      const defNode = defType.createAndFill(
        { label },
        [schema.nodes.paragraph.create()],
      )
      if (defNode) tr = tr.insert(tr.doc.content.size, defNode)
    }
    return tr
  })
})

/** 行首输入 [^label]: → 转为脚注定义块（`: ` 空格与 `:内容` 连写均覆盖） */
export const footnoteDefInputRule = $inputRule((ctx) => {
  const schema = ctx.get(schemaCtx)
  return new InputRule(/^\[\^([^\]\s]+)\]:$/, (state, match, start, end) => {
    const type = schema.nodes.footnote_definition
    if (!type) return null
    const label = match[1]
    const node = type.createAndFill({ label }, [
      schema.nodes.paragraph.create(),
    ])
    if (!node) return null
    const tr = state.tr.replaceRangeWith(start, end, node)
    return tr
      .setSelection(TextSelection.create(tr.doc, start + 2))
      .scrollIntoView()
  })
})

/** 点击脚注引用上标 → 跳转到同标签定义并聚焦（对标 Typora） */
export const footnoteRefClickPlugin = $prose(() =>
  new Plugin({
    key: new PluginKey('footnote-ref-click'),
    props: {
      handleClick(view: EditorView, _pos: number, event: MouseEvent) {
        const target = event.target
        if (!(target instanceof HTMLElement)) return false
        const sup = target.closest('sup[data-type="footnote_reference"]')
        if (!sup) return false
        const label = sup.getAttribute('data-label')
        if (!label) return false
        return jumpToDefinition(view.state, label, (tr) => view.dispatch(tr))
      },
    },
  }),
)

/** 文本节点里字面 `[^label]` 的一个匹配区间 */
interface OrphanRefRange {
  from: number
  to: number
  label: string
}

/** 扫描 doc：收集文本节点里的孤立引用字面（跳过 inlineCode mark 与代码块容器）。
 *  同时记录行首匹配的键（`${from}:${label}`），供"定义候选延迟转换"判断使用。 */
const scanOrphanRefRanges = (
  state: EditorState,
  RE: RegExp,
): { ranges: OrphanRefRange[]; lineStartKeys: Set<string> } => {
  const ranges: OrphanRefRange[] = []
  const lineStartKeys = new Set<string>()
  state.doc.descendants((node, pos) => {
    if (!node.isText) return
    // 跳过代码字面：inlineCode mark / 父级 code_block 均视为字面，不改写
    if (node.marks.some((m) => m.type.name === 'inlineCode' || m.type.name === 'code')) return
    const $pos = state.doc.resolve(pos)
    const parent = $pos.parent
    if (parent && (parent.type.name === 'code_block' || parent.type.name === 'codeBlock')) {
      return
    }
    // frontmatter 内容是纯文本（text*）：其中的 [^label] 是元数据字面。
    // 内联引用节点放不进 text* 容器，replaceWith 会把 frontmatter 整体
    // 拆毁（Fitter 降级为正文段落），加载即损坏 YAML 并随后写回磁盘。
    for (let depth = 1; depth <= $pos.depth; depth++) {
      if ($pos.node(depth).type.name === 'frontmatter') return
    }
    const text = node.text ?? ''
    RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = RE.exec(text)) !== null) {
      const matchStart = pos + m.index
      const $match = state.doc.resolve(matchStart)
      ranges.push({ from: matchStart, to: matchStart + m[0].length, label: m[1] })
      // 行首的 [^label] 视为定义候选（GFM 定义写在行首），是否转换由调用方决定：
      // 抢先转成引用会导致 `:` 变成游离字符、定义内容再也进不到脚注里。
      if ($match.parentOffset === 0) lineStartKeys.add(`${matchStart}:${m[1]}`)
    }
  })
  return { ranges, lineStartKeys }
}

/** 把扫描到的孤立引用文本替换为 footnote_reference，并在文末补缺失的 footnote_definition。
 *  返回新 tr；无变化返回 null。
 *
 *  lineStartAllowed：允许转换的行首引用键集合。传入 undefined 表示全部允许
 *  （挂载首扫：文件里的行面 `[^label]` 若真是定义会带 `:`，已被 RE 的 `(?!:)` 排除）。
 *  传入集合时，行首引用只有集合内（即上一状态就已存在、`]` 之后继续键入却没出现
 *  `:`）才转换——刚随本事务键入的行首引用延迟一次，给 def 输入规则接管机会。
 *
 *  cursorGuard：光标保护（编辑路径开启，挂载首扫关闭）。光标仍落在 `[^` 与 `]`
 *  之间时说明标签正在键入，暂不转换——输入法/编辑器自动补配的 `]`、或正文残留
 *  的旧 `]` 会让 `[^h` 立刻满足 `[^h]` 字面，若立即转换，用户随后键入的字母会
 *  落到引用节点之外，表现为"标签被截断成第一个字符"。等光标越过 `]` 或移开后再转。 */
interface OrphanFixOptions {
  lineStartAllowed?: Set<string>
  cursorGuard?: boolean
}

const buildOrphanFixTr = (
  state: EditorState,
  ranges: OrphanRefRange[],
  refType: import('@milkdown/kit/prose/model').NodeType,
  defType: import('@milkdown/kit/prose/model').NodeType,
  schema: import('@milkdown/kit/prose/model').Schema,
  options: OrphanFixOptions = {},
): Transaction | null => {
  // 1) 找出所有已存在的定义标签（避免重复补）
  const definedLabels = new Set<string>()
  state.doc.descendants((node) => {
    if (node.type.name === 'footnote_definition' && node.attrs.label) {
      definedLabels.add(node.attrs.label)
    }
  })

  // 2) 替换文本里的孤立引用为 footnote_reference 节点
  const tr = state.tr
  const convertible = ranges.filter((r) => {
    const $from = state.doc.resolve(r.from)
    if ($from.parentOffset === 0) {
      if (!options.lineStartAllowed) return true
      if (!options.lineStartAllowed.has(`${r.from}:${r.label}`)) return false
    }
    if (options.cursorGuard) {
      const head = state.selection.head
      if (head > r.from && head < r.to) return false
    }
    return true
  })
  if (DEV_FOOTNOTE_TRACE && convertible.length > 0)
    console.info('[footnote-orphan] scan: ranges=', convertible.map((r) => r.label).join(','))

  // 倒序替换避免位置偏移
  for (let i = convertible.length - 1; i >= 0; i--) {
    const r = convertible[i]
    tr.replaceWith(r.from, r.to, refType.create({ label: r.label }))
  }

  // 3) 当前 doc 里的所有引用标签（含已被第 2 步替换为节点的）
  const refLabels = new Set<string>()
  state.doc.descendants((node) => {
    if (node.type.name === 'footnote_reference' && node.attrs.label) {
      refLabels.add(node.attrs.label)
    }
  })

  // 4) 缺哪些 definition 就补哪个（每次重新读 size 以保持顺序）
  const missing: string[] = []
  refLabels.forEach((label) => {
    if (!definedLabels.has(label)) missing.push(label)
  })
  for (const label of missing) {
    const defNode = defType.create({ label }, schema.nodes.paragraph.create())
    tr.insert(tr.doc.content.size, defNode)
  }

  // 仅当文档确实发生变化（替换/补定义生效）才返回事务；否则返回 null，
  // 避免“ranges 非空但替换未生效”时反复 dispatch 造成的无限事务循环。
  if (tr.docChanged) return tr
  return null
}

/** Typora 风格兜底插件：把文档里残留的孤立引用文本 [^label] 改写为
 *  footnote_reference 节点，并在文末补一个空 footnote_definition 节点（如果还没有）。
 *
 *  - 在 view 创建时立即扫一次（覆盖 defaultValueCtx 加载）；
 *  - 通过 appendTransaction 介入每次 dispatch，覆盖 replaceContent / 实时键入；
 *  - 跳过 code_block / inline_code 容器内的字面 [^label]；
 *  - 同标签只补一次 definition，不会无限重写。
 */
export const footnoteOrphanAsRefPlugin = $prose((ctx) => {
  const schema = ctx.get(schemaCtx)
  const refType = schema.nodes.footnote_reference
  const defType = schema.nodes.footnote_definition
  if (!refType || !defType) {
    return new Plugin({ key: new PluginKey('footnote-orphan-noop') })
  }
  const RE = /\[\^([^\]\s]+)\](?!:)/g
  const runScan = (state: EditorState, options: OrphanFixOptions = {}) =>
    buildOrphanFixTr(state, scanOrphanRefRanges(state, RE).ranges, refType, defType, schema, options)
  return new Plugin({
    key: new PluginKey('footnote-orphan'),
    // 首次挂载（EditorState.create 完成后）主动跑一次扫描，
    // 否则初始 doc 不会经过 appendTransaction，孤立引用永远保留。
    // 挂载扫描不限制行首、不做光标保护（lineStartAllowed/cursorGuard 缺省）
    view: (view) => {
      const tr = runScan(view.state)
      if (tr) {
        tr.setMeta('addToHistory', false)
        view.dispatch(tr)
      }
      return {}
    },
    // 后续 dispatch（replaceContent / 实时键入）由 appendTransaction 兜底。
    // 行首候选延迟一次转换：只有上一状态就存在的行首 `[^label]`（`]` 之后
    // 已继续键入且并未出现 `:`）才转引用，刚键入的留给 def 规则。
    // 光标保护开启：标签尚未键入完（光标在 `[^` 与 `]` 之间）不转换。
    appendTransaction(_transactions, oldState, newState) {
      const { ranges } = scanOrphanRefRanges(newState, RE)
      const hasLineStartCandidate = ranges.some(
        (r) => newState.doc.resolve(r.from).parentOffset === 0,
      )
      // 注意：ranges 为空也不能早退——挂载扫描刚把字面转为引用节点时，
      // 缺失的占位定义靠这次 appendTransaction 补齐
      const tr = buildOrphanFixTr(newState, ranges, refType, defType, schema, {
        lineStartAllowed: hasLineStartCandidate
          ? scanOrphanRefRanges(oldState, RE).lineStartKeys
          : undefined,
        cursorGuard: true,
      })
      return tr ? tr.setMeta('addToHistory', false) : null
    },
  })
})

/** 在文档中定位同标签定义并把光标放进其首段（无定义时不动作） */
const jumpToDefinition = (
  state: EditorState,
  label: string,
  dispatch: (tr: Transaction) => void,
): boolean => {
  let defPos = -1
  state.doc.descendants((node, pos) => {
    if (defPos >= 0) return false
    if (node.type.name === 'footnote_definition' && node.attrs.label === label) {
      defPos = pos
      return false
    }
  })
  if (defPos < 0) return false
  const tr = state.tr
    .setSelection(TextSelection.create(state.doc, defPos + 2))
    .scrollIntoView()
  dispatch(tr)
  return true
}
