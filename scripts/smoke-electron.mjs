#!/usr/bin/env node
// 可重复的 Electron 级端到端冒烟：构建产物上驱动真实产品路径
// （渲染层 desktopAPI → 预加载桥 → 主进程 IPC → 磁盘）。
//
// 用法：
//   npm run build && node scripts/smoke-electron.mjs
//   npm run build && npm run smoke   # 等价入口
//   npm run build && npm run perf:electron  # 5 MiB / 20 标签真实 Electron 性能门禁
//   node scripts/smoke-electron.mjs --performance --stability-hours 8  # 8 小时稳定性（人工/设备门禁）
//
// 场景：打开临时工作区 → 新建文档 → 保存并校验磁盘 → 外部修改 + 过期
// mtime 保存必须 CONFLICT → 重读 → 重命名 → 工作区搜索 → 状态读取。
// 任一步失败以非零退出并打印 SMOKE_FAIL 详情；成功打印 SMOKE_PASS。

import { spawn } from 'node:child_process'
import { access, mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname, normalize } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import {
  createLargeParagraph5MibMarkdown,
  FIXTURE_FILENAMES,
} from './performance-fixtures.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(scriptDir, '..')
// Electron 可执行文件路径因平台而异（win: electron.exe；linux: electron；
// mac: Electron.app/Contents/MacOS/Electron）
const electronBinary =
  process.platform === 'darwin'
    ? join(projectRoot, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
    : join(projectRoot, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron')
const mainEntry = join(projectRoot, 'out', 'main', 'index.js')
const performanceScenario = process.argv.includes('--performance')
const stabilityHoursIndex = process.argv.indexOf('--stability-hours')
const stabilityHoursFlag = process.argv.find((item) => item.startsWith('--stability-hours='))
const stabilityHours = stabilityHoursIndex >= 0
  ? Number(process.argv[stabilityHoursIndex + 1])
  : stabilityHoursFlag
    ? Number(stabilityHoursFlag.slice('--stability-hours='.length))
    : 0
const stabilityHoursSafe = Number.isFinite(stabilityHours) && stabilityHours > 0 ? stabilityHours : 0

const createLargeMarkdown = () => createLargeParagraph5MibMarkdown()

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
  const smokeRoot = await mkdtemp(join(tmpdir(), 'paperin-smoke-ws-'))
  const workspace = join(smokeRoot, '冒烟工作区')
  await mkdir(workspace, { recursive: true })
  await writeFile(
    join(workspace, '既有文档.md'),
    '# 既有文档\n\n冒烟预置内容。\n',
    'utf-8',
  )
  // 位于工作区之外：作为系统文件关联启动参数，验证它进入现有窗口的
  // 临时标签而不是被加入知识库索引。
  const associatedFile = join(smokeRoot, '系统关联临时文档.md')
  await writeFile(associatedFile, '# 系统关联\n\n外部临时内容。\n', 'utf-8')
  if (performanceScenario) {
    await writeFile(join(workspace, FIXTURE_FILENAMES.largeParagraph5Mib), createLargeMarkdown(), 'utf-8')
    await Promise.all(
      Array.from({ length: 19 }, async (_, index) => {
        const number = String(index + 1).padStart(2, '0')
        await writeFile(
          join(workspace, `性能标签-${number}.md`),
          `# 性能标签 ${number}\n\nPERF_TAB_${number}\n`,
          'utf-8',
        )
      }),
    )
  }

  // CI/无桌面环境的 GPU 兼容由主进程冒烟模式自处理（app.disableHardwareAcceleration，
  // 见 src/main/index.ts）；Electron CLI 不接受应用路径前的 Chromium 开关，
  // 在这里传 --disable-gpu 会直接报 "bad option" 而非进入测试场景。
  const child = spawn(
    electronBinary,
    [
      mainEntry,
      '--smoke',
      workspace,
      ...(performanceScenario ? ['--perf-electron'] : []),
      ...(stabilityHoursSafe > 0 ? ['--stability-hours', String(stabilityHoursSafe)] : []),
      associatedFile,
    ],
    {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ELECTRON_ENABLE_LOGGING: '0',
        // Electron 宿主的终端（VSCode/WorkBuddy 等）会导出 ELECTRON_RUN_AS_NODE=1，
        // 继承它会让 electron.exe 降级为纯 Node 运行主包（electron.app 为 undefined）。
        ELECTRON_RUN_AS_NODE: undefined,
      },
    },
  )

  let output = ''
  child.stdout.on('data', (chunk) => {
    output += String(chunk)
  })
  child.stderr.on('data', (chunk) => {
    output += String(chunk)
  })

  const scriptTimeoutMs = performanceScenario || stabilityHoursSafe > 0
    ? Math.max(420_000, stabilityHoursSafe * 3_600_000 + 420_000)
    : 150_000
  const timeout = setTimeout(() => {
    console.error(`SMOKE_FAIL 冒烟脚本总超时（${Math.round(scriptTimeoutMs / 1000)}s）`)
    child.kill()
  }, scriptTimeoutMs)

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
