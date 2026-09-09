'use strict'

// electron-builder afterPack 钩子：打包完成后修剪 Electron 运行时中本应用
// 不需要的文件，减小安装包体积。
//
// 当前只做 Windows 处理：
// - dxcompiler.dll / dxil.dll：D3D12/WebGPU 的着色器编译链。
//   本应用不使用 WebGPU，D3D11（d3dcompiler_47.dll）与 SwiftShader 回退
//   均在，动态验证过移除后窗口渲染正常（含 Canvas 知识图谱）。
//   移除约省 26MB 原始体积（NSIS 压缩后约 10MB）。
//
// 注意：LICENSES.chromium.html、icudtl.dat、vk_swiftshader.dll、ffmpeg.dll
// 等均保留（许可合规与渲染/媒体回退需要）。

const { rm } = require('fs/promises')
const { join } = require('path')

// 平台不匹配时直接跳过，避免 mac/linux 构建误杀目标文件
const WINDOWS_ONLY_TRIMS = ['dxcompiler.dll', 'dxil.dll']

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return

  for (const name of WINDOWS_ONLY_TRIMS) {
    const file = join(context.appOutDir, name)
    await rm(file, { force: true })
  }
}
