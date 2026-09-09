import { describe, expect, it } from 'vitest'
import {
  MAX_SNAPSHOTS_PER_FILE,
  MAX_SNAPSHOTS_TOTAL_BYTES,
  parseSnapshotTime,
  planPrune,
  snapshotDirName,
} from './version-store'

const meta = (t: number, size: number) => ({ t, size })

describe('parseSnapshotTime', () => {
  it('解析纯数字毫秒命名，拒绝其他命名与路径逃逸', () => {
    expect(parseSnapshotTime('1735689600000.md')).toBe(1735689600000)
    expect(parseSnapshotTime('..\\evil.md')).toBeNull()
    expect(parseSnapshotTime('notes.txt')).toBeNull()
    expect(parseSnapshotTime('123.md')).toBeNull()
  })
})

describe('snapshotDirName', () => {
  it('win32 下大小写不同的同一路径得到同一目录', () => {
    if (process.platform !== 'win32') return
    expect(snapshotDirName('D:\\Wk\\A.md')).toBe(snapshotDirName('d:\\wk\\a.md'))
  })
})

describe('planPrune', () => {
  it('超过条数上限淘汰最旧', () => {
    const metas = Array.from({ length: MAX_SNAPSHOTS_PER_FILE + 3 }, (_, i) =>
      meta(1_000_000 + i, 100),
    ).reverse()
    const { keep, remove } = planPrune(metas)
    expect(keep).toHaveLength(MAX_SNAPSHOTS_PER_FILE)
    expect(remove).toHaveLength(3)
    // 保留的是最新的
    expect(keep[0].t).toBe(1_000_000 + MAX_SNAPSHOTS_PER_FILE + 2)
  })

  it('累计字节超限时淘汰最旧，直到回到上限内', () => {
    const big = MAX_SNAPSHOTS_TOTAL_BYTES / 2
    const metas = [meta(3, big), meta(2, big), meta(1, 10)]
    // 两份半额快照恰好等于上限（<= 判定），第三份超限被淘汰
    const { keep, remove } = planPrune(metas)
    expect(keep.map((m) => m.t)).toEqual([3, 2])
    expect(remove.map((m) => m.t)).toEqual([1])
  })

  it('单条超限的快照不进入保留集也不阻塞后续小快照', () => {
    const huge = MAX_SNAPSHOTS_TOTAL_BYTES + 1
    const metas = [meta(4, 50), meta(3, huge), meta(2, 60)]
    const { keep, remove } = planPrune(metas)
    // 超限单条被淘汰后，后续小快照仍按剩余预算保留
    expect(keep.map((m) => m.t)).toEqual([4, 2])
    expect(remove.map((m) => m.t)).toEqual([3])
  })
})
