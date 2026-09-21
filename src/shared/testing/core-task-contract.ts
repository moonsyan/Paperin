export const CORE_TASK_STEPS = ['find-source', 'insert-citation', 'save-reopen', 'export-bundle'] as const
export type CoreTaskStep = (typeof CORE_TASK_STEPS)[number]

export const formatCoreTaskFail = (step: CoreTaskStep, reason: string): string =>
  `CORE_TASK_FAIL ${step} ${reason}`
