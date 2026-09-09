import { describe, expect, it, vi } from 'vitest'

// session-trust 在模块顶部导入 electron（app / net），一致性测试只需导入
// 上限常量，不触发真实窗口能力，用最小桩替代。
vi.mock('electron', () => ({
  app: { getPath: () => 'C:\\mock\\userData' },
  net: {},
}))

const MAX_TRUSTED_ROOTS = 64

/** 每个用例独立模块实例：信任根是模块级可变状态，混跑会相互污染 */
const loadModule = async () => {
  vi.resetModules()
  return await import('./trusted-paths')
}

describe('信任根容量与保底淘汰', () => {
  it('非保底根打满时淘汰最早的非保底根', async () => {
    const { trustDirectory, isPathTrusted } = await loadModule()
    for (let i = 0; i < MAX_TRUSTED_ROOTS; i++) {
      trustDirectory(`C:\\volatile-${i}`)
    }
    // 第 65 个：淘汰最旧的 volatile-0
    trustDirectory('C:\\volatile-new')
    expect(isPathTrusted('C:\\volatile-0')).toBe(false)
    expect(isPathTrusted('C:\\volatile-new')).toBe(true)
    expect(isPathTrusted('C:\\volatile-63')).toBe(true)
  })

  it('全部为可淘汰保底根（工作区）时淘汰最旧工作区，新工作区可登记', async () => {
    const { trustDirectory, isPathTrusted } = await loadModule()
    for (let i = 0; i < MAX_TRUSTED_ROOTS; i++) {
      trustDirectory(`C:\\ws-${i}`, { essential: true })
    }
    trustDirectory('C:\\ws-new', { essential: true })
    expect(isPathTrusted('C:\\ws-new')).toBe(true)
    expect(isPathTrusted('C:\\ws-0')).toBe(false)
    // 最旧的工作区根被淘汰后随用户重开重新登记（自愈路径）
    trustDirectory('C:\\ws-0', { essential: true })
    expect(isPathTrusted('C:\\ws-0')).toBe(true)
  })

  it('保护根（evictable=false）不参与保底淘汰', async () => {
    const { trustDirectory, isPathTrusted } = await loadModule()
    trustDirectory('C:\\app-images', { essential: true, evictable: false })
    for (let i = 0; i < MAX_TRUSTED_ROOTS; i++) {
      trustDirectory(`C:\\ws-${i}`, { essential: true })
    }
    // 打满后再登记 → 淘汰最旧工作区，保护根保留
    trustDirectory('C:\\ws-new', { essential: true })
    expect(isPathTrusted('C:\\app-images')).toBe(true)
    expect(isPathTrusted('C:\\ws-new')).toBe(true)
    expect(isPathTrusted('C:\\ws-0')).toBe(false)
  })

  it('全部为不可淘汰根时停止登记（受控兜底，不再无界增长）', async () => {
    const { trustDirectory, isPathTrusted } = await loadModule()
    for (let i = 0; i < MAX_TRUSTED_ROOTS; i++) {
      trustDirectory(`C:\\pinned-${i}`, { essential: true, evictable: false })
    }
    trustDirectory('C:\\should-not-register', { essential: true })
    expect(isPathTrusted('C:\\should-not-register')).toBe(false)
    // 已登记的保护根不受影响
    expect(isPathTrusted('C:\\pinned-0')).toBe(true)
  })
})

describe('信任上限单一来源一致性', () => {
  it('运行时上限从 owning 模块导出，持久化上限 ≤ 运行时上限且文件/图片目录对齐', async () => {
    const paths = await import('./trusted-paths')
    const image = await import('./image-protocol')
    vi.resetModules()
    const session = await import('./session-trust')

    // 运行时上限必须导出（单一来源），文档以此为准
    expect(typeof paths.MAX_TRUSTED_ROOTS).toBe('number')
    expect(typeof paths.MAX_TRUSTED_FILES).toBe('number')
    expect(typeof image.MAX_IMAGE_READ_DIRS).toBe('number')

    // session-trust 的持久化上限必须引用运行时常量，不得各自硬编码
    expect(typeof session.MAX_PERSISTED_WORKSPACES).toBe('number')
    expect(session.MAX_PERSISTED_FILES).toBe(paths.MAX_TRUSTED_FILES)
    expect(session.MAX_PERSISTED_IMAGE_DIRS).toBe(image.MAX_IMAGE_READ_DIRS)

    // 约束：持久化上限不得大于运行时上限——否则恢复时超出的部分
    // 被运行时淘汰逻辑立即驱逐，用户已授权的信任在重启后悄悄丢失
    expect(session.MAX_PERSISTED_WORKSPACES).toBeLessThanOrEqual(paths.MAX_TRUSTED_ROOTS)
    expect(session.MAX_PERSISTED_FILES).toBeLessThanOrEqual(paths.MAX_TRUSTED_FILES)
    expect(session.MAX_PERSISTED_IMAGE_DIRS).toBeLessThanOrEqual(image.MAX_IMAGE_READ_DIRS)

    // 测试自身的容量填充用例也改用导出常量，避免第二处硬编码漂移
    expect(paths.MAX_TRUSTED_ROOTS).toBe(MAX_TRUSTED_ROOTS)
  })
})
