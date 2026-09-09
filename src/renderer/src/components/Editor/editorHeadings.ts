import type { Node as ProseNode } from '@milkdown/kit/prose/model'

/**
 * 扫描指定位置之前（含）的标题，枚举口径与大纲面板 parseOutline 一致：
 * - 只统计 h1-h4（h5/h6 不进大纲，也不参与 DOM 定位）；
 * - 引用块内标题（`> # x`）计入——渲染层生成真实 h1，大纲与 DOM 都收录；
 * - 列表项内标题（`- # foo`、`1. ## bar`）不计入——CommonMark 渲染层
 *   生成真实 h1/h2，但 Markdown 行级扫描不收录；纳入会导致状态栏/大纲
 *   高亮索引与大纲点击定位（DOM 已同步跳过 li）不一致。
 *
 * 返回 { heading, headingIndex }：heading 为最后一个命中标题的文本，
 * headingIndex 为其在"大纲可见标题"序列中的序号（-1 表示光标前无标题）。
 */
export function collectActiveHeading(
  doc: ProseNode,
  upTo: number,
): { heading: string; headingIndex: number } {
  let heading = ''
  let headingIndex = -1
  let hCount = -1
  let stopped = false
  doc.descendants((node, pos) => {
    if (stopped) return false
    if (pos > upTo) {
      stopped = true
      return false
    }
    if (node.type.name === 'heading') {
      const level = node.attrs.level as number
      if (level >= 1 && level <= 4 && !isInsideListItem(doc, pos)) {
        hCount++
        headingIndex = hCount
        heading = node.textContent
      }
    }
    return true
  })
  return { heading, headingIndex }
}

const isInsideListItem = (doc: ProseNode, pos: number): boolean => {
  const $pos = doc.resolve(pos)
  for (let depth = $pos.depth; depth > 0; depth--) {
    if ($pos.node(depth).type.name === 'list_item') return true
  }
  return false
}
