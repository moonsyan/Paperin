import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.perf.ts'],
    maxWorkers: 1,
    minWorkers: 1,
    hookTimeout: 120_000,
    testTimeout: 120_000,
  },
})
