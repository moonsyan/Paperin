/** 磁盘回执只确认当时写出的快照。等待期间抵达的新内容或未落账输入必须保持 dirty。 */
export const resolveSaveReceipt = (
  written: string,
  latest: string | undefined,
  hasLatePendingInput: boolean,
): { content: string; saved: boolean } => {
  const current = latest ?? written
  const saved = current === written && !hasLatePendingInput
  return { content: saved ? written : current, saved }
}
