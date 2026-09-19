import {
  Editor as MilkdownCore,
  rootCtx,
  defaultValueCtx,
  editorViewOptionsCtx,
  editorViewCtx,
  remarkPluginsCtx,
} from '@milkdown/kit/core'
import {
  Plugin,
  PluginKey,
  type Transaction,
} from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { history } from '@milkdown/kit/plugin/history'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { prism, prismConfig } from '@milkdown/plugin-prism'
import { math } from '@milkdown/plugin-math'
import { $prose } from '@milkdown/kit/utils'
import { useEditor } from '@milkdown/react'

/* ==================== ProseMirror 插件与语法扩展（已拆分至 plugins/） ==================== */

import { searchPlugin } from '../plugins/searchHighlight'
import { nodeAttrsPlugin } from '../plugins/nodeAttrs'
import { lineNumPlugin } from '../plugins/codeLineNumbers'
import { blockContextPlugin } from '../plugins/blockContext'
import { bracketMatchPlugin } from '../plugins/bracketMatch'
import { sectionFoldPlugin } from '../plugins/sectionFold'
import { sectionReorderPlugin } from '../plugins/sectionReorder'
import { customCodeFenceRule, customCodeFenceKeymap } from '../plugins/customCodeFence'
import {
  footnoteDefInputRule,
  footnoteRefInputRule,
  footnoteRefClickPlugin,
  footnoteOrphanAsRefPlugin,
} from '../plugins/footnote'
import { frontmatterRemarkPlugin, frontmatterSchema, frontmatterKeymap } from '../plugins/frontmatter'
import {
  wikiLinkSchema,
  wikiLinkInputRule,
  wikiLinkClickPlugin,
  wikiLinkStatusPlugin,
  wikiAutocompletePlugin,
  wikiTextConvertPlugin,
} from '../plugins/wikiLink'
import { tableColResizePlugin } from '../plugins/tableColResize'
import { taskListCheckboxPlugin } from '../plugins/taskListCheckbox'
import { linkClickPlugin } from '../plugins/linkClick'
import { mermaidPreviewPlugin } from '../plugins/mermaidCodeBlock'
import { structuredCodePlugin } from '../plugins/structuredCodeBlock'
import { configureCodeBlockRefractor } from '../plugins/syntaxHighlighting'
import { mathEditablePlugin } from '../plugins/mathEditable'
import { imagePlaceholderPlugin } from '../plugins/imagePlaceholder'
import { markdownPastePlugin } from '../plugins/markdownPaste'
import { blockImagePastePlugin } from '../plugins/blockImagePaste'
import { ensureFootnoteDefinitions } from '../../../lib/footnote-normalize'
import { collectActiveHeading } from '../navigation/editorHeadings'
import {
  installViewportTracker,
  streamInsertKey,
} from '../viewport/editorViewport'
import type { EditorProps } from '../editor-types'
import type { MutableRefObject } from 'react'

export interface MilkdownInstanceOptions {
  editorRef: MutableRefObject<MilkdownCore | null>
  initialRef: MutableRefObject<string>
  changeRef: MutableRefObject<(markdown: string) => void>
  cursorRef: MutableRefObject<EditorProps['onCursorChange']>
  dirtyRef: MutableRefObject<boolean>
  streamingRef: MutableRefObject<boolean>
  abortStreamRef: MutableRefObject<boolean>
}

