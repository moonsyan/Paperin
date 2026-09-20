import { describe, expect, it } from 'vitest'
import { createHash } from 'crypto'
import { inspectDocumentVersionConflict } from './document-version-check'

const sha256Hex = (bytes: string): string =>
  createHash('sha256').update(bytes).digest('hex')

describe('inspectDocumentVersionConflict', () => {
  it('A02：旧 expectedMtime=1000 相对磁盘/全局 1200 不得因 ≤500ms 放行', () => {
    const diskHash = sha256Hex('new')
    expect(inspectDocumentVersionConflict({
      current: { mtimeMs: 1200, size: 3 },
      expectedMtime: 1000,
      expectedContentHash: sha256Hex('old'),
      currentSha256: diskHash,
    })).toEqual({ conflict: true, needsContentHash: false })
  })

  it('请求旧 hash 与磁盘新 hash 必须冲突（不以进程全局基线代替请求基线）', () => {
    const oldHash = sha256Hex('窗口B读取时')
    const newHash = sha256Hex('窗口A已写入')
    expect(inspectDocumentVersionConflict({
      current: { mtimeMs: 1000, size: 12 },
      expectedMtime: 1000,
      expectedContentHash: oldHash,
      currentSha256: newHash,
      // 进程级 known 已是 A 写入后的新内容——绝不能用它覆盖请求旧 hash
      known: { mtimeMs: 1000, size: 12, contentSha256: newHash },
    })).toEqual({ conflict: true, needsContentHash: false })
  })

  it('请求 hash 与磁盘一致时不冲突，即使 mtime 有小幅漂移', () => {
    const digest = sha256Hex('同一正文')
    expect(inspectDocumentVersionConflict({
      current: { mtimeMs: 1500, size: 12 },
      expectedMtime: 1000,
      expectedContentHash: digest,
      currentSha256: digest,
    })).toEqual({ conflict: false, needsContentHash: false })
  })

  it('有 expectedContentHash 但尚未计算磁盘 hash 时要求读字节', () => {
    expect(inspectDocumentVersionConflict({
      current: { mtimeMs: 1000, size: 12 },
      expectedMtime: 1000,
      expectedContentHash: sha256Hex('正文'),
    })).toEqual({ conflict: false, needsContentHash: true })
  })

  it('旧会话无 hash 时不以全局 known hash 代替，mtime 已变则冲突', () => {
    const knownHash = sha256Hex('全局最新')
    expect(inspectDocumentVersionConflict({
      current: { mtimeMs: 1200, size: 3 },
      expectedMtime: 1000,
      expectedContentHash: null,
      known: { mtimeMs: 1200, size: 3, contentSha256: knownHash },
      currentSha256: knownHash,
    })).toEqual({ conflict: true, needsContentHash: false })
  })

  it('旧会话无 hash 且 mtime 完全一致时仍需重新核对，不静默放行', () => {
    expect(inspectDocumentVersionConflict({
      current: { mtimeMs: 1000, size: 12 },
      expectedMtime: 1000,
      expectedContentHash: null,
      known: { mtimeMs: 1000, size: 12, contentSha256: sha256Hex('全局') },
    })).toEqual({ conflict: true, needsContentHash: false })
  })
})
