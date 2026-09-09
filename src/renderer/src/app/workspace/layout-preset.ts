import type { SidebarView } from '../../../../shared/workspace-state'

/**
 * 工作区布局预设：只保存面板可见性和视图状态，不修改正文、标签页或
 * 任何文档数据。图谱、质量检查等尚未落地的面板保留扩展位（未知
 * toggle key 序列化时保留、应用时忽略），对应功能落地前不生效。
 */

export type LayoutToggleKey = 'typewriterMode'

/** 内置预设 id；自定义预设使用任意字符串 id */
export type BuiltinLayoutPresetId = 'writing' | 'knowledge' | 'technical-docs' | 'publishing'

export interface LayoutPreset {
  id: string
  name: string
  activeView: SidebarView | null
  sidebarWidth: number | null
  toggles: Partial<Record<LayoutToggleKey, boolean>> & Record<string, boolean | undefined>
}

export interface AppliedLayoutState {
  activeView: SidebarView
  sidebarWidth: number
  typewriterMode: boolean
}

/** 内置四预设：写作（低干扰）/ 知识库（文件树导航）/ 技术文档（文件树+常规光标）/ 出版（大纲+字数核对） */
export const BUILT_IN_LAYOUT_PRESETS: readonly LayoutPreset[] = [
  {
    id: 'writing',
    name: '写作',
    activeView: 'outline',
    sidebarWidth: 280,
    toggles: { typewriterMode: true },
  },
  {
    id: 'knowledge',
    name: '知识库',
    activeView: 'files',
    sidebarWidth: 300,
    toggles: {},
  },
  {
    id: 'technical-docs',
    name: '技术文档',
    activeView: 'files',
    sidebarWidth: 300,
    toggles: { typewriterMode: false },
  },
  {
    id: 'publishing',
    name: '出版',
    activeView: 'outline',
    sidebarWidth: 300,
    toggles: { typewriterMode: false },
  },
]

/** 应用预设：null 字段保持现状；未知 toggle key 忽略（为后续面板预留） */
export const applyLayoutPreset = (
  preset: LayoutPreset,
  current: AppliedLayoutState,
): AppliedLayoutState => ({
  activeView: preset.activeView ?? current.activeView,
  sidebarWidth: preset.sidebarWidth ?? current.sidebarWidth,
  typewriterMode: preset.toggles.typewriterMode ?? current.typewriterMode,
})

/** 持久化格式：未知字段随对象保留，向前兼容后续面板开关 */
export type SerializedLayoutPreset = unknown

export const serializeCustomPresets = (presets: LayoutPreset[]): SerializedLayoutPreset[] =>
  presets.map((preset) => ({
    id: preset.id,
    name: preset.name,
    activeView: preset.activeView,
    sidebarWidth: preset.sidebarWidth,
    toggles: { ...preset.toggles },
  }))

const isValidPresetShape = (value: unknown): value is LayoutPreset => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<LayoutPreset>
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    typeof candidate.name === 'string' &&
    typeof candidate.toggles === 'object' &&
    candidate.toggles !== null
  )
}

/** 解析自定义预设：损坏条目安全跳过，整体非数组回退空列表 */
export const parseCustomPresets = (raw: unknown): LayoutPreset[] => {
  if (!Array.isArray(raw)) return []
  return raw.filter(isValidPresetShape).map((preset) => ({
    ...preset,
    activeView: preset.activeView ?? null,
    sidebarWidth: typeof preset.sidebarWidth === 'number' ? preset.sidebarWidth : null,
    toggles: { ...preset.toggles },
  }))
}
