import { createHash } from 'crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type { WorkspaceIndex } from '../../shared/workspace-index'

export interface WorkspaceIndexCacheStore {
  load(root: string): Promise<WorkspaceIndex | null>
  save(root: string, index: WorkspaceIndex): Promise<void>
  clear(root: string): Promise<void>
}

/** 缓存文件体积上限：超出时拒绝写入（删除即可重建，索引不承载持久事实） */
const MAX_CACHE_FILE_BYTES = 8 * 1024 * 1024

/**
 * 文件缓存实现：`<cacheDir>/<sha1(root)>.json`，原子写入（tmp+rename）。
 * getCacheDir 由装配方注入 Electron `app.getPath('userData')` 下的子目录，
 * 本文件自身不导入 Electron，可在单测中用临时目录验证。
 */
export const createFileWorkspaceIndexCache = (
  getCacheDir: () => string,
): WorkspaceIndexCacheStore => {
  const cacheFile = (root: string): string =>
    join(getCacheDir(), `${createHash('sha1').update(root).digest('hex')}.json`)

  return {
    async load(root) {
      try {
        const raw = await readFile(cacheFile(root), 'utf-8')
        if (raw.length > MAX_CACHE_FILE_BYTES) return null
        const parsed = JSON.parse(raw) as WorkspaceIndex | null
        if (!parsed || typeof parsed !== 'object' || !parsed.documents) return null
        return parsed
      } catch {
        return null
      }
    },

    async save(root, index) {
      const file = cacheFile(root)
      const payload = JSON.stringify({ ...index, diagnostics: index.diagnostics })
      if (payload.length > MAX_CACHE_FILE_BYTES) return
      try {
        await mkdir(dirname(file), { recursive: true })
        const tmp = `${file}.${process.pid}.tmp`
        await writeFile(tmp, payload, 'utf-8')
        await rename(tmp, file)
      } catch {
        // 缓存写失败不影响索引可用性（内存快照仍在）
      }
    },

    async clear(root) {
      try {
        await unlink(cacheFile(root))
      } catch {
        // 文件不存在视为已清理
      }
    },
  }
}
