import { mkdir, readFile, realpath, rename, stat, unlink, writeFile } from 'fs/promises'
import { join, resolve } from 'path'
import {
  DEFAULT_WORKSPACE_DOCUMENTS,
  DEFAULT_WORKSPACE_LAYOUT,
  DEFAULT_WORKSPACE_SETTINGS,
  parseWorkspaceDocuments,
  parseWorkspaceLayout,
  parseWorkspaceSettings,
  type WorkspaceDocumentsState,
  type WorkspaceLayoutState,
  type WorkspaceSettingsState,
  type WorkspaceStateBundle,
} from '../../shared/workspace-state'
import { isInsideRoot, resolveCandidateForComparison } from '../ipc/workspace-scope'

const WORKSPACE_STATE_DIRECTORY = '.paperin'
const MAX_STATE_FILE_SIZE = 1024 * 1024

type WorkspaceStateFile = 'settings.json' | 'workspace.json' | 'documents.json'

export class WorkspaceStateStoreError extends Error {
  constructor(public readonly code: 'VALUE_TOO_LARGE' | 'WRITE_FAILED' | 'INVALID_PATH') {
    super(code)
  }
}

export class WorkspaceStateStore {
  private readonly writeQueues = new Map<string, Promise<unknown>>()

  async load(rootPath: string): Promise<WorkspaceStateBundle> {
    const [settings, layout, documents] = await Promise.all([
      this.readStateFile(
        rootPath,
        'settings.json',
        parseWorkspaceSettings,
        DEFAULT_WORKSPACE_SETTINGS,
      ),
      this.readStateFile(
        rootPath,
        'workspace.json',
        parseWorkspaceLayout,
        DEFAULT_WORKSPACE_LAYOUT,
      ),
      this.readStateFile(
        rootPath,
        'documents.json',
        parseWorkspaceDocuments,
        DEFAULT_WORKSPACE_DOCUMENTS,
      ),
    ])
    return { settings, layout, documents }
  }

  writeSettings(rootPath: string, value: WorkspaceSettingsState): Promise<void> {
    return this.enqueue(rootPath, 'settings.json', () =>
      this.writeStateFile(rootPath, 'settings.json', parseWorkspaceSettings(value)),
    )
  }

  /**
   * 读-改-写原子更新：多窗口共用同一主进程，若"读取→合并"在写队列外
   * 进行，并发窗口的后写者会基于旧快照覆盖先写者刚写入的其他字段。
   * 把读取与合并放进同一写队列任务即可按根串行化。
   */
  updateSettings(
    rootPath: string,
    updater: (
      current: WorkspaceSettingsState,
    ) => WorkspaceSettingsState | Promise<WorkspaceSettingsState>,
  ): Promise<WorkspaceSettingsState> {
    return this.enqueue(rootPath, 'settings.json', async () => {
      const current = await this.readStateFile(
        rootPath,
        'settings.json',
        parseWorkspaceSettings,
        DEFAULT_WORKSPACE_SETTINGS,
      )
      const next = parseWorkspaceSettings(await updater(current))
      await this.writeStateFile(rootPath, 'settings.json', next)
      return next
    })
  }

  writeLayout(rootPath: string, value: WorkspaceLayoutState): Promise<void> {
    return this.enqueue(rootPath, 'workspace.json', () =>
      this.writeStateFile(rootPath, 'workspace.json', parseWorkspaceLayout(value)),
    )
  }

  writeDocuments(rootPath: string, value: WorkspaceDocumentsState): Promise<void> {
    return this.enqueue(rootPath, 'documents.json', () =>
      this.writeStateFile(rootPath, 'documents.json', parseWorkspaceDocuments(value)),
    )
  }

  /** 同一目标文件的写任务按提交顺序串行执行 */
  private enqueue<T>(
    rootPath: string,
    fileName: WorkspaceStateFile,
    run: () => Promise<T>,
  ): Promise<T> {
    const targetPath = join(this.stateDirectory(rootPath), fileName)
    const previous = this.writeQueues.get(targetPath) ?? Promise.resolve()
    const task = previous.catch(() => undefined).then(run)
    this.writeQueues.set(targetPath, task)
    return task.finally(() => {
      if (this.writeQueues.get(targetPath) === task) {
        this.writeQueues.delete(targetPath)
      }
    })
  }

  private stateDirectory(rootPath: string): string {
    return join(resolve(rootPath), WORKSPACE_STATE_DIRECTORY)
  }

