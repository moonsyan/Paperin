export interface LatestRequestGuard {
  begin: () => () => boolean
}

export const createLatestRequestGuard = (): LatestRequestGuard => {
  let generation = 0

  return {
    begin: () => {
      const requestGeneration = ++generation
      return () => requestGeneration === generation
    },
  }
}
