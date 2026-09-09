import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@milkdown/kit/prose/state'

export interface ImagePlaceholderImage {
  src: string
  alt: string
}

type ImagePlaceholderMeta =
  | { type: 'add'; id: string; position: number }
  | { type: 'remove'; id: string }

type ImagePlaceholderState = Map<string, number>

export const imagePlaceholderKey = new PluginKey<ImagePlaceholderState>('image-placeholder')

const mapPlaceholderPositions = (
  positions: ImagePlaceholderState,
  transaction: Transaction,
): ImagePlaceholderState => {
  const mapped = new Map<string, number>()
  positions.forEach((position, id) => {
    const result = transaction.mapping.mapResult(position, -1)
    if (result.deleted) return
    mapped.set(id, result.pos)
  })
  return mapped
}

export const getImagePlaceholderPosition = (
  state: EditorState,
  id: string,
): number | null => imagePlaceholderKey.getState(state)?.get(id) ?? null

export const addImagePlaceholder = (
  state: EditorState,
  id: string,
  position: number,
): Transaction =>
  state.tr
    .setMeta(imagePlaceholderKey, { type: 'add', id, position } satisfies ImagePlaceholderMeta)
    .setMeta('addToHistory', false)

export const removeImagePlaceholder = (
  state: EditorState,
  id: string,
): Transaction | null => {
  if (getImagePlaceholderPosition(state, id) === null) return null
  return state.tr
    .setMeta(imagePlaceholderKey, { type: 'remove', id } satisfies ImagePlaceholderMeta)
    .setMeta('addToHistory', false)
}

const createImageNode = (state: EditorState, image: ImagePlaceholderImage): ProseNode | null => {
  const imageType = state.schema.nodes.image
  if (!imageType) return null
  try {
    return imageType.create({ src: image.src, alt: image.alt, title: null })
  } catch {
    return null
  }
}

export const replaceImagePlaceholder = (
  state: EditorState,
  id: string,
  image: ImagePlaceholderImage,
): Transaction | null => {
  const position = getImagePlaceholderPosition(state, id)
  if (position === null) return null
  const imageNode = createImageNode(state, image)
  if (!imageNode) return null
  return state.tr
    .insert(position, imageNode)
    .setMeta(imagePlaceholderKey, { type: 'remove', id } satisfies ImagePlaceholderMeta)
}

export const imagePlaceholderPlugin = new Plugin<ImagePlaceholderState>({
  key: imagePlaceholderKey,
  state: {
    init: () => new Map(),
    apply(transaction, previous) {
      const positions = mapPlaceholderPositions(previous, transaction)
      const meta = transaction.getMeta(imagePlaceholderKey) as ImagePlaceholderMeta | undefined
      if (!meta) return positions
      if (meta.type === 'add') {
        positions.set(meta.id, meta.position)
        return positions
      }
      positions.delete(meta.id)
      return positions
    },
  },
})
