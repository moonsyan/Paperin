import { createHash } from 'crypto'

import { mkdir, open, rename, stat, unlink, writeFile } from 'fs/promises'

import { dirname, join } from 'path'

import type { WorkspaceCoverage } from '../../shared/workspace-coverage'

import type { WorkspaceIndex } from '../../shared/workspace-index'



export const CACHE_SCHEMA_VERSION = 1

/** 缓存文件体积上限：超出时拒绝载入/写入（可删除重建） */

export const MAX_CACHE_FILE_BYTES = 8 * 1024 * 1024



export interface WorkspaceIndexCacheSaveContext {

  lifecycleEpoch: number

}



export interface WorkspaceIndexCacheStore {

  load(root: string): Promise<WorkspaceIndex | null>

  save(root: string, index: WorkspaceIndex, context?: WorkspaceIndexCacheSaveContext): Promise<void>

  clear(root: string): Promise<void>

}



const sameWorkspaceRoot = (left: string, right: string): boolean =>

  left.replace(/[\\/]+/g, '/').replace(/\/$/, '').toLowerCase() ===

  right.replace(/[\\/]+/g, '/').replace(/\/$/, '').toLowerCase()



const isRecord = (value: unknown): value is Record<string, unknown> =>

  typeof value === 'object' && value !== null && !Array.isArray(value)



const hasForbiddenBodyKeys = (value: unknown): boolean => {

  if (!isRecord(value)) return false

  if ('lines' in value || 'content' in value) return true

  for (const nested of Object.values(value)) {

    if (hasForbiddenBodyKeys(nested)) return true

  }

  return false

}



const isCoverage = (value: unknown): value is WorkspaceCoverage =>

  isRecord(value) &&

  typeof value.complete === 'boolean' &&

  typeof value.scannedFiles === 'number' &&

  isRecord(value.skipped)



const isIndexedDocument = (value: unknown): boolean => {

  if (!isRecord(value)) return false

  return (

    typeof value.path === 'string' &&

    typeof value.relativePath === 'string' &&

    typeof value.name === 'string' &&

    typeof value.size === 'number' &&

    typeof value.modifiedTime === 'number' &&

    Array.isArray(value.headings) &&

    Array.isArray(value.tags) &&

    isRecord(value.frontmatter) &&

    Array.isArray(value.outgoingLinks) &&

    Array.isArray(value.imageRefs)

  )

}



/** 解析并校验磁盘缓存 JSON；失败返回 null（调用方走重建） */

export const parseWorkspaceIndexCachePayload = (raw: string, root: string): WorkspaceIndex | null => {

  if (raw.includes('"lines"') || raw.includes('"content"')) return null

  let parsed: unknown

  try {

    parsed = JSON.parse(raw)

  } catch {

    return null

  }

  if (!isRecord(parsed)) return null

  if (parsed.cacheSchemaVersion !== CACHE_SCHEMA_VERSION) return null

  if (typeof parsed.workspacePath !== 'string' || !sameWorkspaceRoot(parsed.workspacePath, root)) return null

  if (typeof parsed.generatedAt !== 'string') return null

  if (typeof parsed.generation !== 'number') return null

  if (typeof parsed.complete !== 'boolean' || typeof parsed.truncated !== 'boolean') return null

  if (!isCoverage(parsed.coverage)) return null

  if (!isRecord(parsed.documents)) return null

  if (!Array.isArray(parsed.links) || !Array.isArray(parsed.tags) || !Array.isArray(parsed.assets)) return null

  if (!Array.isArray(parsed.diagnostics)) return null

  if (hasForbiddenBodyKeys(parsed.documents)) return null

  for (const document of Object.values(parsed.documents)) {

    if (!isIndexedDocument(document)) return null

  }

  return parsed as unknown as WorkspaceIndex

}



const readCacheFileUtf8 = async (file: string): Promise<string | null> => {

  let handle

  try {

    const fileStat = await stat(file)

    if (fileStat.size > MAX_CACHE_FILE_BYTES) return null

    const toRead = Math.min(fileStat.size, MAX_CACHE_FILE_BYTES)

    handle = await open(file, 'r')

    const buffer = Buffer.alloc(toRead)

    const { bytesRead } = await handle.read(buffer, 0, toRead, 0)

    if (bytesRead < fileStat.size) return null

    return buffer.subarray(0, bytesRead).toString('utf-8')

  } catch {

    return null

  } finally {

    await handle?.close().catch(() => undefined)

  }

}



/**

 * 文件缓存实现：`<cacheDir>/<sha1(root)>.json`，原子写入（tmp+rename）。

 * getCacheDir 由装配方注入 Electron `app.getPath('userData')` 下的子目录，

 * 本文件自身不导入 Electron，可在单测中用临时目录验证。

 */

export const createFileWorkspaceIndexCache = (

  getCacheDir: () => string,

  getLifecycleEpoch: (root: string) => number = () => 0,

): WorkspaceIndexCacheStore => {

  const cacheFile = (root: string): string =>

    join(getCacheDir(), `${createHash('sha1').update(root).digest('hex')}.json`)



  const writeQueues = new Map<string, Promise<void>>()



  const enqueue = (root: string, task: () => Promise<void>): Promise<void> => {

    const previous = writeQueues.get(root) ?? Promise.resolve()

    const next = previous.then(task, task)

    writeQueues.set(

      root,

      next.finally(() => {

        if (writeQueues.get(root) === next) writeQueues.delete(root)

      }),

    )

    return next

  }



  return {

    async load(root) {

      const raw = await readCacheFileUtf8(cacheFile(root))

      if (raw === null) return null

      return parseWorkspaceIndexCachePayload(raw, root)

    },



    async save(root, index, context) {

      await enqueue(root, async () => {

        const epoch = context?.lifecycleEpoch ?? getLifecycleEpoch(root)

        if (getLifecycleEpoch(root) !== epoch) return

        const file = cacheFile(root)

        const payload = JSON.stringify({

          cacheSchemaVersion: CACHE_SCHEMA_VERSION,

          workspacePath: root,

          generatedAt: index.generatedAt,

          generation: index.generation,

          complete: index.complete,

          truncated: index.truncated,

          coverage: index.coverage,

          documents: index.documents,

          links: index.links,

          tags: index.tags,

          assets: index.assets,

          diagnostics: index.diagnostics,

        })

        if (Buffer.byteLength(payload, 'utf-8') > MAX_CACHE_FILE_BYTES) return

        if (getLifecycleEpoch(root) !== epoch) return

        const tmp = `${file}.${process.pid}.tmp`

        try {

          await mkdir(dirname(file), { recursive: true })

          await writeFile(tmp, payload, 'utf-8')

          if (getLifecycleEpoch(root) !== epoch) {

            await unlink(tmp).catch(() => undefined)

            return

          }

          await rename(tmp, file)

        } catch {

          await unlink(tmp).catch(() => undefined)

        }

      })

    },



    async clear(root) {

      await enqueue(root, async () => {

        const file = cacheFile(root)

        await unlink(file).catch(() => undefined)

        const tmp = `${file}.${process.pid}.tmp`

        await unlink(tmp).catch(() => undefined)

      })

    },

  }

}


