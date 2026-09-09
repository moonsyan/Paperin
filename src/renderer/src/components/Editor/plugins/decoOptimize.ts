import type { Transaction } from '@milkdown/kit/prose/state'
import {
  AddMarkStep,
  AddNodeMarkStep,
  RemoveMarkStep,
  RemoveNodeMarkStep,
} from '@milkdown/kit/prose/transform'

/**
 * M13：判定一次事务的变更是否需要重扫全文档重建装饰。
 * 纯文本编辑（段落内打字/删字）只改变文本内容，各插件的装饰位置可经 tr.mapping 复用，
 * 无需 doc.descendants 全遍历。仅在变更触及块结构、图片、行内 code 或标记操作时返回 true。
 */
export interface DecorationChangeInfo {
  /** 变更起点所在块类型（最内层块，如 paragraph / code_block / heading） */
  blockAt: string | null
  /** 变更起点是否恰在块边界（块的新增/删除/起始处插入） */
  atBoundary: boolean
  /** 替换切片中出现的块节点类型集合（新增/删除的块） */
  sliceBlocks: Set<string>
  /** 切片中是否出现 image 行内节点（nodeAttrs 需为其重建 draggable 装饰） */
  hasImageNode: boolean
  /** 切片中是否出现行内 code 标记 */
  hasCodeMark: boolean
  /** 是否有标记操作步骤（加粗/斜体/行内 code 的开关） */
  hasMarkStep: boolean
}

/** 标记操作步骤的类集合；用 instanceof 而非 constructor.name——
 *  生产构建 minify 会改类名导致字符串判定永久失效（仅开发模式正常） */
const isMarkStep = (step: unknown): boolean =>
  step instanceof AddMarkStep ||
  step instanceof RemoveMarkStep ||
  step instanceof AddNodeMarkStep ||
  step instanceof RemoveNodeMarkStep

export function analyzeDecorationChange(tr: Transaction): DecorationChangeInfo {
  const info: DecorationChangeInfo = {
    blockAt: null,
    atBoundary: false,
    sliceBlocks: new Set(),
    hasImageNode: false,
    hasCodeMark: false,
    hasMarkStep: false,
  }
  if (tr.steps.length === 0) return info

  // 变更起点（新 doc 坐标）：首步 from 经全映射得到（等价 Transaction.docChangedAt）
  const firstStep = tr.steps[0] as { from?: number } | undefined
  if (firstStep && typeof firstStep.from === 'number') {
    const at = tr.mapping.map(firstStep.from)
    const docSize = tr.doc.content.size
    const probe = at < docSize ? at : Math.max(0, docSize - 1)
    tr.doc.nodesBetween(probe, Math.min(probe + 1, docSize), (node, pos) => {
      if (!node.isBlock) return true
      info.blockAt = node.type.name
      if (pos === probe) info.atBoundary = true
      return false
    })
  }

  for (const step of tr.steps) {
    if (isMarkStep(step)) info.hasMarkStep = true
    const slice = (step as { slice?: { content?: { forEach?: unknown } } }).slice
    if (!slice || typeof slice.content?.forEach !== 'function') continue
    slice.content.forEach((node: { type?: { name?: string; isBlock?: boolean }; isText?: boolean; marks?: { type?: { name?: string } }[]; descendants?: (fn: (n: unknown) => boolean) => void }) => {
      if (node.type?.isBlock && node.type.name) info.sliceBlocks.add(node.type.name)
      if (node.type?.name === 'image') info.hasImageNode = true
      if (node.isText && node.marks?.some((m) => m.type?.name === 'code')) info.hasCodeMark = true
      node.descendants?.((n: unknown) => {
        const child = n as { type?: { name?: string; isBlock?: boolean }; isText?: boolean; marks?: { type?: { name?: string } }[] }
        if (child.type?.isBlock && child.type.name) info.sliceBlocks.add(child.type.name)
        if (child.type?.name === 'image') info.hasImageNode = true
        if (child.isText && child.marks?.some((m) => m.type?.name === 'code')) info.hasCodeMark = true
        // C-7：必须返回 true 才能继续下探子节点；返回 false 会跳过整棵子树，
        // 粘贴进列表/引用块的代码块、行内 code、标题都检测不到，装饰不重建
        return true
      })
    })
  }
  return info
}
