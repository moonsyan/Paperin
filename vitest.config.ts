import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

// 本地与 CI 均默认单 worker 串行执行：并行 fork 会触发 esbuild
// OOM，jsdom 用例并发时也更容易出现相互污染。用例如需 DOM，
// 在文件顶部声明 `@vitest-environment jsdom`。
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src'),
    },
  },
  test: {
    maxWorkers: 1,
    minWorkers: 1,
  },
})
