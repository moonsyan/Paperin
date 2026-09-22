import { createHash } from 'crypto'
import { readdir, readFile, stat } from 'fs/promises'
import { join } from 'path'

const HASH_EXTENSIONS = new Set(['.md', '.csv', '.png', '.jpg', '.jpeg', '.gif', '.webp'])

const shouldHashFile = (name: string): boolean => {
  const lower = name.toLowerCase()
  for (const ext of HASH_EXTENSIONS) {
    if (lower.endsWith(ext)) return true
  }
  return false
}

const shouldSkipDir = (name: string): boolean => name === '.paperin'

/** 对夹具内 Markdown/CSV/图片做内容 hash；`.paperin` 目录排除。 */
export const hashCompatibilityFixtureTree = async (
  root: string,
): Promise<Record<string, string>> => {
  const hashes: Record<string, string> = {}

  const walk = async (dir: string, prefix: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (shouldSkipDir(entry.name)) continue
        await walk(join(dir, entry.name), prefix ? `${prefix}/${entry.name}` : entry.name)
        continue
      }
      if (!entry.isFile() || !shouldHashFile(entry.name)) continue
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      const normalized = relative.replace(/\\/g, '/')
      const full = join(dir, entry.name)
      const info = await stat(full)
      if (!info.isFile()) continue
      const buffer = await readFile(full)
      hashes[normalized] = createHash('sha256').update(buffer).digest('hex')
    }
  }

  await walk(root, '')
  return hashes
}
