import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 5178, strictPort: true, open: false },
  build: {
    outDir: 'out/soft-workbench',
    rollupOptions: { input: resolve(__dirname, 'index.html') },
  },
})
