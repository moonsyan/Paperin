import {
  buildR11OldNoteMarkdown,
  buildR11SourceAMarkdown,
  buildR11SourceBMarkdown,
  buildR11TechNoteMarkdown,
  buildR11WelcomeMarkdown,
  R11_DEMO_FILE_IDS,
} from '../../../shared/testing/r11-fixture-contract'

/** R11 合成任务示例：旧笔记、目标技术说明、可用来源（仅演示树，不写用户工作区） */
export const R11_TASK_DEMO_FILES = {
  [R11_DEMO_FILE_IDS.welcome]: {
    id: R11_DEMO_FILE_IDS.welcome,
    name: '欢迎使用.md',
    content: buildR11WelcomeMarkdown(),
  },
  [R11_DEMO_FILE_IDS.oldNote]: {
    id: R11_DEMO_FILE_IDS.oldNote,
    name: '网关改造备忘（旧笔记）.md',
    content: buildR11OldNoteMarkdown(),
  },
  [R11_DEMO_FILE_IDS.techNote]: {
    id: R11_DEMO_FILE_IDS.techNote,
    name: 'API 网关技术说明（草稿）.md',
    content: buildR11TechNoteMarkdown(),
  },
  [R11_DEMO_FILE_IDS.sourceA]: {
    id: R11_DEMO_FILE_IDS.sourceA,
    name: '缓存失效策略（合成来源 A）.md',
    content: buildR11SourceAMarkdown(),
  },
  [R11_DEMO_FILE_IDS.sourceB]: {
    id: R11_DEMO_FILE_IDS.sourceB,
    name: '限流与重试（合成来源 B）.md',
    content: buildR11SourceBMarkdown(),
  },
}

export const R11_TASK_TREE_FOLDERS = [
  {
    label: '示例任务',
    fileIds: [R11_DEMO_FILE_IDS.welcome, R11_DEMO_FILE_IDS.techNote, R11_DEMO_FILE_IDS.oldNote],
  },
  {
    label: '资料来源',
    fileIds: [R11_DEMO_FILE_IDS.sourceA, R11_DEMO_FILE_IDS.sourceB],
  },
]
