/** 与 file-io.ts 读取侧检测出的编码集合一致；其它值会静默按 UTF-8 写出，必须在入口拒绝 */
export type DocumentSaveEncoding = 'UTF-8' | 'UTF-8-BOM' | 'UTF-16LE' | 'UTF-16BE' | 'GBK'

export interface DocumentSaveArgs {
  path: string
  content: string
  expectedMtime?: number
  encoding?: DocumentSaveEncoding
  /** 用户已确认覆盖外部修改时跳过 mtime/size 冲突检测，随后仍会更新基线 */
  forceOverwrite?: boolean
}

export type DocumentSaveResult =
  | { ok: true; data: { modifiedTime: number } }
  | { ok: false; error: { code: string; message?: string } }
