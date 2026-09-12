export const THEMES = [
  { id: 'default', name: '暖白', color: '#F7F5F2', desc: '经典暖色调' },
  { id: 'dark', name: '墨夜', color: '#171614', desc: '深邃暗色' },
  { id: 'ocean', name: '海雾', color: '#EFF4F9', desc: '冷调蓝灰' },
  { id: 'rose', name: '玫砂', color: '#FBF5F3', desc: '温暖粉棕' },
  { id: 'github', name: '星夜', color: '#0d1117', desc: '蓝调暗色（GitHub Dark）' },
  { id: 'atom', name: '原子', color: '#272B34', desc: '靛蓝暗色（Atom）' },
  { id: 'typewriter', name: '纸墨', color: '#FCF5E4', desc: '暖纸亮色（Typewriter）' },
  { id: 'mist', name: '雾白', color: '#F7F8F5', desc: '留白绿调（quiet-workspace）' },
  { id: 'pine', name: '夜松', color: '#202522', desc: '深松暗色（quiet-workspace）' },
]

export const FONT_PRESETS: { label: string; value: number }[] = [
  { label: '小', value: 14 },
  { label: '标准', value: 16 },
  { label: '大', value: 18 },
]

export const WIDTH_PRESETS: { label: string; value: number }[] = [
  { label: '窄', value: 640 },
  { label: '标准', value: 900 },
  { label: '宽', value: 1200 },
]

export const LINE_PRESETS: { label: string; value: number }[] = [
  { label: '紧凑', value: 1.65 },
  { label: '标准', value: 1.85 },
  { label: '宽松', value: 2.1 },
]

export const CONTENT_FONT_OPTIONS: { id: 'default' | 'serif' | 'mono'; label: string }[] = [
  { id: 'default', label: '默认' },
  { id: 'serif', label: '衬线' },
  { id: 'mono', label: '等宽' },
]

/** 拼写检查可选语言（Electron/Chromium 内置词典，不含中文） */
export const SPELL_LANG_OPTIONS: { id: string; label: string }[] = [
  { id: 'en-US', label: '英语（美）' },
  { id: 'en-GB', label: '英语（英）' },
  { id: 'fr-FR', label: '法语' },
  { id: 'de-DE', label: '德语' },
  { id: 'es-ES', label: '西班牙语' },
  { id: 'it-IT', label: '意大利语' },
  { id: 'pt-BR', label: '葡萄牙语' },
  { id: 'nl-NL', label: '荷兰语' },
  { id: 'ru-RU', label: '俄语' },
]

export const NAV_ITEMS = [
  { id: 'appearance', label: '外观' },
  { id: 'editor', label: '编辑器' },
  { id: 'shortcuts', label: '快捷键' },
  { id: 'advanced', label: '高级' },
]

/** 设置搜索索引：设置项名称 → 所在分组（点击结果跳转对应面板） */
export const SETTINGS_SEARCH_INDEX: { panel: string; label: string }[] = [
  { panel: 'appearance', label: '主题切换 / 工作区独立主题' },
  { panel: 'appearance', label: '字号 / 缩放编辑区' },
  { panel: 'appearance', label: '内容宽度 / 行距 / 内容字体（衬线、等宽）' },
  { panel: 'appearance', label: '自定义主题 CSS 导入' },
  { panel: 'editor', label: '自动保存' },
  { panel: 'editor', label: '打字机模式' },
  { panel: 'editor', label: '拼写检查与语言' },
  { panel: 'editor', label: '多窗口模式' },
  { panel: 'editor', label: '空白区点击聚焦到文末' },
  { panel: 'editor', label: '代码块行号' },
  { panel: 'editor', label: '默认打开文件夹全部折叠' },
  { panel: 'editor', label: '全局字数目标 / 写作进度' },
  { panel: 'editor', label: '图床配置（本地图床 / SM.MS）' },
  { panel: 'shortcuts', label: '快捷键自定义 / 冲突检测 / 恢复默认' },
  { panel: 'advanced', label: '导出样式模板 CSS（HTML/PDF 排版）' },
  { panel: 'advanced', label: '版本历史说明' },
]
