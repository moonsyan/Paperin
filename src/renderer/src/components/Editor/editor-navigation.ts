export const isAtNodeTextBoundary = (
  text: string,
  direction: 'up' | 'down',
  offset: number,
): boolean => {
  if (direction === 'down') {
    return !text.slice(offset).includes('\n')
  }

  return !text.slice(0, offset).includes('\n')
}

export const getNodeExitTargetDirection = (
  text: string,
  direction: 'up' | 'down',
  offset: number,
): 'before' | 'after' | null => {
  if (!isAtNodeTextBoundary(text, direction, offset)) return null

  return direction === 'down' ? 'after' : 'before'
}
