import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWorkspaceFileWatcher } from './workspace-file-watcher'

describe('workspace-file-watcher', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const setup = (debounceMs = 250) => {
    type RawCb = (paths: string[]) => void
    const callbacks = new Set<RawCb>()
    const stopped = vi.fn()
    const watch = vi.fn((root: string, onRaw: RawCb) => {
      callbacks.add(onRaw)
      return () => {
        callbacks.delete(onRaw)
        stopped()
      }
    })
    const onChange = vi.fn()
    const watcher = createWorkspaceFileWatcher({ watch, debounceMs })
    watcher.start('D:/notes', onChange)
    const fire = (paths: string[]) => {
      callbacks.forEach((cb) => cb(paths))
    }
    return { fire, onChange, watch, stopped, watcher }
  }

  it('附录探针：根路径与目录路径合并为一次 rescan（非 0 次回调）', async () => {
    const { fire, onChange } = setup(1)
    fire(['D:/notes'])
    fire(['D:/notes/renamed-folder'])
    await vi.advanceTimersByTimeAsync(1)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ kind: 'rescan', reason: 'directory' })
  })

  it('Markdown 变更去抖后合并为 files 批次', async () => {
    const { fire, onChange } = setup()
    fire(['D:/notes/a.md'])
    await vi.advanceTimersByTimeAsync(249)
    expect(onChange).not.toHaveBeenCalled()

    fire(['D:/notes/b.md'])
    fire(['D:/notes/c.md'])
    await vi.advanceTimersByTimeAsync(249)
    expect(onChange).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({
      kind: 'changes',
      markdownPaths: ['D:/notes/a.md', 'D:/notes/b.md', 'D:/notes/c.md'],
      resourcePaths: [],
    })
  })

  it('去抖批次按路径去重', async () => {
    const { fire, onChange } = setup()
    fire(['D:/notes/a.md', 'D:/notes/a.md'])
    fire(['D:/notes/b.md', 'D:/notes/a.md'])
    await vi.advanceTimersByTimeAsync(250)
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith({
      kind: 'changes',
      markdownPaths: ['D:/notes/a.md', 'D:/notes/b.md'],
      resourcePaths: [],
    })
  })

  it('过滤隐藏目录、node_modules 与非 Markdown 文件', async () => {
    const { fire, onChange } = setup()
    fire([
      'D:/notes/.hidden/x.md',
      'D:/notes/node_modules/pkg/readme.md',
      'D:/notes/图片.png',
      'D:/notes/正文.md',
    ])
    await vi.advanceTimersByTimeAsync(250)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({
      kind: 'changes',
      markdownPaths: ['D:/notes/正文.md'],
      resourcePaths: ['D:/notes/图片.png'],
    })
  })

  it('附件变更去抖后合并为 resourcePaths', async () => {
    const { fire, onChange } = setup()
    fire(['D:/notes/a.png', 'D:/notes/b.png'])
    await vi.advanceTimersByTimeAsync(250)
    expect(onChange).toHaveBeenCalledWith({
      kind: 'changes',
      markdownPaths: [],
      resourcePaths: ['D:/notes/a.png', 'D:/notes/b.png'],
    })
  })

  it('删除事件仍作为 Markdown changes 转发', async () => {
    const { fire, onChange } = setup()
    fire(['D:/notes/gone.md'])
    await vi.advanceTimersByTimeAsync(250)
    expect(onChange).toHaveBeenCalledWith({ kind: 'changes', markdownPaths: ['D:/notes/gone.md'], resourcePaths: [] })
  })

  it('POSIX 根路径与目录移动触发 rescan', async () => {
    const { watcher } = setup(1)
    watcher.stop()
    const onPosix = vi.fn()
    const posixWatch = vi.fn((_root: string, cb: (paths: string[]) => void) => {
      cb(['/home/notes'])
      cb(['/home/notes/moved-dir'])
      return () => undefined
    })
    const posixWatcher = createWorkspaceFileWatcher({ watch: posixWatch, debounceMs: 1 })
    posixWatcher.start('/home/notes', onPosix)
    await vi.advanceTimersByTimeAsync(1)
    expect(onPosix).toHaveBeenCalledWith({ kind: 'rescan', reason: 'directory' })
  })

  it('无名事件触发 rescan unknown', async () => {
    const { fire, onChange } = setup(1)
    fire([''])
    await vi.advanceTimersByTimeAsync(1)
    expect(onChange).toHaveBeenCalledWith({ kind: 'rescan', reason: 'unknown' })
  })

  it('rescan 窗口内忽略伪造 Markdown 路径', async () => {
    const { fire, onChange } = setup(1)
    fire(['D:/notes'])
    fire(['D:/notes/not-a-real-rescan.md'])
    await vi.advanceTimersByTimeAsync(1)
    expect(onChange).toHaveBeenCalledWith({ kind: 'rescan', reason: 'directory' })
  })

  it('20_000 条 Markdown 变更合并为单批 files', async () => {
    const { fire, onChange } = setup(5)
    for (let i = 0; i < 20_000; i++) {
      fire([`D:/notes/${i % 100}.md`])
    }
    await vi.advanceTimersByTimeAsync(5)
    expect(onChange).toHaveBeenCalledTimes(1)
    const payload = onChange.mock.calls[0][0]
    expect(payload.kind).toBe('changes')
    if (payload.kind === 'changes') {
      expect(payload.markdownPaths).toHaveLength(100)
    }
  })

  it('stop 取消未触发的去抖 timer', async () => {
    const { fire, onChange, watcher } = setup()
    fire(['D:/notes/a.md'])
    watcher.stop()
    await vi.advanceTimersByTimeAsync(250)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('切换工作区时旧 timer 不会打到新回调', async () => {
    const callbacks = new Set<(paths: string[]) => void>()
    const watch = vi.fn((_root: string, cb: (paths: string[]) => void) => {
      callbacks.add(cb)
      return () => callbacks.delete(cb)
    })
    const first = vi.fn()
    const second = vi.fn()
    const watcher = createWorkspaceFileWatcher({ watch, debounceMs: 250 })
    watcher.start('D:/notes/one', first)
    callbacks.forEach((cb) => cb(['D:/notes/one/a.md']))
    watcher.start('D:/notes/two', second)
    await vi.advanceTimersByTimeAsync(250)
    expect(first).not.toHaveBeenCalled()
    callbacks.forEach((cb) => cb(['D:/notes/two/b.md']))
    await vi.advanceTimersByTimeAsync(250)
    expect(second).toHaveBeenCalledWith({
      kind: 'changes',
      markdownPaths: ['D:/notes/two/b.md'],
      resourcePaths: [],
    })
  })

  it('stop 后关闭底层 watch 且重复 stop 幂等', async () => {
    const stopped = vi.fn()
    const watch = vi.fn((_root: string, _cb: (paths: string[]) => void) => stopped)
    const watcher = createWorkspaceFileWatcher({ watch, debounceMs: 250 })
    watcher.start('D:/notes', vi.fn())
    expect(watch).toHaveBeenCalledOnce()
    watcher.stop()
    expect(stopped).toHaveBeenCalledOnce()
    watcher.stop()
    expect(stopped).toHaveBeenCalledOnce()
  })
})
