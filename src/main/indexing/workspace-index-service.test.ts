import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createWorkspaceIndexService } from './workspace-index-service'
import type { WorkspaceIndexServiceDeps } from './workspace-index-service'

interface FakeFile {
  content: string
  mtimeMs: number
  size: number
}

const createDeps = (files: Record<string, FakeFile> = {}): WorkspaceIndexServiceDeps & {
  files: Record<string, FakeFile>
  readCount: (path: string) => number
} => {
  const reads = new Map<string, number>()
  return {
    files,
    async listMarkdownFiles(_root) {
      return Object.entries(files).map(([path, f]) => ({
        path,
        size: f.size,
        mtimeMs: f.mtimeMs,
      }))
    },
    async readFileText(path) {
      reads.set(path, (reads.get(path) ?? 0) + 1)
      const file = files[path]
      if (!file) throw new Error('not found')
      return file.content
    },
    async resolveResourcePath(_root, target) {
      return `D:/notes/${target}`
    },
    readCount(path) {
      return reads.get(path) ?? 0
    },
  }
}

const MD = (title: string) => `# ${title}\n正文`

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('workspace-index-service：增量扫描', () => {
  it('首次 refresh 读取全部文件并发布 updated 事件', async () => {
    const deps = createDeps({
      'D:/notes/a.md': { content: MD('A'), mtimeMs: 10, size: 10 },
      'D:/notes/b.md': { content: MD('B'), mtimeMs: 20, size: 10 },
    })
    const service = createWorkspaceIndexService(deps)
    const updated = vi.fn()
    service.subscribe('D:/notes', updated)

    const result = await service.refresh('D:/notes')

    expect(result.complete).toBe(true)
    expect(result.truncated).toBe(false)
    expect(Object.keys(result.index.documents).sort()).toEqual(['D:/notes/a.md', 'D:/notes/b.md'])
    expect(updated).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'updated' }),
    )
  })

  it('未变化的文件不重新读取内容', async () => {
    const deps = createDeps({
      'D:/notes/a.md': { content: MD('A'), mtimeMs: 10, size: 10 },
      'D:/notes/b.md': { content: MD('B'), mtimeMs: 20, size: 10 },
    })
    const service = createWorkspaceIndexService(deps)
    await service.refresh('D:/notes')
    expect(deps.readCount('D:/notes/a.md')).toBe(1)

    deps.files['D:/notes/b.md'] = { content: MD('B2'), mtimeMs: 30, size: 12 }
    await service.refresh('D:/notes')

    // a 未变化：不再读；b 变化：重读一次
    expect(deps.readCount('D:/notes/a.md')).toBe(1)
    expect(deps.readCount('D:/notes/b.md')).toBe(2)
  })

  it('mtime 或 size 改变时只解析该文件，其余文档保持同一对象引用', async () => {
    const deps = createDeps({
      'D:/notes/a.md': { content: MD('A'), mtimeMs: 10, size: 10 },
      'D:/notes/b.md': { content: MD('B'), mtimeMs: 20, size: 10 },
    })
    const service = createWorkspaceIndexService(deps)
    const first = await service.refresh('D:/notes')
    const docAFirst = first.index.documents['D:/notes/a.md']

    deps.files['D:/notes/b.md'] = { content: MD('B2'), mtimeMs: 30, size: 12 }
    const second = await service.refresh('D:/notes')

    expect(second.index.documents['D:/notes/a.md']).toBe(docAFirst)
    expect(second.index.documents['D:/notes/b.md'].headings[0].text).toBe('B2')
  })
})

