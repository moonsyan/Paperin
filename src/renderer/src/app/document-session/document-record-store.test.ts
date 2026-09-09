import { describe, expect, it } from 'vitest'
import type { OpenFile } from '../../components/Sidebar'
import {
  applyContentMap,
  applyEncodingMap,
  applyModifiedTimeMap,
  applySavedMap,
  createDocumentRecordStore,
  projectDocumentMaps,
  selectOpenDocumentRecords,
} from './document-record-store'

const FILE: OpenFile = { id: 'file-a', name: 'a.md', path: 'D:/notes/a.md' }

describe('DocumentRecord store', () => {
  it('keeps content, save baseline, dirty, mtime and encoding in one record', () => {
    let records = createDocumentRecordStore(
      { 'file-a': '磁盘版本' },
      { 'file-a': true },
      { 'file-a': 10 },
      { 'file-a': 'GBK' },
      [FILE],
      { 'file-a': '磁盘版本' },
    )

    records = applyContentMap(
      records,
      { 'file-a': '编辑版本' },
      [FILE],
      { 'file-a': '磁盘版本' },
    )
    records = applySavedMap(
      records,
      { 'file-a': false },
      [FILE],
      { 'file-a': '已落盘快照' },
    )
    records = applyModifiedTimeMap(records, { 'file-a': 20 }, [FILE], {})
    records = applyEncodingMap(records, { 'file-a': 'UTF-8' }, [FILE], {})

    expect(records['file-a']).toMatchObject({
      content: '编辑版本',
      savedContent: '已落盘快照',
      dirty: true,
      modifiedTime: 20,
      encoding: 'UTF-8',
    })
    expect(projectDocumentMaps(records)).toEqual({
      contents: { 'file-a': '编辑版本' },
      savedMap: { 'file-a': false },
      fileMtime: { 'file-a': 20 },
      encodingMap: { 'file-a': 'UTF-8' },
    })
  })

  it('prunes closed records through the authoritative content map', () => {
    const records = createDocumentRecordStore(
      { 'file-a': 'A', 'file-b': 'B' },
      { 'file-a': true, 'file-b': false },
      {},
      {},
      [FILE],
      {},
    )
    const next = applyContentMap(records, { 'file-a': 'A' }, [FILE], {})
    expect(next['file-b']).toBeUndefined()
  })

  it('projects only open documents while preserving tab metadata', () => {
    const records = createDocumentRecordStore(
      { 'file-a': 'A', closed: 'C' },
      { 'file-a': true, closed: true },
      {},
      {},
      [FILE],
      {},
    )
    const selected = selectOpenDocumentRecords(records, [{ ...FILE, preview: true }], {})
    expect(Object.keys(selected)).toEqual(['file-a'])
    expect(selected['file-a']).toMatchObject({
      name: 'a.md',
      path: 'D:/notes/a.md',
      preview: true,
    })
  })
})
