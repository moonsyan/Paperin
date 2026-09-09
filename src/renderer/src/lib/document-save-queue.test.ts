import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DocumentSaveQueue, NonRetryableSaveError } from './document-save-queue'

interface Snapshot {
  content: string
}

describe('文档自动保存队列', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('同一文件只保存防抖窗口内的最新快照', async () => {
    const saved: Array<{ id: string; content: string }> = []
    const queue = new DocumentSaveQueue<Snapshot>(async (id, snapshot) => {
      saved.push({ id, content: snapshot.content })
    }, 1_000)

    queue.schedule('a', { content: '1' })
    queue.schedule('a', { content: '2' })
    await vi.advanceTimersByTimeAsync(999)
    expect(saved).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(saved).toEqual([{ id: 'a', content: '2' }])
  })

  it('flush 立即保存最新内容并等待完成', async () => {
    const saved: string[] = []
    const queue = new DocumentSaveQueue<Snapshot>(async (_id, snapshot) => {
      saved.push(snapshot.content)
    }, 1_000)

    queue.schedule('a', { content: 'latest' })
    await queue.flush('a')

    expect(saved).toEqual(['latest'])
  })

  it('在途保存后继续写入期间到达的最新快照', async () => {
    const saved: string[] = []
    let releaseFirst: () => void = () => undefined
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const queue = new DocumentSaveQueue<Snapshot>(async (_id, snapshot) => {
      saved.push(snapshot.content)
      if (snapshot.content === 'first') await firstBlocked
    }, 1_000)

    queue.schedule('a', { content: 'first' })
    await vi.advanceTimersByTimeAsync(1_000)
    queue.schedule('a', { content: 'second' })
    releaseFirst()
    await queue.flush('a')

    expect(saved).toEqual(['first', 'second'])
  })

  it('保存失败时 flush 向调用方传播错误并保留待保存快照', async () => {
    let shouldFail = true
    const saved: string[] = []
    const queue = new DocumentSaveQueue<Snapshot>(async (_id, snapshot) => {
      if (shouldFail) throw new Error('disk failed')
      saved.push(snapshot.content)
    }, 1_000)

    queue.schedule('a', { content: 'retry-me' })
    await expect(queue.flush('a')).rejects.toThrow('disk failed')
    shouldFail = false
    await queue.flush('a')

    expect(saved).toEqual(['retry-me'])
  })

  it('取消在途保存后 flushAll 忽略该任务的失败并允许后续重新排程', async () => {
    let rejectRunning: (error: Error) => void = () => undefined
    const running = new Promise<void>((_resolve, reject) => {
      rejectRunning = reject
    })
    const saved: string[] = []
    const queue = new DocumentSaveQueue<Snapshot>(async (_id, snapshot) => {
      if (snapshot.content === 'cancel-me') await running
      saved.push(snapshot.content)
    }, 1_000)

    queue.schedule('a', { content: 'cancel-me' })
    const firstFlush = queue.flush('a')
    queue.cancel('a')
    const allFlush = queue.flushAll()
    rejectRunning(new Error('disk failed'))

    await expect(firstFlush).rejects.toThrow('disk failed')
    await expect(allFlush).resolves.toBeUndefined()

    queue.schedule('a', { content: 'fresh' })
    await queue.flush('a')
    expect(saved).toEqual(['fresh'])
  })

  it('取消等待旧任务期间重新排程时保留新快照', async () => {
    let rejectRunning: (error: Error) => void = () => undefined
    const running = new Promise<void>((_resolve, reject) => {
      rejectRunning = reject
    })
    const saved: string[] = []
    const queue = new DocumentSaveQueue<Snapshot>(async (_id, snapshot) => {
      if (snapshot.content === 'old') await running
      saved.push(snapshot.content)
    }, 1_000)

    queue.schedule('a', { content: 'old' })
    const firstFlush = queue.flush('a')
    queue.cancel('a')
    const canceledFlush = queue.flushAll()
    queue.schedule('a', { content: 'fresh' })
    rejectRunning(new Error('old failed'))

    await expect(firstFlush).rejects.toThrow('old failed')
    await expect(canceledFlush).resolves.toBeUndefined()
    await queue.flush('a')

    expect(saved).toEqual(['fresh'])
  })

  it('取消在途保存时在旧写入完成后补写当前快照', async () => {
    let releaseRunning: () => void = () => undefined
    const running = new Promise<void>((resolve) => {
      releaseRunning = resolve
    })
    const saved: string[] = []
    const queue = new DocumentSaveQueue<Snapshot>(async (_id, snapshot) => {
      saved.push(snapshot.content)
      if (snapshot.content === 'dirty') await running
    }, 1_000)

    queue.schedule('a', { content: 'dirty' })
    const flush = queue.flush('a')
    queue.cancel('a', { content: 'original' })
    releaseRunning()
    await flush

    expect(saved).toEqual(['dirty', 'original'])
  })

  it('不可重试错误不回填快照也不安排退避重试', async () => {
    let attempts = 0
    const queue = new DocumentSaveQueue<Snapshot>(async () => {
      attempts++
      throw new NonRetryableSaveError('ENCODING_LOSS')
    }, 1_000)

    queue.schedule('a', { content: 'emoji' })
    await expect(queue.flush('a')).rejects.toThrow('ENCODING_LOSS')
    // 推进足够长的时间：若错误地进入重试循环，attempts 会不断增加
    await vi.advanceTimersByTimeAsync(120_000)
    expect(attempts).toBe(1)
    // 失败快照未回填，flushAll 无事可做且不再触发保存
    await queue.flushAll()
    expect(attempts).toBe(1)
    // 用户手动处理（如切换编码）后重新排程可正常恢复
    expect(attempts).toBe(1)
  })

  it('flushAll 单个 id 失败不阻断其余 id 的落盘', async () => {
    const saved: string[] = []
    const queue = new DocumentSaveQueue<Snapshot>(async (_id, snapshot) => {
      if (snapshot.content === 'bad') throw new Error('disk failed')
      saved.push(snapshot.content)
    }, 1_000)

    queue.schedule('a', { content: 'bad' })
    queue.schedule('b', { content: 'good' })
    await expect(queue.flushAll()).rejects.toThrow('disk failed')

    // a 失败但 b 已完成落盘，不再被 a 的 rejection 跳过
    expect(saved).toEqual(['good'])
  })
})
