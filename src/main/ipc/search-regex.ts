import { Worker } from 'worker_threads'

const SEARCH_CACHE_MAX = 1000
const SEARCH_CACHE_MAX_BYTES = 32 * 1024 * 1024
const SEARCH_CACHE_FILE_MAX = 512 * 1024
const MAX_REGEX_FILE_TIME_MS = 500

export interface WorkspaceRegexMatch {
  line: number
  preview: string
}

export interface SearchLineCacheEntry {
  mtimeMs: number
  size: number
  lines: string[]
}

const searchLineCache = new Map<string, SearchLineCacheEntry & { bytes: number }>()
let searchLineCacheBytes = 0

const WORKSPACE_REGEX_WORKER_SOURCE = `
const { parentPort } = require('worker_threads')

parentPort.on('message', ({ content, query, caseSensitive, limit }) => {
  try {
    const regex = new RegExp(query, caseSensitive ? '' : 'i')
    const matches = []
    const lines = content.split(/\\r?\\n/)
    for (let index = 0; index < lines.length; index++) {
      regex.lastIndex = 0
      if (!regex.test(lines[index])) continue
      matches.push({ line: index + 1, preview: lines[index].trim().slice(0, 120) })
      if (matches.length >= limit) break
    }
    parentPort.postMessage({ ok: true, matches })
  } catch (error) {
    parentPort.postMessage({ ok: false, error: String(error) })
  }
})
`

const searchRegexInWorker = (
  worker: Worker,
  content: string,
  query: string,
  caseSensitive: boolean,
  limit: number,
): Promise<WorkspaceRegexMatch[]> =>
  new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer)
      worker.removeListener('message', handleMessage)
      worker.removeListener('error', handleError)
    }
    const handleMessage = (result: {
      ok?: boolean
      matches?: WorkspaceRegexMatch[]
      error?: string
    }) => {
      cleanup()
      if (!result.ok) {
        reject(new Error(result.error ?? 'REGEX_WORKER_ERROR'))
        return
      }
      resolve(result.matches ?? [])
    }
    const handleError = (error: Error) => {
      cleanup()
      reject(error)
    }
    const timer = setTimeout(() => {
      cleanup()
      void worker.terminate()
      reject(new Error('REGEX_TIMEOUT'))
    }, MAX_REGEX_FILE_TIME_MS)

    worker.once('message', handleMessage)
    worker.once('error', handleError)
    worker.postMessage({ content, query, caseSensitive, limit })
  })

let sharedRegexWorker: Worker | null = null
let regexWorkerMutex: Promise<unknown> = Promise.resolve()

const getSharedRegexWorker = (): Worker => {
  if (!sharedRegexWorker) {
    sharedRegexWorker = new Worker(WORKSPACE_REGEX_WORKER_SOURCE, { eval: true })
  }
  return sharedRegexWorker
}

export const disposeSharedRegexWorker = (): void => {
  if (sharedRegexWorker) {
    void sharedRegexWorker.terminate()
    sharedRegexWorker = null
  }
}

export const runSharedRegexSearch = (
  content: string,
  query: string,
  caseSensitive: boolean,
  limit: number,
): Promise<WorkspaceRegexMatch[]> => {
  const task = () =>
    searchRegexInWorker(getSharedRegexWorker(), content, query, caseSensitive, limit)
  const chained = regexWorkerMutex.then(task, task)
  regexWorkerMutex = chained.then(
    () => undefined,
    () => undefined,
  )
  return chained.catch((error: unknown) => {
    if (error instanceof Error && error.message === 'REGEX_TIMEOUT') {
      disposeSharedRegexWorker()
    }
    throw error
  })
}

export const getCachedSearchLines = (path: string): SearchLineCacheEntry | undefined =>
  searchLineCache.get(path)

export const cacheSearchLines = (path: string, entry: SearchLineCacheEntry): void => {
  if (entry.size > SEARCH_CACHE_FILE_MAX || entry.size > SEARCH_CACHE_MAX_BYTES) return
  const existing = searchLineCache.get(path)
  if (existing) {
    searchLineCacheBytes -= existing.bytes
    searchLineCache.delete(path)
  }

  while (
    searchLineCache.size >= SEARCH_CACHE_MAX ||
    searchLineCacheBytes + entry.size > SEARCH_CACHE_MAX_BYTES
  ) {
    const oldest = searchLineCache.keys().next().value
    if (oldest === undefined) break
    const removed = searchLineCache.get(oldest)
    if (removed) searchLineCacheBytes -= removed.bytes
    searchLineCache.delete(oldest)
  }

  searchLineCache.set(path, { ...entry, bytes: entry.size })
  searchLineCacheBytes += entry.size
}
