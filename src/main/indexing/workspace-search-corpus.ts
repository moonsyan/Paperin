/**
 * Main 进程专用：全文搜索语料快照与有界内存预算（P0-02）。
 * 不进入 Shared DTO、不写磁盘、不暴露给 Renderer。
 */

export interface WorkspaceSearchDocument {
  path: string
  size: number
  mtimeMs: number
  lines: readonly string[]
}

export interface WorkspaceSearchSnapshot {
  generation: number
  complete: boolean
  documents: readonly WorkspaceSearchDocument[]
}

/** 单根工作区 UTF-8 正文语料上限（字节，不含 JS 对象开销） */
export const DEFAULT_WORKSPACE_SEARCH_CORPUS_PER_ROOT_BYTES = 64 * 1024 * 1024

/** 主进程全部工作区语料 UTF-8 正文合计上限（字节） */
export const DEFAULT_WORKSPACE_SEARCH_CORPUS_PROCESS_BYTES = 128 * 1024 * 1024

export const estimateSearchDocumentBytes = (doc: WorkspaceSearchDocument): number => {
  let total = Buffer.byteLength(doc.path, 'utf-8')
  for (const line of doc.lines) {
    total += Buffer.byteLength(line, 'utf-8') + 1
  }
  return total
}

export const buildSearchDocumentFromContent = (
  path: string,
  size: number,
  mtimeMs: number,
  content: string,
): WorkspaceSearchDocument => ({
  path,
  size,
  mtimeMs,
  lines: content.split(/\r?\n/),
})

/** 进程内语料 UTF-8 字节预算：单根与全进程双上限 */
export class WorkspaceSearchCorpusBudget {
  private processUsedBytes = 0

  constructor(
    private readonly perRootLimit: number,
    private readonly processLimit: number,
  ) {}

  releaseRoot(rootBytes: number): void {
    if (rootBytes <= 0) return
    this.processUsedBytes = Math.max(0, this.processUsedBytes - rootBytes)
  }

  canAllocate(rootBytes: number, additionalBytes: number, replacingBytes = 0): boolean {
    const nextRootBytes = rootBytes - replacingBytes + additionalBytes
    const nextProcessBytes = this.processUsedBytes - replacingBytes + additionalBytes
    return nextRootBytes <= this.perRootLimit && nextProcessBytes <= this.processLimit
  }

  allocate(replacingBytes: number, additionalBytes: number): void {
    this.processUsedBytes = Math.max(
      0,
      this.processUsedBytes - replacingBytes + additionalBytes,
    )
  }
}

export const tryRetainSearchCorpusDocument = (
  budget: WorkspaceSearchCorpusBudget,
  rootCorpusBytes: number,
  target: Map<string, WorkspaceSearchDocument>,
  doc: WorkspaceSearchDocument,
): { retained: boolean; nextRootCorpusBytes: number } => {
  const bytes = estimateSearchDocumentBytes(doc)
  if (!budget.canAllocate(rootCorpusBytes, bytes)) {
    return { retained: false, nextRootCorpusBytes: rootCorpusBytes }
  }
  target.set(doc.path, doc)
  budget.allocate(0, bytes)
  return { retained: true, nextRootCorpusBytes: rootCorpusBytes + bytes }
}
