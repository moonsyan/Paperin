/** 剪贴板/拖入图片的最大体积，与图床上传限制保持一致 */
export const MAX_IMAGE_SIZE = 20 * 1024 * 1024

/** Base64 解码前的长度上限，避免超大 IPC 载荷先造成主进程内存峰值 */
export const MAX_IMAGE_BASE64_LENGTH = Math.ceil((MAX_IMAGE_SIZE * 4) / 3) + 4

/**
 * Base64 载荷严格校验（L6）：Buffer.from 会静默忽略非法字符，
 * 损坏的剪贴板数据会写出截断图片却报保存成功。要求标准字母表 +
 * 尾部 0-2 个填充符 + 长度对齐；应用自身生成的 data URL 均为标准
 * 带填充 base64，过严只影响本就不应存在的损坏数据。
 */
export const isValidBase64Payload = (payload: string): boolean => {
  if (!payload || payload.length % 4 !== 0) return false
  return /^[A-Za-z0-9+/]*={0,2}$/.test(payload)
}