describe('workspace-index-service：generation 与取消', () => {
  it('被取消的旧任务不发布更新；新任务推进 generation 并覆盖快照', async () => {
    // 受控的 listMarkdownFiles：第一次 refresh 挂起期间取消并启动第二次
    let releaseFirst: (() => void) | null = null as (() => void) | null
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = () => resolve()
    })
    const deps = createDeps({
      'D:/notes/a.md': { content: MD('A'), mtimeMs: 10, size: 10 },
    })
    let callCount = 0
    deps.listMarkdownFiles = async () => {
      callCount++
      if (callCount === 1) await firstGate
      return Object.entries(deps.files).map(([path, f]) => ({
        path,
        size: f.size,
        mtimeMs: f.mtimeMs,
      }))
    }
    const service = createWorkspaceIndexService(deps)
    const updated = vi.fn()
    service.subscribe('D:/notes', (event) => {
      if (event.type === 'updated') updated(event)
    })

    const firstPromise = service.refresh('D:/notes')
    // 轮转微任务：让第一次 refresh 进入 listMarkdownFiles 并挂起在 gate 上
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(callCount).toBe(1)

    // 挂起中取消旧任务并启动新任务（串行队列：新任务在旧任务结束后执行）
    service.cancel('D:/notes')
    const secondPromise = service.refresh('D:/notes')
    releaseFirst?.()

    await expect(firstPromise).rejects.toMatchObject({ code: 'CANCELLED' })
    const second = await secondPromise
    expect(second.generation).toBe(2)
    // 旧任务未发布 updated；新任务快照成为当前状态
    expect(updated).toHaveBeenCalledTimes(1)
    const loaded = await service.load('D:/notes')
    expect(loaded?.generation).toBe(second.generation)
  })

  it('cancel 后 refresh 以 CANCELLED 失败结束并发布 failed 事件', async () => {
    const deps = createDeps({
      'D:/notes/a.md': { content: MD('A'), mtimeMs: 10, size: 10 },
    })
    const service = createWorkspaceIndexService(deps)
    const failed = vi.fn()
    service.subscribe('D:/notes', failed)

    const controller = new AbortController()
    const promise = service.refresh('D:/notes', { signal: controller.signal })
    controller.abort()

    await expect(promise).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(failed).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'failed', code: 'CANCELLED' }),
    )
  })
})

describe('workspace-index-service：预算与进度', () => {
  it('超过文件数预算时 truncated=true 且仅索引预算内文件', async () => {
    const files: Record<string, FakeFile> = {}
    for (let i = 0; i < 6; i++) {
      files[`D:/notes/${i}.md`] = { content: MD(String(i)), mtimeMs: i, size: 10 }
    }
    const deps = createDeps(files)
    const listMarkdownFiles = vi.spyOn(deps, 'listMarkdownFiles')
    const service = createWorkspaceIndexService(deps, { maxFiles: 5 })

    const result = await service.refresh('D:/notes')
    expect(listMarkdownFiles).toHaveBeenCalledWith('D:/notes', 6)
    expect(result.truncated).toBe(true)
    expect(result.complete).toBe(false)
    expect(Object.keys(result.index.documents).length).toBe(5)
  })

  it('发布 progress 事件（scanned/total）', async () => {
    const deps = createDeps({
      'D:/notes/a.md': { content: MD('A'), mtimeMs: 10, size: 10 },
      'D:/notes/b.md': { content: MD('B'), mtimeMs: 20, size: 10 },
    })
    const service = createWorkspaceIndexService(deps)
    const progress = vi.fn()
    service.subscribe('D:/notes', (event) => {
      if (event.type === 'progress') progress(event)
    })

    await service.refresh('D:/notes')
    expect(progress).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'progress', scanned: 2, total: 2 }),
    )
  })
})

describe('workspace-index-service：dispose', () => {
  it('dispose 后再 refresh 返回空结果或抛错，不残留工作区状态', async () => {
    const deps = createDeps({
      'D:/notes/a.md': { content: MD('A'), mtimeMs: 10, size: 10 },
    })
    const service = createWorkspaceIndexService(deps)
    await service.refresh('D:/notes')
    service.dispose('D:/notes')
    const loaded = await service.load('D:/notes')
    expect(loaded).toBeNull()
  })
})
