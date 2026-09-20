/** 文档在磁盘上的版本事实：读取与成功保存回执共用。hash 仅本地协议，不进日志/遥测。 */
export interface DocumentFileVersion {
  modifiedTime: number
  size: number
  contentSha256: string
}

const CONTENT_HASH_PATTERN = /^[a-f0-9]{64}$/

/** 校验保存请求携带的内容哈希形状（64 位小写十六进制）。 */
export const isValidContentHash = (value: unknown): value is string =>
  typeof value === 'string' && CONTENT_HASH_PATTERN.test(value)
