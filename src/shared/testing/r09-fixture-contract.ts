import { WORKSPACE_SCAN_MAX_FILE_BYTES } from '../workspace-coverage'

export const R09_FIXTURE_MARKERS = {
  originalTail: 'R09_FIXTURE_ORIGINAL_TAIL',
  lastInput: 'R09_FIXTURE_LAST_INPUT',
  largeParagraphTail: 'PERF_LARGE_DOCUMENT_TAIL',
  largeParagraphOriginal: 'PERF_LARGE_DOCUMENT_ORIGINAL',
  multiStructureAnchor: 'R09_MULTI_STRUCTURE_ANCHOR',
} as const

export const R09_FIXTURE_FILENAMES = {
  ordinary: 'R09-普通文档.md',
  sizeBelow: 'R09-阈值下.md',
  sizeAbove: 'R09-阈值上.md',
  largeParagraph5Mib: '5MiB-性能文档.md',
  multiStructure5Mib: 'R09-多结构-5MiB.md',
} as const

export const R09_SCAN_THRESHOLD_BYTES = WORKSPACE_SCAN_MAX_FILE_BYTES

export function buildR09OrdinaryDocumentMarkdown(): string {
  return `# R09 普通夹具

中文段落与 ASCII mixed。末尾保留原文标记。

${R09_FIXTURE_MARKERS.originalTail}

保存后应同时包含末次输入标记（由测试或 Electron 门禁写入）。
`
}

/** 多结构正文骨架（不含 5 MiB 填充），供导出正确性与结构验收复用。 */
export function buildR09MultiStructureSkeleton(
  scanThresholdBytes = R09_SCAN_THRESHOLD_BYTES,
): string {
  return `---
title: R09 多结构夹具
tags: [性能, 中文]
---

# 多结构 5 MiB 夹具

${R09_FIXTURE_MARKERS.multiStructureAnchor}

## 列表与表格

- 中文项一
  - 嵌套 **加粗** 与 \`inline\`
- [x] 任务完成
- [ ] 任务未完成

| 列 A | 列 B |
| --- | --- |
| 表格中文 | \`code\` |

\`\`\`ts
export const threshold = ${scanThresholdBytes}
\`\`\`

行内公式 $E=mc^2$ 与块级：

$$
\\int_0^1 x^2 \\, dx
$$

\`\`\`mermaid
flowchart LR
  A[中文节点] --> B{R09}
\`\`\`

脚注示例[^note]

[^note]: 中文脚注定义

> 引用块保留

[不完整链接](missing-target

${R09_FIXTURE_MARKERS.originalTail}
`
}

export const R09_MULTI_STRUCTURE_EXPORT_ANCHORS = [
  R09_FIXTURE_MARKERS.multiStructureAnchor,
  '表格中文',
  'E=mc',
  'flowchart',
  '中文脚注',
  R09_FIXTURE_MARKERS.originalTail,
] as const