  /** 真实根内才允许读写；`.paperin` 指向库外时拒绝。 */
  private async resolveAuthorizedStatePath(
    rootPath: string,
    candidate: string,
  ): Promise<string | null> {
    const realRoot = await realpath(resolve(rootPath)).catch(() => null)
    if (!realRoot) return null
    const realCandidate = await resolveCandidateForComparison(candidate)
    if (!realCandidate || !isInsideRoot(realRoot, realCandidate)) return null
    return realCandidate
  }

  private async readStateFile<T>(
    rootPath: string,
    fileName: WorkspaceStateFile,
    parse: (value: unknown) => T,
    fallback: T,
  ): Promise<T> {
    const lexicalPath = join(this.stateDirectory(rootPath), fileName)
    const path = await this.resolveAuthorizedStatePath(rootPath, lexicalPath)
    if (!path) {
      return structuredClone(fallback)
    }
    let raw: string
    try {
      const fileStat = await stat(path)
      if (fileStat.size > MAX_STATE_FILE_SIZE) {
        // 超限：与超限写入守卫一致，视为不可用并回退默认值，同时上报便于排查异常膨胀
        console.warn(
          `[workspace-state] ${fileName} 超过 ${MAX_STATE_FILE_SIZE} 字节上限，使用默认值`,
        )
        return structuredClone(fallback)
      }
      raw = await readFile(path, 'utf-8')
    } catch (err) {
      // 文件不存在属正常（首次启动/尚未写入），无需告警；
      // 其余（权限不足、磁盘错误等）需可观测，记录后回退默认值
      if ((err as { code?: string }).code === 'ENOENT') {
        return structuredClone(fallback)
      }
      console.warn(`[workspace-state] 读取 ${fileName} 失败，回退默认值：`, err)
      return structuredClone(fallback)
    }
    try {
      return parse(JSON.parse(raw))
    } catch (err) {
      // 解析/校验失败（文件损坏或版本不兼容）：记录后回退，避免整份工作区状态加载失败
      console.warn(`[workspace-state] 解析 ${fileName} 失败，回退默认值：`, err)
      return structuredClone(fallback)
    }
  }

  private async writeStateFile(
    rootPath: string,
    fileName: WorkspaceStateFile,
    value: WorkspaceSettingsState | WorkspaceLayoutState | WorkspaceDocumentsState,
  ): Promise<void> {
    const serialized = `${JSON.stringify(value, null, 2)}\n`
    if (Buffer.byteLength(serialized, 'utf-8') > MAX_STATE_FILE_SIZE) {
      throw new WorkspaceStateStoreError('VALUE_TOO_LARGE')
    }

    const directoryLexical = this.stateDirectory(rootPath)
    const targetLexical = join(directoryLexical, fileName)
    const authorizedDirectory = await this.resolveAuthorizedStatePath(rootPath, directoryLexical)
    const authorizedTarget = await this.resolveAuthorizedStatePath(rootPath, targetLexical)
    if (!authorizedDirectory || !authorizedTarget) {
      throw new WorkspaceStateStoreError('INVALID_PATH')
    }

    await mkdir(authorizedDirectory, { recursive: true })
    // mkdir 后再次校验，防止目录被换成库外 junction
    const directoryAfterMkdir = await this.resolveAuthorizedStatePath(rootPath, directoryLexical)
    const targetAfterMkdir = await this.resolveAuthorizedStatePath(rootPath, targetLexical)
    if (!directoryAfterMkdir || !targetAfterMkdir) {
      throw new WorkspaceStateStoreError('INVALID_PATH')
    }

    const temporaryPath = `${targetAfterMkdir}.${process.pid}-${Date.now()}-${Math.random()}.tmp`
    const authorizedTemporary = await this.resolveAuthorizedStatePath(rootPath, temporaryPath)
    if (!authorizedTemporary) {
      throw new WorkspaceStateStoreError('INVALID_PATH')
    }
    try {
      await writeFile(authorizedTemporary, serialized, 'utf-8')
      const targetBeforeRename = await this.resolveAuthorizedStatePath(rootPath, targetLexical)
      if (!targetBeforeRename) {
        throw new WorkspaceStateStoreError('INVALID_PATH')
      }
      await rename(authorizedTemporary, targetBeforeRename)
    } catch (err) {
      await unlink(authorizedTemporary).catch(() => undefined)
      if (err instanceof WorkspaceStateStoreError) throw err
      throw new WorkspaceStateStoreError('WRITE_FAILED')
    }
  }
}
