import { describe, expect, it, beforeEach } from 'vitest'
import {
  getSupportEventCounts,
  noteSupportEvent,
  resetSupportEventCountsForTests,
} from './support-event-counts'
import { MAX_SUPPORT_SUMMARY_EVENTS } from '../../shared/support-summary'

describe('supportEventCounts', () => {
  beforeEach(() => {
    resetSupportEventCountsForTests()
  })

  it('只累计白名单事件名', () => {
    noteSupportEvent('workspace_open')
    noteSupportEvent('workspace_open')
    noteSupportEvent('save_failed')
    ;(noteSupportEvent as (name: string) => void)('not_a_real_event')
    expect(getSupportEventCounts()).toEqual({
      workspace_open: 2,
      save_failed: 1,
    })
  })

  it('导出副本与内部计数隔离', () => {
    noteSupportEvent('search_cancelled')
    const snapshot = { ...getSupportEventCounts(), search_cancelled: 99 }
    expect(snapshot.search_cancelled).toBe(99)
    expect(getSupportEventCounts()).toEqual({ search_cancelled: 1 })
    expect(Object.keys(getSupportEventCounts()).length).toBeLessThanOrEqual(MAX_SUPPORT_SUMMARY_EVENTS)
  })
})