export const useMilkdownInstance = ({
  editorRef,
  initialRef,
  changeRef,
  cursorRef,
  dirtyRef,
  streamingRef,
  abortStreamRef,
}: MilkdownInstanceOptions): void => {
    useEditor((root) => {
      const editor = MilkdownCore.make()
        .config((ctx) => {
          ctx.set(rootCtx, root)
          // Typora 风格：加载时为孤立脚注引用补占位定义，使 [^label] 渲染为上标
          // （gfm 仅在有定义时才解析引用节点）。基线取自编辑器实际输出，
          // 不会因此误标未保存；仅当用户编辑并保存时才把定义写入文件。
          ctx.set(defaultValueCtx, ensureFootnoteDefinitions(initialRef.current))
          // 关闭拼写检查：避免代码/中文内容出现红色波浪线
          ctx.update(editorViewOptionsCtx, (prev) => ({
            ...prev,
            spellcheck: false,
          }))
          // 注册 YAML frontmatter 解析（文档头部 --- 元数据块）。
          // 插件为 unified 风格（this: UnifiedLike），与 Milkdown 的 RemarkPlugin
          // 类型不完全匹配但运行时兼容；用显式断言代替脆弱的 @ts-expect-error，
          // 避免上游类型变更时出现“未使用的 @ts-expect-error”编译错误。
          // （脚注语法由 gfm 预设的 remarkGFM 原生解析，无需在此注册。）
          ctx.get(remarkPluginsCtx).push({
            plugin: frontmatterRemarkPlugin,
            options: {},
          } as never)
          ctx.set(prismConfig.key, {
            configureRefractor: configureCodeBlockRefractor,
          })
          ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
            // listener 的 markdownUpdated 带有 200ms 防抖，App 会把该快照与
            // 当前 EditorState 再核对，避免旧文件内容串入新文件。
            // 3.1 Tier 2：分块流式插入期间跳过上报——流式过程会触发多次
            // （防抖后仍可能数次）全文档序列化，既无必要也拖慢加载；流结束后
            // 的首次上报（streamingRef 已复位）会正常落账。
            if (streamingRef.current) return
            changeRef.current(markdown)
          })
        })
        // frontmatter 内 Enter 行为（须先于 commonmark 预设注册才能抢先其 Enter 绑定）
        .use(frontmatterKeymap)
        // 围栏 Enter 建代码块同样须先于 commonmark 的 Enter 绑定
        .use(customCodeFenceKeymap)
        .use(commonmark)
        // ~~~ 必须先于 GFM 删除线输入规则注册，否则第三个波浪号会被错误消费
        .use(customCodeFenceRule)
        .use(gfm)
        .use(history)
        .use(listener)
        // 代码块语法高亮（保持轻量 pre>code 渲染）
        .use(prism)
        // KaTeX 必须在编辑器创建前注册；运行期 use() 不会执行插件初始化。
        .use(math)
        // 公式可编辑 NodeView：接管 math_inline / math_block 渲染，
        // 双击（空白公式单击）进入编辑，失焦 / Enter 写回，Esc 取消。
        .use(mathEditablePlugin)
        // 异步图片插入位置锚点（不写入 Markdown）
        .use($prose(() => imagePlaceholderPlugin))
        // 纯文本 Markdown 粘贴需要走 parserCtx，否则 ProseMirror 会按普通文本插入。
        .use(markdownPastePlugin)
        // 脚注（gfm 内置节点 + 输入规则 + 点击跳转）
        .use([footnoteDefInputRule, footnoteRefInputRule])
        .use(footnoteRefClickPlugin)
        // Typora 风格兜底：把文档里残留的孤立引用文本 [^label] 改为
        // footnote_reference 节点并在文末补 definition，对所有加载路径生效。
        .use(footnoteOrphanAsRefPlugin)
        // GFM 任务列表：点击复选框区域切换勾选状态
        .use(taskListCheckboxPlugin)
        // Ctrl/Cmd+点击链接在系统浏览器打开
        .use(linkClickPlugin)
        // YAML frontmatter 元数据块（对标 Typora）
        .use(frontmatterSchema)
        // 表格列宽可视化拖拽（视图级，不写入 Markdown）
        .use($prose(() => tableColResizePlugin))
        // 搜索高亮插件
        .use($prose(() => searchPlugin))
        .use(blockImagePastePlugin)
        // 代码块 spellcheck 排除 + 图片 draggable（装饰方式，避免 DOM 变异乒乓）
        .use($prose(() => nodeAttrsPlugin))
        // Mermaid 预览使用装饰组件，源码始终保留为 Milkdown 原生代码块。
        .use($prose(() => mermaidPreviewPlugin))
        .use($prose(() => structuredCodePlugin))
        // 代码块行号（开关由 codeLineNumbers prop 控制，装饰 widget 实现）
        .use($prose(() => lineNumPlugin))
        // 块级上下文标记（光标所在块高亮）
        .use($prose(() => blockContextPlugin))
        // 前后缀匹配高亮（括号/引号配对高亮）
        .use($prose(() => bracketMatchPlugin))
        // 标题段落折叠
        .use($prose(() => sectionFoldPlugin))
        // 章节拖拽排序（标题悬浮手柄；拖拽前展开折叠章节，避免子内容静默丢位）
        .use($prose(() => sectionReorderPlugin))
        // Wiki 链接 [[target]] 语法与点击跳转
        .use(wikiLinkSchema)
        .use(wikiLinkInputRule)
        .use(wikiLinkClickPlugin)
        .use(wikiLinkStatusPlugin)
        .use(wikiAutocompletePlugin)
        .use(wikiTextConvertPlugin)
        // 3.4：同步脏标记。listener 的 updated/markdownUpdated 均带 211ms 防抖，
        // 无法在切文件瞬间捕获“200ms 窗口内刚有输入”，故用原生 PM 插件在每次
        // docChanged 事务时同步置位，供 flushEditorContent 决定是否全量序列化。
        // 3.1 Tier 2：流式插入期间不打脏标记——否则切走时 flushEditorContent 会
        // 把流式中途的部分内容序列化并自动保存到磁盘，污染文件。
        .use(
          $prose(() => {
            const key = new PluginKey('dirty-track')
            return new Plugin({
              key,
              state: {
                init: () => null,
                apply(tr) {
                  if (tr.docChanged && !streamingRef.current) dirtyRef.current = true
                  return null
                },
              },
            })
          }),
        )
        // 光标位置上报（供状态栏/大纲高亮；rAF 节流，连续输入每帧只算一次）
        .use(
          $prose(() => {
            const key = new PluginKey('cursor-report')
            // L6：最近一次事务（state.apply 在 view.update 之前执行）。
            // update 只拿到新旧 state、拿不到 tr，事务范围判定只能经此中转
            let lastTr: Transaction | null = null
            return new Plugin({
              key,
              state: {
                init: () => null,
                apply(tr) {
                  lastTr = tr
                  return null
                },
              },
              view: () => {
                let raf = 0
                /**
                 * C-12：光标位置/章节信息按块缓存。光标在同一块内移动（每次按键、
                 * 方向键）只重算块内偏移，不再每次 textBetween(0, from) 拷贝全文、
                 * 不再遍历整篇文档统计标题——大文档上每次按键的扫描成本从 O(doc)
                 * 降到 O(块)。
                 */
                let blockCache: {
                  blockStart: number
                  /** 当前块之前已占用的完整行数（含块间分隔与图片/硬换行） */
                  prefixLines: number
                  /** 当前块之前是否还有文本内容（决定块首边界是否计一行） */
                  hasPrefixText: boolean
                  heading: string
                  headingIndex: number
                } | null = null

                /** 扫描到指定位置前的标题（与大纲面板 parseOutline 同口径：
                 *  引用块标题计入、列表项内标题不计入——否则状态栏与大纲
                 *  高亮索引会与大纲点击定位（DOM 已跳过 li）不一致） */
                const scanHeadings = (
                  view: EditorView,
                  upTo: number,
                ): { heading: string; headingIndex: number } =>
                  collectActiveHeading(view.state.doc, upTo)

                const report = (view: EditorView) => {
                  const fn = cursorRef.current
                  if (!fn) return
                  const { from } = view.state.selection
                  const $from = view.state.doc.resolve(from)
                  const block = $from.parent
                  if (!block.isTextblock) {
                    // 光标在块边界/非文本位置（图片等）：回退旧式全文计算，此场景不常见
                    blockCache = null
                    const text = view.state.doc.textBetween(0, from, '\n', '\n')
                    const lines = text.split('\n')
                    const heads = scanHeadings(view, from)
                    fn(
                      lines.length,
                      lines[lines.length - 1].length + 1,
                      heads.heading,
                      heads.headingIndex,
                      0,
                    )
                    return
                  }
                  const blockStart = $from.start()
                  if (!blockCache || blockCache.blockStart !== blockStart) {
                    const prefixText = view.state.doc.textBetween(0, blockStart, '\n', '\n')
                    const prefixLines = prefixText.split('\n').length - 1
                    const heads = scanHeadings(view, blockStart)
                    blockCache = {
                      blockStart,
                      prefixLines,
                      hasPrefixText: prefixText.length > 0,
                      heading: heads.heading,
                      headingIndex: heads.headingIndex,
                    }
                  }
                  // 与旧公式 textBetween(0, from) 等价：
                  // 行数 = 块前缀行数 + 块首边界行（光标已进入块内且块前有内容）+ 块内行数 + 1
                  const within = view.state.doc.textBetween(blockStart, from, '\n', '\n')
                  const withinLines = within.split('\n')
                  const boundaryLine =
                    from > blockStart && blockCache.hasPrefixText ? 1 : 0
                  const row = blockCache.prefixLines + boundaryLine + withinLines.length
                  const col = withinLines[withinLines.length - 1].length + 1
                  let heading = blockCache.heading
                  const headingIndex = blockCache.headingIndex
                  // 光标所在块自身是 h1-h4 标题时，标题文本随编辑实时更新
                  if (block.type.name === 'heading') {
                    const lv = block.attrs.level as number
                    if (lv >= 1 && lv <= 4) {
                      heading = block.textContent
                    }
                  }
                  fn(
                    row,
                    col,
                    heading,
                    headingIndex,
                    // 选中字数（去空白，无选区为 0）
                    (() => {
                      const { from: sf, to: st } = view.state.selection
                      if (sf >= st) return 0
                      return view.state.doc.textBetween(sf, st).replace(/\s/g, '').length
                    })(),
                  )
                }
                return {
                  update: (view, prevState) => {
                    // L6：光标块上方文档变化（搜索 replaceAll、wiki 自动转换、
                    // 属性面板保存等会改上方行数与标题）时，选区未动也能经
                    // blockStart 判缓存命中而沿用旧值，状态栏行号/所属标题过期。
                    // 事务起点在光标块之前即作废缓存并调度重算；起点在本块内/之后
                    // 不影响上方内容，保持 O(块) 快速路径
                    if (lastTr && lastTr.docChanged && blockCache) {
                      let changedAbove = false
                      for (let i = 0; i < lastTr.steps.length && !changedAbove; i++) {
                        const step = lastTr.steps[i] as { from?: number } | undefined
                        if (typeof step?.from === 'number' && step.from < blockCache.blockStart) {
                          changedAbove = true
                        }
                      }
                      if (changedAbove) {
                        blockCache = null
                        if (!raf) {
                          raf = requestAnimationFrame(() => {
                            raf = 0
                            report(view)
                          })
                        }
                      }
                    }
                    if (prevState.selection.eq(view.state.selection)) return
                    // 已有调度则跳过，回调时读最新 state
                    if (raf) return
                    raf = requestAnimationFrame(() => {
                      raf = 0
                      report(view)
                    })
                  },
                  destroy: () => {
                    if (raf) cancelAnimationFrame(raf)
                  },
                }
              },
            })
          }),
        )
        // 3.1 Tier 2：流式插入守卫。
        // filterTransaction 在 dispatch 前拦截：流式期间只放行本流的事务与不改文档
        // 的事务（选区/滚动）。半截文档上的任何编辑都会在流结束后被 onComplete
        // 当作完整内容建立基线，随后自动保存把截断内容写回磁盘——必须提前拦下。
        // state.apply 的 abort 标记保留为纵深防御（正常已被过滤，到不了 apply）。
        .use(
          $prose(() => {
            const key = new PluginKey('stream-guard')
            return new Plugin({
              key,
              state: {
                init: () => null,
                apply(tr) {
                  if (streamingRef.current && !tr.getMeta(streamInsertKey) && tr.docChanged) {
                    abortStreamRef.current = true
                  }
                  return null
                },
              },
              filterTransaction: (tr: Transaction) => {
                if (!streamingRef.current) return true
                return !tr.docChanged || tr.getMeta(streamInsertKey) === true
              },
            })
          }),
        )
        // 3.1 Tier 1：视口追踪器。滚动/缩放跨越区块边界时下发 viewportChangedKey 事务，
        // 驱动装饰插件只在视口内重建（裁掉大文档视口外装饰 DOM）。
        .use(
          $prose(() => {
            const key = new PluginKey('viewport-tracker')
            return new Plugin({
              key,
              view: (view) => {
                const uninstall = installViewportTracker(view)
                return { destroy: uninstall }
              },
            })
          }),
        )
      editorRef.current = editor
      // dev 模式挂全局诊断函数，用户在 DevTools console 输入 __footnoteDebug()
      // 即可看到当前 doc 的脚注状态（refs/defs/字面残留/已注册插件 key）。
      // 定位"脚注不渲染"真根因用：refs 为空但 literal 有 [^label] = input rule
      // 没触发；refs 非空但 DOM 看不到上标 = 渲染层问题；pluginKeys 不含
      // footnote-* = 注册链断了。
      const DEV_TRACE: boolean = (() => {
        try {
          return Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV)
        } catch {
          return false
        }
      })()
      if (DEV_TRACE) {
        const attach = (): void => {
          const ed = editorRef.current
          if (!ed) {
            setTimeout(attach, 200)
            return
          }
          try {
            const view = ed.action((ctx) => ctx.get(editorViewCtx))
            if (!view) {
              setTimeout(attach, 200)
              return
            }
            ;(window as unknown as { __footnoteDebug: () => unknown }).__footnoteDebug = () => {
              const refs: Array<{ label: string; pos: number }> = []
              const defs: Array<{ label: string; pos: number }> = []
              const literal: Array<{ pos: number; text: string }> = []
              view.state.doc.descendants((n, pos) => {
                if (n.type.name === 'footnote_reference') {
                  refs.push({ label: n.attrs.label, pos })
                }
                if (n.type.name === 'footnote_definition') {
                  defs.push({ label: n.attrs.label, pos })
                }
                if (n.isText && /\[\^[^\]\s]+\]/.test(n.text ?? '')) {
                  literal.push({ pos, text: n.text ?? '' })
                }
              })
              const pluginKeys = view.state.plugins.map((p) => {
                const spec = (p as { spec?: { key?: { name?: string } } }).spec
                return spec?.key?.name ?? 'unknown'
              })
              return {
                refs,
                defs,
                literal,
                pluginKeys,
                hasFootnotePlugin: pluginKeys.some((k) => k.includes('footnote')),
                docTextContent: view.state.doc.textContent,
              }
            }
            console.info(
              '[footnote-dev] ✅ 编辑器已就绪。键入 [^label] 后在 console 输入 __footnoteDebug() 查看脚注状态',
            )
            console.info(
              '[footnote-dev] 已注册 plugins:',
              view.state.plugins.map((p) => {
                const spec = (p as { spec?: { key?: { name?: string } } }).spec
                return spec?.key?.name ?? 'unknown'
              }),
            )
          } catch {
            setTimeout(attach, 200)
          }
        }
        setTimeout(attach, 1000)
      }
      return editor
    }, [])
}
