import iconv from 'iconv-lite'

const utf8Decoder = new TextDecoder('utf-8', { fatal: true })

/** 解码结果含未配对代理项时视为损坏 UTF-16，不能当作正常正文。 */
export const hasLoneSurrogates = (text: string): boolean => {
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index)
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = index + 1 < text.length ? text.charCodeAt(index + 1) : 0
      if (next < 0xdc00 || next > 0xdfff) return true
      index += 1
      continue
    }
    if (unit >= 0xdc00 && unit <= 0xdfff) return true
  }
  return false
}

export const decodeUtf8Strict = (buf: Buffer): string => utf8Decoder.decode(buf)

export const decodeUtf16LeStrict = (buf: Buffer): string => {
  if (buf.length % 2 !== 0) {
    throw new RangeError('UTF-16LE 字节长度必须为偶数')
  }
  const content = buf.toString('utf16le')
  if (hasLoneSurrogates(content)) {
    throw new RangeError('UTF-16LE 含孤立代理项')
  }
  return content
}

export const decodeUtf16BeStrict = (buf: Buffer): string => {
  if (buf.length % 2 !== 0) {
    throw new RangeError('UTF-16BE 字节长度必须为偶数')
  }
  const content = iconv.decode(buf, 'utf-16be')
  if (hasLoneSurrogates(content)) {
    throw new RangeError('UTF-16BE 含孤立代理项')
  }
  return content
}
