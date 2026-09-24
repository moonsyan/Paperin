// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  Editor as MilkdownCore,
  defaultValueCtx,
  editorViewCtx,
  rootCtx,
} from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'

const USER_DIAGRAM = `graph TD
    A["LiveAiTask / VideoShopTask"] -->|"创建/更新 image_path + status=0"| B["t_live_image_processing 表"]
    B -->|"查询 status=0 的记录"| C["LiveImageProcessingTask.markProcessing()"]
    C -->|"标记 status=3 (MARKED)"| D["LiveImageProcessingTask.doTask()"]
    D -->|"读取 image_path 获取 stuPath/teaPath"| E["下载截图到本地"]
    E -->|"学生画面: 人数清点+行为分析"| F["studentScreen()"]
    E -->|"教师画面: 表情分析"| G["teacherScreen()"]
    F --> H["AI识别完成"]
    G --> H
    H -->|"更新 status=2 (SUCCESS)"| I["liveImageProcessingDAO.update()"]
`

describe('Milkdown 解析用户 Mermaid 围栏', () => {
  it('code_block 文本与原文一致（不被 GFM/管道符拆坏）', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const md = ['```mermaid', USER_DIAGRAM, '```'].join('\n')
    const editor = MilkdownCore.make()
      .config((ctx) => {
        ctx.set(rootCtx, root)
        ctx.set(defaultValueCtx, md)
      })
      .use(commonmark)
      .use(gfm)
    await editor.create()
    const view = editor.action((ctx) => ctx.get(editorViewCtx))
    const blocks: string[] = []
    view.state.doc.descendants((node: ProseNode) => {
      if (node.type.name === 'code_block') {
        blocks.push(`${String(node.attrs.language)}\n${node.textContent}`)
      }
    })
    expect(blocks.length).toBe(1)
    expect(blocks[0]).toContain('mermaid')
    expect(blocks[0]).toContain('LiveAiTask / VideoShopTask')
    expect(blocks[0]).toContain('markProcessing()')
    expect(blocks[0]).toContain('liveImageProcessingDAO.update()')
    // 管道边标签必须完整保留
    expect(blocks[0]).toContain('|"创建/更新 image_path + status=0"|')
  })
})
