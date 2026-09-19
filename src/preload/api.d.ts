import type {
  WorkspaceDocumentsState,
  WorkspaceLayoutState,
  WorkspaceSettingsState,
  WorkspaceStateBundle,
} from '../shared/workspace-state'
import type { WorkspaceLinkIndex } from '../shared/link-index'
import type { WorkspaceTagIndex } from '../shared/tag-index'
import type { WorkspaceIndex, WorkspaceIndexEvent } from '../shared/workspace-index'

interface WorkspaceStateResult<T = undefined> {
  ok: boolean
  data?: T
  error?: { code: string; message?: string }
}

/** 渲染进程中 window.desktopAPI 的类型声明 */
export interface DesktopAPI {
  /** 运行平台：darwin / win32 / linux */
  platform: string
  window: {
    setTitlebarColor(color: string, symbolColor?: string): Promise<{ ok: boolean; error?: { code: string; message?: string } }>
    setSpellcheck(enabled: boolean, language?: string): Promise<{ ok: boolean; error?: { code: string; message?: string } }>
    newWindow(): Promise<{ ok: boolean; error?: { code: string; message?: string } }>
    newWindowWithFile(path: string): Promise<{ ok: boolean; error?: { code: string; message?: string } }>
    onOpenFile(listener: (path: string) => void): () => void
    setUnsaved(unsaved: boolean): void
  }
  document: {
    open(): Promise<FileResult>
    openFolder(path?: string): Promise<FolderResult>
    read(path: string): Promise<FileResult>
    /** 读取拖入的文件：路径经预加载层 webUtils 解析，伪造 File 返回 INVALID_PATH */
    readDropped(file: File): Promise<FileResult>
    /** 选择资源包导出目标目录（独立步骤：取消发生在任何写入之前） */
    pickExportDirectory(title?: string): Promise<{ ok: boolean; data?: { path: string }; error?: { code: string; message?: string } }>
    /** 写出 HTML 资源包（index.html + assets/，主进程临时目录原子重命名） */
    exportBundle(request: {
      outputDir: string
      folderName: string
      html: string
      assets: Array<{ fileName: string; data: Uint8Array }>
    }): Promise<{
      ok: boolean
      data?: { path: string; assetCount: number; bytes: number }
      error?: { code: string; message?: string }
    }>
    /** 导出内联：把受信任 mdimg:// URL 读为 base64 data URL（导出内联用） */
    readImageInline(src: string): Promise<{ ok: boolean; data?: { dataUrl: string }; error?: { code: string; message?: string } }>
    stat(path: string): Promise<{ ok: boolean; data?: { modifiedTime: number }; error?: { code: string; message?: string } }>
    save(path: string, content: string, expectedMtime?: number, encoding?: string): Promise<SaveResult>
    saveAs(
      content: string,
      options?: {
        filters?: { name: string; extensions: string[] }[]
        defaultPath?: string
      },
    ): Promise<SaveAsResult>
    saveImage(
      dataUrl: string,
      hints?: {
        docPath?: string
        workspacePath?: string
        workspaceAttachmentDirectory?: string | null
        globalAttachmentDirectory?: string | null
      },
    ): Promise<ImageResult>
    exportPdf(
      html: string,
      defaultName: string,
      options?: {
        pageSize?: 'A4' | 'Letter' | 'A5' | 'Legal'
        margins?: 'narrow' | 'standard' | 'wide'
        headerFooter?: boolean
      },
    ): Promise<{ ok: boolean; data?: { path: string }; error?: { code: string; message?: string } }>
    exportPandoc(markdown: string, defaultTitle: string): Promise<{ ok: boolean; data?: { path: string }; error?: { code: string; message?: string } }>
    /** 零依赖导出 Word：parts 为 OOXML 文本部件，media 为图片二进制 */
    exportDocx(
      parts: Record<string, string>,
      media: { name: string; data: Uint8Array }[],
      defaultName: string,
    ): Promise<{ ok: boolean; data?: { path: string }; error?: { code: string; message?: string } }>
    pickCss(): Promise<{ ok: boolean; data?: { name: string; content: string }; error?: { code: string; message?: string } }>
    uploadImage(dataUrl: string): Promise<{ ok: boolean; data?: { url: string }; error?: { code: string; message?: string } }>
  }
  imageHost: {
    getStatus(): Promise<{ ok: boolean; data?: { provider: 'local' | 'smms'; configured: boolean }; error?: { code: string; message?: string } }>
    setConfig(provider: 'local' | 'smms', token?: string): Promise<{ ok: boolean; data?: { provider: 'local' | 'smms'; configured: boolean }; error?: { code: string; message?: string } }>
  }
  workspace: {
    getAttachmentDirectory(): Promise<{ ok: boolean; data?: { directory: string | null }; error?: { code: string; message?: string } }>
    setAttachmentDirectory(value: string | null): Promise<{ ok: boolean; data?: { directory: string | null }; error?: { code: string; message?: string } }>
    createFile(dir: string, name: string): Promise<{ ok: boolean; data?: { path: string; name: string }; error?: { code: string; message?: string } }>
    renameFile(path: string, newName: string): Promise<{ ok: boolean; data?: { path: string; name: string; modifiedTime: number }; error?: { code: string; message?: string } }>
    moveFile(path: string, targetDir: string): Promise<{ ok: boolean; data?: { path: string; name: string; modifiedTime: number }; error?: { code: string; message?: string } }>
    deleteFile(path: string): Promise<{ ok: boolean; data?: { name: string }; error?: { code: string; message?: string } }>
    listImages(dirs: string[]): Promise<{ ok: boolean; data?: { images: { path: string; name: string; size: number }[]; truncated: boolean }; error?: { code: string; message?: string } }>
    deleteImage(path: string): Promise<{ ok: boolean; error?: { code: string; message?: string } }>
    search(
      dir: string,
      query: string,
      caseSensitive?: boolean,
      regex?: boolean,
    ): Promise<{
      ok: boolean
      data?: {
        matches: { path: string; line: number; preview: string }[]
        truncated: boolean
        /** 扫描预算或文件数上限导致没扫完。缺省时由 truncated 与结果数推断。 */
        scanTruncated?: boolean
        /** 命中条数达到 200。与 scanTruncated 分开，避免把未扫完说成结果过多。 */
        matchCapped?: boolean
      }
      error?: { code: string; message?: string }
    }>
    /** 全工作区链接索引（反链面板与知识图谱的数据源；truncated = 覆盖不完整） */
    indexLinks(dir: string): Promise<{
      ok: boolean
      data?: WorkspaceLinkIndex
      error?: { code: string; message?: string }
    }>
    /** 全工作区标签索引（侧栏标签视图数据源；truncated = 覆盖不完整） */
    indexTags(dir: string): Promise<{
      ok: boolean
      data?: WorkspaceTagIndex
      error?: { code: string; message?: string }
    }>
    index: {
      load(root?: string): Promise<{ ok: boolean; data?: WorkspaceIndex | null; error?: { code: string; message?: string } }>
      refresh(root?: string): Promise<{ ok: boolean; data?: { index: WorkspaceIndex; generation: number; complete: boolean; truncated: boolean }; error?: { code: string; message?: string } }>
      cancel(root?: string): Promise<{ ok: boolean; error?: { code: string; message?: string } }>
      onEvent(listener: (event: WorkspaceIndexEvent) => void): () => void
    }
  }
  workspaceState: {
    load(): Promise<WorkspaceStateResult<WorkspaceStateBundle>>
    saveSettings(value: WorkspaceSettingsState): Promise<WorkspaceStateResult>
    saveLayout(value: WorkspaceLayoutState): Promise<WorkspaceStateResult>
    saveDocuments(value: WorkspaceDocumentsState): Promise<WorkspaceStateResult>
  }
  settings: {
    get(key: string): Promise<{ ok: boolean; data?: unknown; error?: { code: string; message?: string } }>
    set(key: string, value: unknown): Promise<{ ok: boolean; error?: { code: string; message?: string } }>
    /** 写入自定义主题 CSS（主进程校验体积与形状；null = 移除主题） */
    setCustomCss(value: { name: string; content: string } | null): Promise<{ ok: boolean; error?: { code: string; message?: string } }>
    /** 写入导出模板 CSS（HTML/PDF 导出用；校验同上；null = 移除恢复默认样式） */
    setExportCss(value: { name: string; content: string } | null): Promise<{ ok: boolean; error?: { code: string; message?: string } }>
    upsertDraft(id: string, content: string): Promise<{ ok: boolean; error?: { code: string; message?: string } }>
    deleteDraft(id: string): Promise<{ ok: boolean; error?: { code: string; message?: string } }>
  }
  history: {
    /** 记录一次保存后的快照（recorded=false = 内容未变化或超出快照限制被跳过） */
    record(path: string): Promise<{ ok: boolean; data?: { recorded: boolean }; error?: { code: string; message?: string } }>
    /** 列出某文件的历史快照（时间戳 + 字节数，新到旧） */
    list(path: string): Promise<{
      ok: boolean
      data?: { snapshots: { t: number; size: number }[] }
      error?: { code: string; message?: string }
    }>
    /** 读取指定时间戳的快照内容 */
    read(path: string, t: number): Promise<{
      ok: boolean
      data?: { content: string }
      error?: { code: string; message?: string }
    }>
  }
}

