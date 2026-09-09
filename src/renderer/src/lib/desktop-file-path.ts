export const sameDesktopFilePath = (
  left: string | undefined,
  right: string | undefined,
  caseInsensitive: boolean,
): boolean => {
  if (!left || !right) return left === right
  if (!caseInsensitive) return left === right
  return left.toLowerCase() === right.toLowerCase()
}
