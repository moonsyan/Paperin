import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { dirname, isAbsolute, relative, resolve } from 'path'
import { createWorkspaceIndexService } from './workspace-index-service'
import type { WorkspaceIndexServiceDeps } from './workspace-index-service'

interface FakeFile {
  content: string
  mtimeMs: number
  size: number
}

const createDeps = (
  files: Record<string, FakeFile> = {},
  resources: Record<string, true> = {},
): WorkspaceIndexServiceDeps & {
  files: Record<string, FakeFile>
  resources: Record<string, true>
  readCount: (path: string) => number
} => {
  const reads = new Map<string, number>()
  return {
    files,
    resources,
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
    async resolveResourcePath(root, target, sourcePath) {
      if (/^(?:[a-z]+:|\\\\)/i.test(target)) return null
      const resolvedRoot = resolve(root)
      const candidate = resolve(sourcePath ? dirname(sourcePath) : resolvedRoot, target)
      const fromRoot = relative(resolvedRoot, candidate)
      if (fromRoot === '..' || fromRoot.startsWith('../') || fromRoot.startsWith('..\\') || isAbsolute(fromRoot)) {
        return null
      }
      const key = candidate.replace(/\\/g, '/')
      return resources[key] ? key : null
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

  it('listMarkdownFiles 进程级失败仍整次 INDEX_FAILED', async () => {
    const deps = createDeps({
      'D:/notes/a.md': { content: MD('A'), mtimeMs: 10, size: 10 },
    })
    deps.listMarkdownFiles = async () => {
      throw new Error('磁盘不可用')
    }
    const service = createWorkspaceIndexService(deps)
    await expect(service.refresh('D:/notes')).rejects.toMatchObject({ code: 'INDEX_FAILED' })
  })

  it('单篇读取失败计入 read-error 与诊断，其余文档可搜索', async () => {
    const deps = createDeps({
      'D:/notes/good.md': { content: '# 好\n唯一词Alpha', mtimeMs: 10, size: 20 },
      'D:/notes/bad.md': { content: MD('坏'), mtimeMs: 20, size: 10 },
      'D:/notes/missing.md': { content: MD('删'), mtimeMs: 30, size: 10 },
    })
    const baseRead = deps.readFileText
    deps.readFileText = async (path) => {
      if (path.endsWith('bad.md')) {
        const error = new Error('UTF-8 解码失败')
        error.name = 'EncodingError'
        throw error
      }
      if (path.endsWith('missing.md')) throw new Error('ENOENT')
      return baseRead(path)
    }
    const service = createWorkspaceIndexService(deps)
    const first = await service.refresh('D:/notes')
    expect(first.complete).toBe(false)
    expect(first.truncated).toBe(true)
    expect(first.index.coverage.skipped['read-error']).toBe(2)
    expect(Object.keys(first.index.documents)).toEqual(['D:/notes/good.md'])
    expect(first.index.diagnostics.filter((d) => d.code === 'READ_ERROR')).toHaveLength(2)

    deps.readFileText = baseRead
    deps.files['D:/notes/bad.md'] = { content: '# 修复\n唯一词Alpha', mtimeMs: 40, size: 24 }
    delete deps.files['D:/notes/missing.md']
    const second = await service.refresh('D:/notes')
    expect(second.index.documents['D:/notes/bad.md']).toBeDefined()
    expect(second.index.coverage.skipped['read-error']).toBe(0)
  })

  it('单篇身份变化时跳过该文件，其余文档仍进入索引', async () => {
    const deps = createDeps({
      'D:/notes/a.md': { content: MD('A'), mtimeMs: 10, size: 10 },
      'D:/notes/b.md': { content: MD('B'), mtimeMs: 20, size: 10 },
    })
    const readFileText = deps.readFileText
    deps.readFileText = async (path) => {
      if (path.endsWith('b.md')) {
        const error = new Error('文件在读取期间被替换')
        error.name = 'FileIdentityChangedError'
        throw error
      }
      return readFileText(path)
    }
    const service = createWorkspaceIndexService(deps)
    const result = await service.refresh('D:/notes')
    expect(result.truncated).toBe(true)
    expect(Object.keys(result.index.documents)).toEqual(['D:/notes/a.md'])
  })
})

describe('workspace-index-service：引用目标变化后的资源失效', () => {
  it('A 引用 B/图片且正文未变：删除或补回目标后只重验资源，不增加 A 正文读取', async () => {
    const deps = createDeps(
      {
        'D:/notes/a.md': {
          content: '# A\n\n![图](./pic.png)\n\n见 [B](./b.md)',
          mtimeMs: 10,
          size: 40,
        },
        'D:/notes/b.md': { content: '# B', mtimeMs: 20, size: 10 },
      },
      {
        'D:/notes/pic.png': true,
        'D:/notes/b.md': true,
      },
    )
    const service = createWorkspaceIndexService(deps)
    const first = await service.refresh('D:/notes')
    const link = first.index.documents['D:/notes/a.md'].outgoingLinks[0]
    expect(link.resolvedPath).toBe('D:/notes/b.md')
    expect(first.index.documents['D:/notes/a.md'].imageRefs[0].resolvedPath).toBe('D:/notes/pic.png')
    const firstIndex = first.index

    delete deps.resources['D:/notes/b.md']
    delete deps.resources['D:/notes/pic.png']
    const afterDelete = await service.refresh('D:/notes', {
      invalidation: {
        kind: 'changes',
        markdownPaths: ['D:/notes/b.md'],
        resourcePaths: ['D:/notes/pic.png'],
      },
    })
    expect(deps.readCount('D:/notes/a.md')).toBe(1)
    expect(afterDelete.index.documents['D:/notes/a.md'].outgoingLinks[0].resolvedPath).toBeUndefined()
    expect(afterDelete.index.documents['D:/notes/a.md'].imageRefs[0].resolvedPath).toBeUndefined()
    expect(afterDelete.index.links.find((l) => l.sourcePath === 'D:/notes/a.md')?.resolvedPath).toBeUndefined()
    expect(firstIndex.documents['D:/notes/a.md'].outgoingLinks[0].resolvedPath).toBe('D:/notes/b.md')

    deps.resources['D:/notes/b.md'] = true
    deps.resources['D:/notes/pic.png'] = true
    const afterRestore = await service.refresh('D:/notes', {
      invalidation: {
        kind: 'changes',
        markdownPaths: ['D:/notes/b.md'],
        resourcePaths: ['D:/notes/pic.png'],
      },
    })
    expect(deps.readCount('D:/notes/a.md')).toBe(1)
    expect(afterRestore.index.documents['D:/notes/a.md'].outgoingLinks[0].resolvedPath).toBe('D:/notes/b.md')
    expect(afterRestore.index.documents['D:/notes/a.md'].imageRefs[0].resolvedPath).toBe('D:/notes/pic.png')
  })

  it('重命名链接目标后反链随 resolvedPath 更新', async () => {
    const deps = createDeps(
      {
        'D:/notes/a.md': { content: '# A\n\n[b](./b.md)', mtimeMs: 10, size: 20 },
        'D:/notes/b.md': { content: '# B', mtimeMs: 20, size: 10 },
      },
      { 'D:/notes/b.md': true },
    )
    const service = createWorkspaceIndexService(deps)
    await service.refresh('D:/notes')
    delete deps.files['D:/notes/b.md']
    delete deps.resources['D:/notes/b.md']
    deps.files['D:/notes/c.md'] = { content: '# C', mtimeMs: 30, size: 10 }
    deps.resources['D:/notes/c.md'] = true
    deps.files['D:/notes/a.md'].content = '# A\n\n[c](./c.md)'
    deps.files['D:/notes/a.md'].mtimeMs = 11
    deps.files['D:/notes/a.md'].size = 21

    await service.refresh('D:/notes', {
      invalidation: {
        kind: 'changes',
        markdownPaths: ['D:/notes/b.md', 'D:/notes/c.md', 'D:/notes/a.md'],
        resourcePaths: [],
      },
    })
    const index = (await service.load('D:/notes'))!
    expect(index.documents['D:/notes/a.md'].outgoingLinks[0].resolvedPath).toBe('D:/notes/c.md')
    expect(index.links.find((l) => l.sourcePath === 'D:/notes/a.md')?.resolvedPath).toBe('D:/notes/c.md')
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
