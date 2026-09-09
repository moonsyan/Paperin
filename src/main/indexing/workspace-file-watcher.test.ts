import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWorkspaceFileWatcher } from './workspace-file-watcher'

describe('workspace-file-watcher', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const setup = () => {
    type ChangeCb = (paths: string[]) => void
    const callbacks = new Set<ChangeCb>()
    const stopped = vi.fn()
    const watch = vi.fn((root: string, onChange: ChangeCb) => {
      callbacks.add(onChange)
      return () => {
        callbacks.delete(onChange)
        stopped()
      }
    })
    const onChange = vi.fn()
    const watcher = createWorkspaceFileWatcher({ watch, debounceMs: 250 })
    watcher.start('D:/notes', onChange)
    const fire = (paths: string[]) => {
      callbacks.forEach((cb) => cb(paths))
    }
    return { fire, onChange, watch, stopped }
  }

  it('Markdown 变更去抖 250ms 后合并回调一次（窗口内批量变更合并）', async () => {
    const { fire, onChange } = setup()
    fire(['D:/notes/a.md'])
    await vi.advanceTimersByTimeAsync(249)
    expect(onChange).not.toHaveBeenCalled()

    // 窗口内连续变更：重置计时并合并到一个批次（含首次 a，refresh 端按
    // mtime 比对幂等，多余路径无副作用）
    fire(['D:/notes/b.md'])
    fire(['D:/notes/c.md'])
    await vi.advanceTimersByTimeAsync(249)
    expect(onChange).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith([
      'D:/notes/a.md',
      'D:/notes/b.md',
      'D:/notes/c.md',
    ])
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
    expect(onChange).toHaveBeenCalledWith(['D:/notes/正文.md'])
  })

  it('删除事件（路径不存在于文件系统）同样触发刷新回调', async () => {
    // watcher 只转发路径：文件是否存在由索引服务扫描判定，不在此过滤
    const { fire, onChange } = setup()
    fire(['D:/notes/gone.md'])
    await vi.advanceTimersByTimeAsync(250)
    expect(onChange).toHaveBeenCalledWith(['D:/notes/gone.md'])
  })

  it('stop 后关闭底层 watch 且重复 stop 幂等', async () => {
    const stopped = vi.fn()
    const watch = vi.fn((_root: string, _cb: (paths: string[]) => void) => stopped)
    const watcher = createWorkspaceFileWatcher({ watch, debounceMs: 250 })
    watcher.start('D:/notes', vi.fn())
    expect(watch).toHaveBeenCalledOnce()
    watcher.stop()
    expect(stopped).toHaveBeenCalledOnce()
    // 重复 stop 幂等
    watcher.stop()
    expect(stopped).toHaveBeenCalledOnce()
  })

  it('切换工作区时先停掉旧 watch 再监听新根', () => {
    const stops: ReturnType<typeof vi.fn>[] = []
    const watch = vi.fn(() => {
      const stop = vi.fn()
      stops.push(stop)
      return stop
    })
    const watcher = createWorkspaceFileWatcher({ watch, debounceMs: 250 })
    watcher.start('D:/notes/one', vi.fn())
    watcher.start('D:/notes/two', vi.fn())
    expect(stops[0]).toHaveBeenCalledOnce()
    expect(watch).toHaveBeenLastCalledWith('D:/notes/two', expect.any(Function))
  })
})
