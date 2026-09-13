import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// fileAssociations 必须挂在平台配置（win/mac）下，不能放回顶层 build：
// platformPackager.fileAssociations 会把顶层项 concat 进所有平台，
// electron-builder 再把它透传给 appimage 工具，而该工具只接受字符串 ext，
// 数组 ext 会让 Linux 打包在启动阶段直接失败。见 release.yml 的 Linux job。
const PLATFORMS = ['win', 'mac']

function extensionsOf(platform) {
  const entries = pkg.build?.[platform]?.fileAssociations ?? []
  return entries.flatMap((entry) => (Array.isArray(entry.ext) ? entry.ext : [entry.ext]))
}

const pkg = JSON.parse(await readFile(join(process.cwd(), 'package.json'), 'utf-8'))

describe('packaged file associations', () => {
  it('registers Markdown documents for the desktop installers', () => {
    for (const platform of PLATFORMS) {
      const extensions = extensionsOf(platform)
      expect(extensions, `${platform} 应注册 md`).toContain('md')
      expect(extensions, `${platform} 应注册 markdown`).toContain('markdown')
    }
  })

  it('keeps fileAssociations out of the shared build config', () => {
    expect(pkg.build?.fileAssociations).toBeUndefined()
  })
})
