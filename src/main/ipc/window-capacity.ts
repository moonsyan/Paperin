const MAX_WINDOWS = 8

export const isWindowCapacityAvailable = (windowCount: number): boolean =>
  windowCount < MAX_WINDOWS
