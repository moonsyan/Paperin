import { BrowserWindow, dialog, ipcMain } from 'electron'
import { writeFile } from 'fs/promises'
import { deflateRawSync } from 'zlib'
import { CHANNELS } from '../../shared/ipc/channels'
import { writeIfDialogTargetStillAuthorized } from '../trusted-paths'

/* ==================== 零依赖 DOCX 导出：OOXML ZIP 打包与写盘 ====================
 *
 * 渲染进程生成全部 XML 部件与图片二进制（见 renderer/lib/docx.ts），
 * 本模块只负责校验、打包为标准 ZIP（deflate + 自带 CRC32）并经保存对话框写盘。
 */

const MAX_DOCX_PARTS = 320
const MAX_DOCX_TOTAL_BYTES = 100 * 1024 * 1024
const DOCX_PART_NAME_RE = /^(word\/media\/image\d+\.(png|jpe?g|gif|bmp|webp)|\[Content_Types\]\.xml|_rels\/\.rels|word\/document\.xml|word\/_rels\/document\.xml\.rels|word\/styles\.xml|docProps\/core\.xml|docProps\/app\.xml)$/

/** CRC32（IEEE 802.3 多项式），打包 ZIP 中央目录与本地文件头校验用 */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    // & 0xff 必须有：crc 高位参与索引会越界读出 undefined
    crc = CRC_TABLE[(crc ^ buf[i])! & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

interface ZipEntryInput {
  name: string
  /** 文本部件（UTF-8 编码后写入）或二进制内容 */
  data: Uint8Array
}

/** 构建最小标准 ZIP（ deflate 压缩；目录项不需要，全部为文件项） */
export function buildZip(entries: ZipEntryInput[]): Buffer {
  const encoder = new TextEncoder()
  const chunks: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name)
    const compressed = deflateRawSync(Buffer.from(entry.data), { level: 6 })
    // 压缩后更大（已压缩图片等）时改用 store
    const useDeflate = compressed.length < entry.data.length
    const payload = useDeflate ? compressed : Buffer.from(entry.data)
    const method = useDeflate ? 8 : 0
    const checksum = crc32(entry.data)

    const local = Buffer.alloc(30 + nameBytes.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0x0800, 6) // UTF-8 文件名标志
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(0, 10) // time
    local.writeUInt16LE(0x21, 12) // date（固定占位，Word 不依赖）
    local.writeUInt32LE(checksum, 14)
    local.writeUInt32LE(payload.length, 18)
    local.writeUInt32LE(entry.data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    local.writeUInt16LE(0, 28)
    Buffer.from(nameBytes).copy(local, 30)

    const centralEntry = Buffer.alloc(46 + nameBytes.length)
    centralEntry.writeUInt32LE(0x02014b50, 0)
    centralEntry.writeUInt16LE(20, 4)
    centralEntry.writeUInt16LE(20, 6)
    centralEntry.writeUInt16LE(0x0800, 8)
    centralEntry.writeUInt16LE(method, 10)
    centralEntry.writeUInt16LE(0, 12)
    centralEntry.writeUInt16LE(0x21, 14)
    centralEntry.writeUInt32LE(checksum, 16)
    centralEntry.writeUInt32LE(payload.length, 20)
    centralEntry.writeUInt32LE(entry.data.length, 24)
    centralEntry.writeUInt16LE(nameBytes.length, 28)
    centralEntry.writeUInt16LE(0, 30)
    centralEntry.writeUInt16LE(0, 32)
    centralEntry.writeUInt16LE(0, 34)
    centralEntry.writeUInt16LE(0, 36)
    centralEntry.writeUInt32LE(0, 38)
    centralEntry.writeUInt32LE(offset, 42)
    Buffer.from(nameBytes).copy(centralEntry, 46)

    chunks.push(local, payload)
    central.push(centralEntry)
    offset += local.length + payload.length
  }

  const centralBuffer = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBuffer.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)
  return Buffer.concat([...chunks, centralBuffer, end])
}

