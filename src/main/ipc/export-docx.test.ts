import { describe, expect, it } from 'vitest'
import { inflateRawSync } from 'zlib'
import { buildZip, crc32 } from './export-docx'

describe('crc32', () => {
  it('标准测试向量 "123456789" → 0xCBF43926', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  it('空输入返回 0', () => {
    expect(crc32(new Uint8Array(0))).toBe(0)
  })
})

describe('buildZip', () => {
  const extractEntry = (zip: Buffer, name: string): Buffer | null => {
    const nameBytes = Buffer.from(name)
    // 遍历本地文件头
    let offset = 0
    while (offset + 30 <= zip.length) {
      if (zip.readUInt32LE(offset) !== 0x04034b50) return null
      const method = zip.readUInt16LE(offset + 8)
      const checksum = zip.readUInt32LE(offset + 14)
      const compressedSize = zip.readUInt32LE(offset + 18)
      const nameLen = zip.readUInt16LE(offset + 26)
      const extraLen = zip.readUInt16LE(offset + 28)
      const entryName = zip.subarray(offset + 30, offset + 30 + nameLen)
      const payload = zip.subarray(
        offset + 30 + nameLen + extraLen,
        offset + 30 + nameLen + extraLen + compressedSize,
      )
      if (entryName.equals(nameBytes)) {
        const raw = method === 8 ? inflateRawSync(payload) : Buffer.from(payload)
        if (crc32(new Uint8Array(raw)) !== checksum) throw new Error('CRC 校验失败')
        return raw
      }
      offset += 30 + nameLen + extraLen + compressedSize
    }
    return null
  }

  it('文本部件可解压还原且 CRC 一致', () => {
    const zip = buildZip([
      { name: '[Content_Types].xml', data: new TextEncoder().encode('<?xml version="1.0"?><Types/>') },
      { name: 'word/document.xml', data: new TextEncoder().encode('<w:document>中文内容</w:document>') },
    ])
    expect(zip.readUInt32LE(0)).toBe(0x04034b50)
    const doc = extractEntry(zip, 'word/document.xml')
    expect(doc?.toString('utf-8')).toBe('<w:document>中文内容</w:document>')
    const types = extractEntry(zip, '[Content_Types].xml')
    expect(types?.toString('utf-8')).toContain('<Types/>')
  })

  it('二进制（不可压缩）数据回退 store 且可还原', () => {
    const random = new Uint8Array(2048)
    for (let i = 0; i < random.length; i++) random[i] = i * 37 + 11
    const zip = buildZip([{ name: 'word/media/image1.png', data: random }])
    const out = extractEntry(zip, 'word/media/image1.png')
    expect(out && Buffer.from(out).equals(Buffer.from(random))).toBe(true)
  })

  it('EOCD 记录正确的条目数', () => {
    const zip = buildZip([
      { name: 'a.xml', data: new TextEncoder().encode('1') },
      { name: 'b.xml', data: new TextEncoder().encode('2') },
      { name: 'c.xml', data: new TextEncoder().encode('3') },
    ])
    const eocdOffset = zip.length - 22
    expect(zip.readUInt32LE(eocdOffset)).toBe(0x06054b50)
    expect(zip.readUInt16LE(eocdOffset + 8)).toBe(3)
    expect(zip.readUInt16LE(eocdOffset + 10)).toBe(3)
  })
})
