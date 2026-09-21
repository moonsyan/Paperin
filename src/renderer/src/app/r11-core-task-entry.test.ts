// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CORE_TASK_HEADLINE } from '../../../shared/product/core-task'
import { DEFAULT_FILE_ID, DEMO_FILES, DEMO_TREE } from '../data/demo-files'
import { INITIAL_CONTENTS, INITIAL_FILES } from './constants'
import { R11_DEMO_FILE_IDS } from '../../../shared/testing/r11-fixture-contract'
import type { EditorHandle } from '../components/Editor'
import { createFileCommands } from './actions/commands/file-commands'
import { createSearchCommands } from './actions/commands/search-commands'
import { createCommandContext, isCommandAvailable } from './commands/command-context'
import { useRef, useState } from 'react'
import { renderHook } from '@testing-library/react'
import { useDocumentCreationAndCollection } from './useDocumentCreationAndCollection'
import { act } from '@testing-library/react'
import { insertCitationFromPanel } from '../lib/insert-citation'
import { CORE_TASK_STEPS, formatCoreTaskFail } from '../../../shared/testing/core-task-contract'

describe('R11 核心任务入口', () => {
  it('首次打开只展示欢迎示例一篇标签', () => {
    expect(INITIAL_FILES).toEqual([{ id: DEFAULT_FILE_ID, name: DEMO_FILES[DEFAULT_FILE_ID].name }])
    expect(DEFAULT_FILE_ID).toBe(R11_DEMO_FILE_IDS.welcome)
    expect(INITIAL_CONTENTS.welcome).toContain(CORE_TASK_HEADLINE)
  })

  it('示例树含旧笔记、技术草稿与资料来源，且不写入用户工作区', () => {
    const taskFolder = DEMO_TREE.find((folder) => folder.label === '示例任务')
    const sourceFolder = DEMO_TREE.find((folder) => folder.label === '资料来源')
    expect(taskFolder?.fileIds).toContain(R11_DEMO_FILE_IDS.techNote)
    expect(taskFolder?.fileIds).toContain(R11_DEMO_FILE_IDS.oldNote)
    expect(sourceFolder?.fileIds).toEqual([R11_DEMO_FILE_IDS.sourceA, R11_DEMO_FILE_IDS.sourceB])
    expect(DEMO_FILES[R11_DEMO_FILE_IDS.sourceA].content).toContain('R11_SYNTH_SOURCE_A')
  })

  it('README 与 package 描述与核心任务 headline 一致', () => {
    const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8')
    const pkg = readFileSync(join(process.cwd(), 'package.json'), 'utf8')
    expect(readme).toContain(CORE_TASK_HEADLINE)
    expect(readme).toContain('收下资料，写出理解，带来源交付')
    expect(pkg).toContain(CORE_TASK_HEADLINE)
  })

  it('无知识库仍可从命令创建模板文档', async () => {
    const { result } = renderHook(() => {
      const activeFileIdRef = useRef('old')
      const editorRef = useRef<EditorHandle>(null)
      const [, setContents] = useState<Record<string, string>>({ old: '原文' })
      const [, setSavedMap] = useState<Record<string, boolean>>({ old: true })
      return useDocumentCreationAndCollection({
        activeFileIdRef,
        editorRef,
        handleNew: () => {
          activeFileIdRef.current = 'untitled-1'
        },
        setContents,
        setSavedMap,
        workspaceIndex: null,
        documents: {},
      })
    })
    await act(async () => {
      await result.current.handleNewFromTemplate('article')
    })
  })

  it('命令入口：模板与全文搜索带可发现关键词', () => {
    const handlers = { current: {} } as never
    const article = createFileCommands(handlers).find((cmd) => cmd.id === 'newTemplate:article')
    const wsSearch = createSearchCommands(handlers).find((cmd) => cmd.id === 'wsSearch')
    expect(article?.keywords).toContain('技术说明')
    expect(wsSearch?.keywords).toContain('引用')
  })

  it('外部 Markdown 无库仍算文档上下文；工作区搜索需有库', () => {
    const external = createCommandContext({ activeFileId: 'C:/ext/note.md', hasWorkspace: false })
    expect(isCommandAvailable(external, { requires: 'document' })).toBe(true)
    expect(isCommandAvailable(external, { requires: 'workspace' })).toBe(false)
  })

  it('关闭全部标签命令入口保留（空标签时由 StartScreen 承接）', () => {
    const closeAll = createFileCommands({ current: {} } as never).find((c) => c.id === 'closeAllTabs')
    expect(closeAll?.title).toContain('关闭全部')
  })

  it('插入引用提示可撤销收回', () => {
    const insertMd = vi.fn()
    const notify = vi.fn()
    insertCitationFromPanel({
      editor: { insertMd },
      activeFileId: 'draft',
      fromFile: 'draft',
      toFile: 'sources/a.md',
      preview: '依据片段',
      notify,
    })
    expect(insertMd).toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith('已插入来源引用，可用撤销收回')
  })

  it('窄窗口样式仍声明抽屉断点（关闭全部标签/start 屏不另开布局）', () => {
    const css = readFileSync(join(process.cwd(), 'src/renderer/src/styles/soft-workbench.css'), 'utf8')
    expect(css).toContain('@media (max-width: 820px)')
  })

  it('核心闭环步骤失败必须带 CORE_TASK_FAIL 步骤名', () => {
    expect(CORE_TASK_STEPS).toEqual(['find-source', 'insert-citation', 'save-reopen', 'export-bundle'])
    expect(formatCoreTaskFail('find-source', 'NO_MATCH')).toBe('CORE_TASK_FAIL find-source NO_MATCH')
  })
})