/** 文件打开结果（encoding 为自动探测的源编码：UTF-8/GBK/UTF-16LE/UTF-16BE，保存时写回原编码） */
export interface FileResult {
  ok: boolean
  data?: {
    path: string
    name: string
    content: string
    modifiedTime: number
    encoding?: string
  }
  error?: { code: string; message?: string }
}

/** 目录树节点 */
export interface FolderTreeNode {
  name: string
  path: string
  /** 存在则为文件夹，否则为 .md 文件 */
  children?: FolderTreeNode[]
}

/** 打开文件夹结果（truncated：目录树超出节点预算被截断） */
export interface FolderResult {
  ok: boolean
  data?: {
    path: string
    name: string
    tree: FolderTreeNode[]
    truncated: boolean
  }
  error?: { code: string; message?: string }
}

/** 文件保存结果（error.code 为 CONFLICT 表示文件已被外部修改） */
export interface SaveResult {
  ok: boolean
  data?: { modifiedTime: number }
  error?: { code: string; message?: string }
}

/** 另存为结果 */
export interface SaveAsResult {
  ok: boolean
  data?: { path: string; name: string; modifiedTime?: number }
  error?: { code: string; message?: string }
}

/** 图片保存结果 */
export interface ImageResult {
  ok: boolean
  data?: { path: string; name: string; relativePath?: string }
  error?: { code: string; message?: string }
}

declare global {
  interface Window {
    desktopAPI: DesktopAPI
  }
}
