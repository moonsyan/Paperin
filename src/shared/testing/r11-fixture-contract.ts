import { CORE_TASK_HEADLINE, CORE_TASK_TAGLINE } from '../product/core-task'
import { R11_FIXTURE_MARKERS } from '../product/r11-demo-markers'

export { R11_FIXTURE_MARKERS }

/** 合成示例树中的旧笔记、目标技术说明与可用来源（不写入用户知识库） */
export const R11_DEMO_FILE_IDS = {
  welcome: 'welcome',
  oldNote: 'r11-old-note',
  techNote: 'r11-tech-note',
  sourceA: 'r11-source-a',
  sourceB: 'r11-source-b',
} as const

export function buildR11SourceAMarkdown(): string {
  return `# 缓存失效策略（合成来源 A）

${R11_FIXTURE_MARKERS.sourceAAnchor}

当配置变更时，应在 **60 秒内** 使边缘节点读取到新版本；旧版本只读窗口最长 5 分钟。

> 来源标记 \`${R11_FIXTURE_MARKERS.sourceAAnchor}\` 供工作区搜索与引用插入测试使用。
`
}

export function buildR11SourceBMarkdown(): string {
  return `# 限流与重试（合成来源 B）

${R11_FIXTURE_MARKERS.sourceBAnchor}

客户端对同一 API 的突发请求应指数退避，上限 30 秒；服务端返回 \`429\` 时必须带 \`Retry-After\`。

## 与旧笔记的关系

参见 [[网关改造备忘（旧笔记）]] 中的历史结论。
`
}

export function buildR11OldNoteMarkdown(): string {
  return `# 网关改造备忘（旧笔记）

${R11_FIXTURE_MARKERS.oldNoteAnchor}

2025 年记录：当时采用同步刷新，未区分只读窗口。后续技术说明应引用 [[缓存失效策略（合成来源 A）]] 与 [[限流与重试（合成来源 B）]] 中的现行策略。

- [x] 整理历史背景
- [ ] 写对外技术说明（见 [[API 网关技术说明（草稿）]]）
`
}

export function buildR11TechNoteMarkdown(): string {
  return `# API 网关技术说明（草稿）

${R11_FIXTURE_MARKERS.techNoteAnchor}

## 背景

（在此写一段背景，可引用旧笔记 [[网关改造备忘（旧笔记）]]。）

## 依据

1. 从资料中找到两条依据（打开「资料来源」文件夹，或用工作区搜索 \`${R11_FIXTURE_MARKERS.sourceAAnchor}\`）。
2. 用「插入引用」把片段带来源写进本节，不要手抄。

## 结论

（写出当前结论；保存后重新打开应完整保留。）

---
命令面板可新建「技术文章模板」起步；内容仅为普通 Markdown，不会覆盖已打开文件。
`
}

export function buildR11WelcomeMarkdown(): string {
  return `# 欢迎使用 Paperin

${CORE_TASK_HEADLINE}

${CORE_TASK_TAGLINE}

## 先试一个小任务

1. 在左侧打开 **资料来源** 里的两篇合成资料，或搜索 \`${R11_FIXTURE_MARKERS.sourceAAnchor}\`。
2. 打开 **API 网关技术说明（草稿）**（或命令面板新建「技术文章模板」），用 **插入引用** 写一段带依据的说明。
3. 保存后关闭再打开，确认正文与来源仍在。

示例内容只存在于本机演示树，**不会**自动写入你打开的知识库文件夹。

## 更多能力

- 侧栏「示例任务 / 资料来源」中有旧笔记、技术草稿与可引用来源
- 「更多示例 / 快速开始.md」仍是 Markdown 语法速查
`
}

export const R11_SEARCHABLE_PHRASES = [
  R11_FIXTURE_MARKERS.sourceAAnchor,
  R11_FIXTURE_MARKERS.sourceBAnchor,
  R11_FIXTURE_MARKERS.oldNoteAnchor,
  R11_FIXTURE_MARKERS.techNoteAnchor,
] as const
