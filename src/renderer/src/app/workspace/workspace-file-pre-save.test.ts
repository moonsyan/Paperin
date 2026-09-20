import { describe, expect, it, vi } from 'vitest'
import {
  flushActiveDocumentIf,
  mtimeOfFile,
  needsDocumentSave,
} from './workspace-file-pre-save'

describe('workspace-file-pre-save', () => {
  it('mtimeOfFile 只读 ref，不读 React state', () => {
    const fileMtimeRef = { current: { 'file-/a.md': 100 } as Record<string, number> }
    expect(mtimeOfFile('file-/a.md', fileMtimeRef)).toBe(100)
    fileMtimeRef.current['file-/a.md'] = 200
    expect(mtimeOfFile('file-/a.md', fileMtimeRef)).toBe(200)
    expect(mtimeOfFile('file-/missing.md', fileMtimeRef)).toBeUndefined()
  })

  it('needsDocumentSave 按 ref 基线与 liveContentOf 判定脏状态', () => {
    const initialOrSavedRef = { current: { 'file-/a.md': 'saved' } }
    const liveContentOf = vi.fn((id: string) => (id === 'file-/a.md' ? 'edited' : ''))
    expect(needsDocumentSave('file-/a.md', liveContentOf, initialOrSavedRef)).toBe(true)
    initialOrSavedRef.current['file-/a.md'] = 'edited'
    expect(needsDocumentSave('file-/a.md', liveContentOf, initialOrSavedRef)).toBe(false)
  })

  it('flushActiveDocumentIf 非活动文件直接放行', async () => {
    const activeFileIdRef = { current: 'file-/other.md' }
    const leave = vi.fn(async () => false)
    const flush = vi.fn()
    await expect(
      flushActiveDocumentIf('file-/a.md', activeFileIdRef, leave, flush),
    ).resolves.toBe(true)
    expect(leave).not.toHaveBeenCalled()
    expect(flush).not.toHaveBeenCalled()
  })

  it('flushActiveDocumentIf 活动文件 leave 失败则中止', async () => {
    const activeFileIdRef = { current: 'file-/a.md' }
    const leave = vi.fn(async () => false)
    const flush = vi.fn()
    await expect(
      flushActiveDocumentIf('file-/a.md', activeFileIdRef, leave, flush),
    ).resolves.toBe(false)
    expect(flush).not.toHaveBeenCalled()
  })

  it('flushActiveDocumentIf 活动文件成功则 flush', async () => {
    const activeFileIdRef = { current: 'file-/a.md' }
    const leave = vi.fn(async () => true)
    const flush = vi.fn()
    await expect(
      flushActiveDocumentIf('file-/a.md', activeFileIdRef, leave, flush),
    ).resolves.toBe(true)
    expect(flush).toHaveBeenCalledOnce()
  })
})
