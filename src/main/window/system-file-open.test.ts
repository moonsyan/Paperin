import { describe, expect, it } from 'vitest'
import {
  collectSystemOpenFiles,
  chooseSystemOpenDisposition,
  normalizeSystemOpenFile,
} from './system-file-open'

describe('system file open rules', () => {
  it('accepts only absolute Markdown paths from startup/second-instance argv', () => {
    expect(collectSystemOpenFiles([
      'C:\\Program Files\\Paperin\\Paperin.exe',
      '--flag',
      'D:\\notes\\中文.md',
      'D:\\notes\\ignored.txt',
      'relative.md',
      'D:\\notes\\README.markdown',
    ], 'win32')).toEqual([
      'D:\\notes\\中文.md',
      'D:\\notes\\README.markdown',
    ])
  })

  it('deduplicates Windows paths case-insensitively and keeps POSIX casing', () => {
    expect(collectSystemOpenFiles([
      'D:\\Notes\\Readme.md',
      'd:\\notes\\README.MD',
    ], 'win32')).toEqual(['D:\\Notes\\Readme.md'])

    expect(collectSystemOpenFiles(['/notes/A.md', '/notes/a.md'], 'linux')).toEqual([
      '/notes/A.md',
      '/notes/a.md',
    ])
  })

  it('normalizes quoted association arguments and rejects unsupported paths', () => {
    expect(normalizeSystemOpenFile('"D:\\notes\\a.md"', 'win32')).toBe('D:\\notes\\a.md')
    expect(normalizeSystemOpenFile('D:\\notes\\a.md:evil', 'win32')).toBeNull()
    expect(normalizeSystemOpenFile('https://example.test/a.md', 'win32')).toBeNull()
    expect(normalizeSystemOpenFile('/notes/a.mdown', 'linux')).toBeNull()
  })

  it('reuses the current window by default and isolates file opens in multi-window mode', () => {
    expect(chooseSystemOpenDisposition(false, true)).toBe('reuse-window')
    expect(chooseSystemOpenDisposition(false, false)).toBe('restore-window')
    expect(chooseSystemOpenDisposition(true, false)).toBe('fresh-window')
    expect(chooseSystemOpenDisposition(true, true)).toBe('fresh-window')
  })
})
