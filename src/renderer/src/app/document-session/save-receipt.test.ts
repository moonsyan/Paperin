import { describe, expect, it } from 'vitest'
import { resolveSaveReceipt } from './save-receipt'

describe('resolveSaveReceipt', () => {
  it('回执与当前快照一致且没有未落账输入时标记已保存', () => {
    expect(resolveSaveReceipt('正文', '正文', false)).toEqual({ content: '正文', saved: true })
  })

  it('等待期间的新快照不能被旧回执覆盖或标成已保存', () => {
    expect(resolveSaveReceipt('旧快照', '旧快照<新输入>', false)).toEqual({
      content: '旧快照<新输入>',
      saved: false,
    })
  })

  it('缓存恰好等于旧快照但编辑器仍有未落账输入时保持 dirty', () => {
    expect(resolveSaveReceipt('旧快照', '旧快照', true)).toEqual({ content: '旧快照', saved: false })
  })
})
