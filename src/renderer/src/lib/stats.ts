import type { WritingStats } from '../components/HelpDialog'

/** 今天日期 YYYY-MM-DD */
export function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

/** 跨天滚动：旧日期数据归档到 history（保留 30 天） */
export function rollStatsDate(stats: WritingStats): WritingStats {
  const today = todayStr()
  if (stats.date === today) return stats
  const history = [
    ...stats.history.filter((h) => h.date !== today),
    { date: stats.date, words: stats.words, minutes: stats.minutes },
  ].slice(-30)
  return { date: today, words: 0, minutes: 0, history }
}

export const EMPTY_STATS: WritingStats = { date: '', words: 0, minutes: 0, history: [] }

/**
 * 估算阅读时长（分钟）：中文按字符计（≈500 字/分钟），拉丁文本按词计
 * （≈250 词/分钟）。此前按"非空白字符总数 / 500"估算，纯英文文档的
 * 字符数远大于词数，阅读时间被显著高估；混合后两种写法都接近常识值。
 */
export function estimateReadMinutes(plainText: string): number {
  if (!plainText) return 0
  const cjkCount = (plainText.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) ?? []).length
  const latinWords = (
    plainText
      .replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, ' ')
      .match(/[A-Za-z0-9]+(?:[''’-][A-Za-z0-9]+)*/g) ?? []
  ).length
  if (cjkCount === 0 && latinWords === 0) return 0
  return Math.max(1, Math.ceil(cjkCount / 500 + latinWords / 250))
}
