import {
  buildProductOldNoteMarkdown,
  buildProductSourceAMarkdown,
  buildProductSourceBMarkdown,
  buildProductTechNoteMarkdown,
  buildProductWelcomeMarkdown,
  R11_DEMO_FILE_IDS,
} from '../product/r11-demo-content'
import { R11_FIXTURE_MARKERS } from '../product/r11-demo-markers'

export { R11_FIXTURE_MARKERS, R11_DEMO_FILE_IDS }

/** 在生产正文上叠加可搜索夹具锚点（仅测试 / smoke，不进入生产首屏） */
function withFixtureAnchor(body: string, anchor: string, note?: string): string {
  const lines = body.split('\n')
  const title = lines[0] ?? ''
  const rest = lines.slice(1).join('\n').replace(/^\n+/, '')
  const noteBlock = note ? `\n\n> 来源标记 \`${anchor}\` 供工作区搜索与引用插入测试使用。` : ''
  return `${title}\n\n${anchor}\n\n${rest}${noteBlock}\n`
}

export function buildR11SourceAMarkdown(): string {
  return withFixtureAnchor(
    buildProductSourceAMarkdown(),
    R11_FIXTURE_MARKERS.sourceAAnchor,
    'note',
  )
}

export function buildR11SourceBMarkdown(): string {
  return withFixtureAnchor(buildProductSourceBMarkdown(), R11_FIXTURE_MARKERS.sourceBAnchor)
}

export function buildR11OldNoteMarkdown(): string {
  return withFixtureAnchor(buildProductOldNoteMarkdown(), R11_FIXTURE_MARKERS.oldNoteAnchor)
}

export function buildR11TechNoteMarkdown(): string {
  const base = buildProductTechNoteMarkdown().replace(
    '或用工作区搜索 `缓存失效`',
    `或用工作区搜索 \`${R11_FIXTURE_MARKERS.sourceAAnchor}\``,
  )
  return withFixtureAnchor(base, R11_FIXTURE_MARKERS.techNoteAnchor)
}

export function buildR11WelcomeMarkdown(): string {
  return buildProductWelcomeMarkdown()
}

export const R11_SEARCHABLE_PHRASES = [
  R11_FIXTURE_MARKERS.sourceAAnchor,
  R11_FIXTURE_MARKERS.sourceBAnchor,
  R11_FIXTURE_MARKERS.oldNoteAnchor,
  R11_FIXTURE_MARKERS.techNoteAnchor,
] as const
