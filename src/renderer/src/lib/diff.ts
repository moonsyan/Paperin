/* ==================== 行级差异对比（版本历史 diff 视图用） ==================== */

export type DiffLineType = 'same' | 'add' | 'del'

export interface DiffLine {
  type: DiffLineType
  text: string
  /** 旧文档中的 1-based 行号（same/del 行存在） */
  oldNumber?: number
  /** 新文档中的 1-based 行号（same/add 行存在） */
  newNumber?: number
}

export interface DiffResult {
  lines: DiffLine[]
  added: number
  removed: number
  /** 超出 LCS 计算上限时退化为整块替换，结果不精确但内容完整 */
  truncated: boolean
}

/**
 * 中段 LCS 动态规划的规模上限：前后公共前缀/后缀裁剪后，
 * 剩余差异区任一侧超过该行数即放弃逐行对齐（Int32 DP 表 2000×2000 ≈ 16MB，
 * 是纯预览场景可接受的一次性开销）。
 */
export const DIFF_MID_CAP = 2000

/**
 * 按行对比两份文本（LCS 最长公共子序列）。
 * 先裁剪公共前缀/后缀，只对差异中段做 O(N×M) 计算；
 * 超限时退化为"整块删除 + 整块新增"，并置 truncated 供 UI 提示。
 */
export function diffLines(
  oldText: string,
  newText: string,
  midCap = DIFF_MID_CAP,
): DiffResult {
  const oldAll = oldText.split('\n')
  const newAll = newText.split('\n')

  let start = 0
  while (
    start < oldAll.length &&
    start < newAll.length &&
    oldAll[start] === newAll[start]
  ) {
    start++
  }
  let endOld = oldAll.length
  let endNew = newAll.length
  while (endOld > start && endNew > start && oldAll[endOld - 1] === newAll[endNew - 1]) {
    endOld--
    endNew--
  }

  const lines: DiffLine[] = []
  for (let i = 0; i < start; i++) {
    lines.push({ type: 'same', text: oldAll[i], oldNumber: i + 1, newNumber: i + 1 })
  }

  const midOld = oldAll.slice(start, endOld)
  const midNew = newAll.slice(start, endNew)
  let truncated = false
  if (midOld.length > midCap || midNew.length > midCap) {
    // 差异区过大：不做逐行对齐，整块标记为删除+新增
    truncated = true
    midOld.forEach((text, i) => {
      lines.push({ type: 'del', text, oldNumber: start + i + 1 })
    })
    midNew.forEach((text, i) => {
      lines.push({ type: 'add', text, newNumber: start + i + 1 })
    })
  } else {
    pushLcsDiff(lines, midOld, midNew, start)
  }

  const tailBaseOld = endOld
  for (let i = endOld; i < oldAll.length; i++) {
    lines.push({
      type: 'same',
      text: oldAll[i],
      oldNumber: i + 1,
      newNumber: endNew + (i - tailBaseOld) + 1,
    })
  }

  let added = 0
  let removed = 0
  for (const line of lines) {
    if (line.type === 'add') added++
    else if (line.type === 'del') removed++
  }
  return { lines, added, removed, truncated }
}

/** 对已裁剪的差异中段做 LCS 回溯并追加到 lines；oldStart/newStart 为 0-based 起始行号 */
function pushLcsDiff(
  lines: DiffLine[],
  midOld: string[],
  midNew: string[],
  startIndex: number,
): void {
  const n = midOld.length
  const m = midNew.length
  if (n === 0 && m === 0) return

  // lcs[i][j] = midOld[i..] 与 midNew[j..] 的最长公共子序列长度
  const width = m + 1
  const lcs = new Int32Array((n + 1) * width)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * width + j] =
        midOld[i] === midNew[j]
          ? lcs[(i + 1) * width + j + 1] + 1
          : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1])
    }
  }

  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (midOld[i] === midNew[j]) {
      lines.push({
        type: 'same',
        text: midOld[i],
        oldNumber: startIndex + i + 1,
        newNumber: startIndex + j + 1,
      })
      i++
      j++
    } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) {
      lines.push({ type: 'del', text: midOld[i], oldNumber: startIndex + i + 1 })
      i++
    } else {
      lines.push({ type: 'add', text: midNew[j], newNumber: startIndex + j + 1 })
      j++
    }
  }
  while (i < n) {
    lines.push({ type: 'del', text: midOld[i], oldNumber: startIndex + i + 1 })
    i++
  }
  while (j < m) {
    lines.push({ type: 'add', text: midNew[j], newNumber: startIndex + j + 1 })
    j++
  }
}
