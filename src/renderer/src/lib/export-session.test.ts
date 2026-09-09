import { describe, expect, it } from 'vitest'
import { createExportSession } from './export-session'

describe('导出会话', () => {
  it('导出进行中拒绝第二个任务并在结束后允许重试', () => {
    const session = createExportSession()

    expect(session.begin()).toBe(true)
    expect(session.isActive()).toBe(true)
    expect(session.begin()).toBe(false)

    session.finish()

    expect(session.isActive()).toBe(false)
    expect(session.begin()).toBe(true)
  })
})
