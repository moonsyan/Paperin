import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          /**
           * 按依赖域拆 vendor：应用代码与 React、Milkdown 各自独立成 chunk。
           * Electron 从本地加载，拆分的收益是更细的缓存粒度和并行解析，
           * 以及消除单文件 3 MB+ 的构建告警。
           *
           * 刻意**不**手动分组 mermaid / katex / cytoscape：它们已经由各自的
           * 动态 import 拆成按需 chunk（mermaid 之下还有十几个按图类型分块的
           * 子 chunk），手动合并会把按需加载重新拉回首屏。
           * 未命中的模块交回 Rollup 自动分配，保持既有懒加载结构。
           */
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined
            if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
              return 'vendor-react'
            }
            if (/[\\/]node_modules[\\/](@milkdown|prosemirror-|@prosemirror)/.test(id)) {
              return 'vendor-milkdown'
            }
            return undefined
          }
        }
      }
    }
  }
})
