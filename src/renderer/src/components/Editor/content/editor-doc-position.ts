import type { Node as ProseNode } from '@milkdown/kit/prose/model'

/**
 * 文档位置纯函数：在 ProseMirror 绝对位置与两种外部坐标系之间换算。
 * - 块锚点：跨"整篇替换"存活的位置表示；
 * - Markdown 源行号：诊断/大纲使用的行坐标。
 * 不含 React、不含 EditorView，便于直接单元测试。
 */

/**
 * 顶层块锚点：整篇替换的 ReplaceStep 会把旧文档内部位置恒映射到新内容
 * 末尾（StepMap 语义），mapping 恢复光标必然落到文档尾。改用
 * "第 N 个顶层块 + 块内偏移"跨替换锚定——frontmatter 编辑、排版修复、
 * 版本恢复等整篇替换后光标仍落在原内容附近。
 */
export interface BlockAnchor {
  blockIndex: number
  offsetInBlock: number
}

export const blockAnchorFor = (doc: ProseNode, pos: number): BlockAnchor => {
  let blockIndex = 0
  let result: BlockAnchor = { blockIndex: 0, offsetInBlock: 0 }
  let done = false
  doc.forEach((node, offset) => {
    if (done) return
    const contentStart = offset + 1
    if (pos >= contentStart && pos <= offset + node.nodeSize - 1) {
      result = {
        blockIndex,
        offsetInBlock: Math.max(0, Math.min(pos - contentStart, node.content.size)),
      }
      done = true
    } else if (pos <= offset) {
      // 位置在块边界上（如文档开头）：锚定到当前块起始
      result = { blockIndex, offsetInBlock: 0 }
      done = true
    }
    blockIndex++
  })
  if (!done) {
    // 位置越过所有块（文档尾）：锚定末块尾
    result = { blockIndex: Math.max(0, doc.childCount - 1), offsetInBlock: Number.MAX_SAFE_INTEGER }
  }
  return result
}

export const positionForBlockAnchor = (doc: ProseNode, anchor: BlockAnchor): number => {
  let index = 0
  let result: number | null = null
  doc.forEach((node, offset) => {
    if (result !== null) return
    if (index === anchor.blockIndex) {
      result = Math.min(offset + 1 + anchor.offsetInBlock, offset + node.nodeSize - 1)
    }
    index++
  })
  if (result === null) {
    // 新文档块数更少：钳到文档尾
    result = Math.max(0, doc.content.size - 1)
  }
  return Math.max(0, result)
}

/**
 * 估算一个节点在 Markdown 源中占用的行数：
 * 文本节点按换行拆分；块级子节点各自独立计行；硬换行计入 1 行；
 * frontmatter 补上下一两行围栏。块间空行由调用方在块与块之间补计。
 */
export const sourceLineCount = (node: ProseNode): number => {
  if (node.isText) return (node.text ?? '').split('\n').length
  if (node.type.name === 'hardbreak') return 1
  let lines = 0
  node.forEach((child) => {
    lines += sourceLineCount(child)
  })
  if (node.type.name === 'frontmatter') lines += 2
  return Math.max(1, lines)
}

/**
 * Markdown 源行号 → 文档位置（focusLine 定位用）。
 *
 * 顶层块粒度：不能用 descendants 累加——容器节点与其子块、段落与其文本节点
 * 会被重复计数，块间空行与 frontmatter 围栏也不在 textContent 里。
 * 行号非法或越界时钳到文档尾。
 */
export const positionForSourceLine = (doc: ProseNode, line: number): number => {
  if (!Number.isFinite(line) || line < 1) return doc.content.size
  let cursor = 1
  let bestPos: number | null = null
  doc.forEach((node, offset) => {
    if (bestPos !== null) return
    if (cursor >= line) {
      bestPos = offset + 1
      return
    }
    // 块之间在源码中至少相隔一个空行
    cursor += sourceLineCount(node) + 1
    if (cursor >= line) bestPos = offset + 1
  })
  return bestPos ?? doc.content.size
}