export interface DocxExportArgs {
  /** 文本部件：zip 路径 → XML 内容 */
  parts?: Record<string, unknown>
  /** 图片二进制：{ name: 'word/media/image1.png', data: Uint8Array/number[] } */
  media?: { name?: unknown; data?: unknown }[]
  defaultName?: unknown
  title?: unknown
}

const ALLOWED_PART_KEYS = [
  '[Content_Types].xml',
  '_rels/.rels',
  'word/document.xml',
  'word/_rels/document.xml.rels',
  'word/styles.xml',
  'docProps/core.xml',
  'docProps/app.xml',
]

export const registerDocxExportHandler = (): void => {
  ipcMain.handle(
    CHANNELS.FILE_EXPORT_DOCX,
    async (event, args: DocxExportArgs) => {
      try {
        const window = BrowserWindow.fromWebContents(event.sender)
        if (!window) return { ok: false, error: { code: 'WINDOW_NOT_FOUND' } }
        if (!args || typeof args !== 'object') {
          return { ok: false, error: { code: 'INVALID_ARGUMENT' } }
        }
        if (!args.parts || typeof args.parts !== 'object') {
          return { ok: false, error: { code: 'INVALID_ARGUMENT' } }
        }

        const encoder = new TextEncoder()
        const entries: ZipEntryInput[] = []
        let totalBytes = 0

        for (const key of Object.keys(args.parts)) {
          if (!ALLOWED_PART_KEYS.includes(key)) {
            return { ok: false, error: { code: 'INVALID_PART', message: `不允许的部件：${key}` } }
          }
          const value = args.parts[key]
          if (typeof value !== 'string') {
            return { ok: false, error: { code: 'INVALID_ARGUMENT' } }
          }
          const data = encoder.encode(value)
          totalBytes += data.length
          entries.push({ name: key, data })
        }
        if (!entries.some((entry) => entry.name === 'word/document.xml')) {
          return { ok: false, error: { code: 'INVALID_ARGUMENT', message: '缺少 document.xml' } }
        }

        const media = Array.isArray(args.media) ? args.media : []
        if (media.length > MAX_DOCX_PARTS) {
          return { ok: false, error: { code: 'TOO_LARGE', message: '图片数量超出上限' } }
        }
        for (const item of media) {
          if (!item || typeof item.name !== 'string' || !DOCX_PART_NAME_RE.test(item.name)) {
            return { ok: false, error: { code: 'INVALID_PART' } }
          }
          let data: Uint8Array | null = null
          if (item.data instanceof Uint8Array) data = item.data
          else if (Array.isArray(item.data) && item.data.every((v) => typeof v === 'number')) {
            data = Uint8Array.from(item.data as number[])
          }
          if (!data || data.length === 0) {
            return { ok: false, error: { code: 'INVALID_PART' } }
          }
          totalBytes += data.length
          entries.push({ name: item.name, data })
        }
        if (totalBytes > MAX_DOCX_TOTAL_BYTES) {
          return { ok: false, error: { code: 'TOO_LARGE', message: '导出内容超过 100MB 上限' } }
        }

        const defaultName = typeof args.defaultName === 'string' ? args.defaultName : '文档.docx'
        const safeDefault = defaultName.replace(/[\\/:*?"<>|]/g, '_').replace(/\.docx$/i, '')
        const result = await dialog.showSaveDialog(window, {
          title: '导出 Word 文档',
          defaultPath: `${safeDefault || '文档'}.docx`,
          filters: [{ name: 'Word', extensions: ['docx'] }],
        })
        if (result.canceled || !result.filePath) {
          return { ok: false, error: { code: 'CANCELLED' } }
        }

        const zip = buildZip(entries)
        const written = await writeIfDialogTargetStillAuthorized(result.filePath, async (target) => {
          await writeFile(target, zip)
        })
        if (written === 'invalid-path') {
          return { ok: false, error: { code: 'INVALID_PATH' } }
        }
        return { ok: true, data: { path: result.filePath } }
      } catch (error) {
        return { ok: false, error: { code: 'IO_ERROR', message: String(error) } }
      }
    },
  )
}
