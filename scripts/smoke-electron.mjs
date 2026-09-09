#!/usr/bin/env node
// 可重复的 Electron 级端到端冒烟：构建产物上驱动真实产品路径
// （渲染层 desktopAPI → 预加载桥 → 主进程 IPC → 磁盘）。
//
// 用法：
//   npm run build && node scripts/smoke-electron.mjs
//   npm run build && npm run smoke   # 等价入口
//
// 场景：打开临时工作区 → 新建文档 → 保存并校验磁盘 → 外部修改 + 过期
// mtime 保存必须 CONFLICT → 重读 → 重命名 → 工作区搜索 → 状态读取。
// 任一步失败以非零退出并打印 SMOKE_FAIL 详情；成功打印 SMOKE_PASS。

import { spawn } from 'node:child_process'
import { access, mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname, normalize } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(scriptDir, '..')
// Electron 可执行文件路径因平台而异（win: electron.exe；linux: electron；
// mac: Electron.app/Contents/MacOS/Electron）
const electronBinary =
  process.platform === 'darwin'
    ? join(projectRoot, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
    : join(projectRoot, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron')
const mainEntry = join(projectRoot, 'out', 'main', 'index.js')

const main = async () => {
  try {
    await access(mainEntry)
  } catch {
    console.error('未找到构建产物 out/main/index.js，请先运行 npm run build')
    process.exit(1)
  }
  try {
    await access(electronBinary)
  } catch {
    console.error(`未找到 Electron 可执行文件：${electronBinary}，请先 npm install`)
    process.exit(1)
  }

  // 一次性冒烟工作区：中文目录名 + 一个既有文档，验证中文路径全链路
  const smokeRoot = await mkdtemp(join(tmpdir(), 'mkeditor-smoke-ws-'))
  const workspace = join(smokeRoot, '冒烟工作区')
  await mkdir(workspace, { recursive: true })
  await writeFile(
    join(workspace, '既有文档.md'),
    '# 既有文档\n\n冒烟预置内容。\n',
    'utf-8',
  )

  // CI/无桌面环境可能无法启动 Chromium GPU 进程；冒烟验证的是 IPC 与磁盘链路，
  // 因此显式禁用 GPU，避免渲染器在进入测试场景前被运行环境终止。
  const child = spawn(electronBinary, ['--disable-gpu', mainEntry, '--smoke', workspace], {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: '0' },
  })

  let output = ''
  child.stdout.on('data', (chunk) => {
    output += String(chunk)
  })
  child.stderr.on('data', (chunk) => {
    output += String(chunk)
  })

  const timeout = setTimeout(() => {
    console.error('SMOKE_FAIL 冒烟脚本总超时（150s）')
    child.kill()
  }, 150_000)

  child.on('close', async (code) => {
    clearTimeout(timeout)
    const normalized = normalize(output)
    const unexpectedWarning = [
      'Unsupported language detected',
      'violates the following Content Security Policy',
    ].find((message) => normalized.includes(message))
    const pass = code === 0 && normalized.includes('SMOKE_PASS') && !unexpectedWarning
    console.error(output.trimEnd())
    await rm(smokeRoot, { recursive: true, force: true }).catch(() => undefined)
    if (pass) {
      console.log('Electron 冒烟通过')
      process.exit(0)
    }
    if (unexpectedWarning) {
      console.error(`Electron 冒烟捕获未处理的渲染器告警：${unexpectedWarning}`)
    }
    console.error(`Electron 冒烟失败（exit=${code}）`)
    process.exit(1)
  })
}

main().catch((error) => {
  console.error('SMOKE_FAIL', error)
  process.exit(1)
})
