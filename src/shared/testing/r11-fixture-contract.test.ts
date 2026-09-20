import { describe, expect, it } from 'vitest'
import {
  buildR11OldNoteMarkdown,
  buildR11SourceAMarkdown,
  buildR11TechNoteMarkdown,
  R11_DEMO_FILE_IDS,
  R11_SEARCHABLE_PHRASES,
} from './r11-fixture-contract'
import { R11_FIXTURE_MARKERS } from '../product/r11-demo-markers'

describe('R11 合成示例契约', () => {
  it('包含旧笔记、技术说明草稿与两条可用来源锚点', () => {
    expect(buildR11OldNoteMarkdown()).toContain(R11_FIXTURE_MARKERS.oldNoteAnchor)
    expect(buildR11TechNoteMarkdown()).toContain(R11_FIXTURE_MARKERS.techNoteAnchor)
    expect(buildR11SourceAMarkdown()).toContain(R11_FIXTURE_MARKERS.sourceAAnchor)
    expect(R11_SEARCHABLE_PHRASES).toHaveLength(4)
    expect(R11_DEMO_FILE_IDS.techNote).toBe('r11-tech-note')
  })
})
