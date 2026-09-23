import { buildGettingStartedMarkdown } from './getting-started'

/** 合成示例树中的文件 id（生产首屏与测试共用） */
export const R11_DEMO_FILE_IDS = {
  welcome: 'welcome',
  oldNote: 'r11-old-note',
  techNote: 'r11-tech-note',
  sourceA: 'r11-source-a',
  sourceB: 'r11-source-b',
} as const

/**
 * 生产首屏示例正文：可读、可搜索，不含测试夹具标记。
 * 自动化 smoke / 契约测试请用 shared/testing/r11-fixture-contract。
 */
export function buildProductSourceAMarkdown(): string {
  return `# 缓存失效策略（合成来源 A）

当配置变更时，应在 **60 秒内** 使边缘节点读取到新版本；旧版本只读窗口最长 5 分钟。

关键检索词：缓存失效、TTL、边缘节点。
`
}

export function buildProductSourceBMarkdown(): string {
  return `# 限流与重试（合成来源 B）

客户端对同一 API 的突发请求应指数退避，上限 30 秒；服务端返回 \`429\` 时必须带 \`Retry-After\`。

## 与旧笔记的关系

参见 [[网关改造备忘（旧笔记）]] 中的历史结论。
`
}

export function buildProductOldNoteMarkdown(): string {
  return `# 网关改造备忘（旧笔记）

2025 年记录：当时采用同步刷新，未区分只读窗口。后续技术说明应引用 [[缓存失效策略（合成来源 A）]] 与 [[限流与重试（合成来源 B）]] 中的现行策略。

- [x] 整理历史背景
- [ ] 写对外技术说明（见 [[API 网关技术说明（草稿）]]）
`
}

export function buildProductTechNoteMarkdown(): string {
  return `# API 网关技术说明（草稿）

## 背景

（在此写一段背景，可引用旧笔记 [[网关改造备忘（旧笔记）]]。）

## 依据

1. 从资料中找到两条依据（打开「资料来源」文件夹，或用工作区搜索 \`缓存失效\`）。
2. 用「插入引用」把片段带来源写进本节，不要手抄。

## 结论

（写出当前结论；保存后重新打开应完整保留。）

---
命令面板可新建「技术文章模板」起步；内容仅为普通 Markdown，不会覆盖已打开文件。
`
}

export function buildProductWelcomeMarkdown(): string {
  return buildGettingStartedMarkdown()
}
