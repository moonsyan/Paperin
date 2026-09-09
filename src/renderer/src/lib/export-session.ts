export interface ExportSession {
  begin: () => boolean
  finish: () => void
  isActive: () => boolean
}

export const createExportSession = (): ExportSession => {
  let active = false

  return {
    begin: () => {
      if (active) return false
      active = true
      return true
    },
    finish: () => {
      active = false
    },
    isActive: () => active,
  }
}
