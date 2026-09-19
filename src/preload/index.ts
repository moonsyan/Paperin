import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { CHANNELS } from '../shared/ipc/channels'
import type { WorkspaceIndexEvent } from '../shared/workspace-index'

type SystemOpenFileListener = (path: string) => void
const systemOpenFileListeners = new Set<SystemOpenFileListener>()
const pendingSystemOpenFiles: string[] = []

// Register eagerly so an association event sent as soon as the page loads is
// retained until React has restored the existing workspace/session.
ipcRenderer.on(CHANNELS.WINDOW_OPEN_FILE, (_event, path: unknown) => {
  if (typeof path !== 'string' || !path) return
  if (systemOpenFileListeners.size === 0) {
    const key = process.platform === 'win32' ? path.toLocaleLowerCase('en-US') : path
    const duplicate = pendingSystemOpenFiles.some((pending) =>
      (process.platform === 'win32' ? pending.toLocaleLowerCase('en-US') : pending) === key,
    )
    if (!duplicate && pendingSystemOpenFiles.length < 20) pendingSystemOpenFiles.push(path)
    return
  }
  systemOpenFileListeners.forEach((listener) => listener(path))
})

/**
 * 暴露给渲染进程的安全 API
 * 渲染进程通过 window.desktopAPI 访问
 */
const desktopAPI = {
  /** 运行平台（darwin / win32 / linux），渲染进程用于适配窗口控件 */
  platform: process.platform,

  window: {
    /** 同步标题栏覆盖层颜色（Windows 下跟随主题） */
    setTitlebarColor: (color: string, symbolColor?: string) =>
      ipcRenderer.invoke(CHANNELS.WINDOW_SET_TITLEBAR, { color, symbolColor }),
    /** 开关拼写检查（会话级，可选语言） */
    setSpellcheck: (enabled: boolean, language?: string) =>
      ipcRenderer.invoke(CHANNELS.WINDOW_SET_SPELLCHECK, { enabled, language }),
    /** 新建窗口（fresh 模式，不恢复会话） */
    newWindow: () => ipcRenderer.invoke(CHANNELS.WINDOW_NEW),
    /** 新建窗口并打开指定文件（fresh 模式） */
    newWindowWithFile: (path: string) =>
      ipcRenderer.invoke(CHANNELS.WINDOW_NEW_WITH_FILE, path),
    /** Subscribe to OS file-association requests; queued startup requests flush once. */
    onOpenFile: (listener: SystemOpenFileListener) => {
      systemOpenFileListeners.add(listener)
      const pending = pendingSystemOpenFiles.splice(0)
      pending.forEach((path) => listener(path))
      return () => systemOpenFileListeners.delete(listener)
    },
    /** 同步未保存状态到主进程（关闭时弹原生确认框用） */
    setUnsaved: (unsaved: boolean) => ipcRenderer.send(CHANNELS.WINDOW_SET_UNSAVED, unsaved),
  },

  document: {
    /** 打开文件对话框，选择并读取 Markdown 文件 */
    open: () => ipcRenderer.invoke(CHANNELS.FILE_OPEN),

    /** 选择资源包导出的目标目录（独立步骤：取消发生在任何写入之前） */
    pickExportDirectory: (title?: string) =>
      ipcRenderer.invoke(CHANNELS.FILE_PICK_EXPORT_DIR, { title }),

    /** 写出 HTML 资源包（index.html + assets/，主进程临时目录原子重命名） */
    exportBundle: (request: {
      outputDir: string
      folderName: string
      html: string
      assets: Array<{ fileName: string; data: Uint8Array }>
    }) => ipcRenderer.invoke(CHANNELS.FILE_EXPORT_BUNDLE, request),

    /** 打开文件夹（返回 Markdown 目录树）；传 path 时跳过对话框（会话恢复用） */
    openFolder: (path?: string) =>
      ipcRenderer.invoke(CHANNELS.FILE_OPEN_FOLDER, path ? { path } : undefined),

    /** 按路径直接读取文件（仅限已授权路径：工作区/对话框/会话信任清单） */
    read: (path: string) => ipcRenderer.invoke(CHANNELS.FILE_READ, path),

    /** 读取拖入的文件。路径在本层用 webUtils 解析：只有真实 OS 拖拽产生的
     *  File 才带路径，渲染层伪造的 File 解析为空字符串并被主进程拒绝，
     *  页面脚本无法借此读取任意磁盘路径 */
    readDropped: (file: File) => {
      let path = ''
      try {
        path = webUtils.getPathForFile(file)
      } catch {
        path = ''
      }
      if (!path) {
        return Promise.resolve({ ok: false, error: { code: 'INVALID_PATH' } })
      }
      return ipcRenderer.invoke(CHANNELS.FILE_READ_DROPPED, path)
    },

    /** 读取受信任 mdimg:// URL 指向的图片为 base64 data URL（导出内联用）。
     *  渲染层 fetch() 自定义 scheme 被 Blink 拒绝，必须走主进程校验读取 */
    readImageInline: (src: string) =>
      ipcRenderer.invoke(CHANNELS.FILE_READ_IMAGE_INLINE, src),

    /** 仅读取文件 mtime（草稿恢复前校验基线新鲜度用） */
    stat: (path: string) => ipcRenderer.invoke(CHANNELS.FILE_STAT, path),

    /** 保存到指定路径（expectedMtime 用于外部冲突检测；forceOverwrite 表示用户已确认覆盖） */
    save: (path: string, content: string, expectedMtime?: number, encoding?: string, forceOverwrite?: boolean) =>
      ipcRenderer.invoke(CHANNELS.FILE_SAVE, { path, content, expectedMtime, encoding, forceOverwrite }),

    /** 另存为，弹出保存对话框（可选自定义文件过滤器，用于导出 HTML 等） */
    saveAs: (
      content: string,
      options?: {
        filters?: { name: string; extensions: string[] }[]
        defaultPath?: string
      },
    ) => ipcRenderer.invoke(CHANNELS.FILE_SAVE_AS, { content, ...options }),

    /** 保存剪贴板/拖入的图片，返回磁盘路径 */
    saveImage: (
      dataUrl: string,
      hints?: {
        docPath?: string
        workspacePath?: string
        workspaceAttachmentDirectory?: string | null
        globalAttachmentDirectory?: string | null
      },
    ) => ipcRenderer.invoke(CHANNELS.FILE_SAVE_IMAGE, { dataUrl, ...hints }),

    /** 导出 PDF（主进程隐藏窗口渲染后打印，支持纸张/页边距/页眉页脚选项） */
    exportPdf: (
      html: string,
      defaultName: string,
      options?: {
        pageSize?: 'A4' | 'Letter' | 'A5' | 'Legal'
        margins?: 'narrow' | 'standard' | 'wide'
        headerFooter?: boolean
      },
    ) => ipcRenderer.invoke(CHANNELS.FILE_EXPORT_PDF, { html, defaultName, options }),

    /** 通过 pandoc 导出 Word/LaTeX/纯文本/EPUB（未安装 pandoc 时返回 PANDOC_NOT_FOUND） */
    exportPandoc: (markdown: string, defaultTitle: string) =>
      ipcRenderer.invoke(CHANNELS.FILE_EXPORT_PANDOC, { markdown, defaultTitle }),

    /** 零依赖导出 Word（渲染层生成 OOXML 部件，主进程打包 zip 写盘） */
    exportDocx: (
      parts: Record<string, string>,
      media: { name: string; data: Uint8Array }[],
      defaultName: string,
    ) => ipcRenderer.invoke(CHANNELS.FILE_EXPORT_DOCX, { parts, media, defaultName }),

    /** 选择本地 CSS 文件并读取内容（自定义主题导入） */
    pickCss: () => ipcRenderer.invoke(CHANNELS.FILE_PICK_CSS),

    /** 上传图片到已配置的图床（未配置返回 NOT_CONFIGURED） */
    uploadImage: (dataUrl: string) =>
      ipcRenderer.invoke(CHANNELS.IMAGE_UPLOAD, { dataUrl }),
  },

  imageHost: {
    getStatus: () => ipcRenderer.invoke(CHANNELS.IMAGE_HOST_GET_STATUS),
    setConfig: (provider: 'local' | 'smms', token?: string) =>
      ipcRenderer.invoke(CHANNELS.IMAGE_HOST_SET_CONFIG, { provider, token }),
  },

  workspace: {
    getAttachmentDirectory: () =>
      ipcRenderer.invoke(CHANNELS.WORKSPACE_ATTACHMENT_GET),
    setAttachmentDirectory: (value: string | null) =>
      ipcRenderer.invoke(CHANNELS.WORKSPACE_ATTACHMENT_SET, value),
    /** 在目录下新建 Markdown 文件 */
    createFile: (dir: string, name: string) =>
      ipcRenderer.invoke(CHANNELS.FILE_CREATE, { dir, name }),

    /** 重命名文件 */
    renameFile: (path: string, newName: string) =>
      ipcRenderer.invoke(CHANNELS.FILE_RENAME, { path, newName }),

    /** 移动文件/文件夹到目标目录（文件树拖拽用） */
    moveFile: (path: string, targetDir: string) =>
      ipcRenderer.invoke(CHANNELS.FILE_MOVE, { path, targetDir }),

    /** 删除文件（移入回收站） */
    deleteFile: (path: string) =>
      ipcRenderer.invoke(CHANNELS.FILE_DELETE, path),

    /** 列出目录下的图片文件（图片管理面板） */
    listImages: (dirs: string[]) =>
      ipcRenderer.invoke(CHANNELS.FILE_LIST_IMAGES, dirs),

    /** 删除图片（移入回收站） */
    deleteImage: (path: string) =>
      ipcRenderer.invoke(CHANNELS.FILE_DELETE_IMAGE, path),

    /** 工作区全文搜索（逐行子串/正则匹配，返回命中行与预览） */
    search: (
      dir: string,
      query: string,
      caseSensitive?: boolean,
      regex?: boolean,
    ) =>
      ipcRenderer.invoke(CHANNELS.FILE_SEARCH_WORKSPACE, {
        dir,
        query,
        caseSensitive,
        regex,
      }),

    /** 全工作区链接索引（wiki/相对 md 链接提取，反链与图谱数据源） */
    indexLinks: (dir: string) =>
      ipcRenderer.invoke(CHANNELS.WORKSPACE_INDEX_LINKS, { dir }),

    /** 全工作区标签索引（frontmatter tags 提取，侧栏标签视图数据源） */
    indexTags: (dir: string) =>
      ipcRenderer.invoke(CHANNELS.WORKSPACE_INDEX_TAGS, { dir }),
    index: {
      load: (root?: string) => ipcRenderer.invoke(CHANNELS.WORKSPACE_INDEX_LOAD, root ? { root } : undefined),
      refresh: (root?: string) => {
        const request = root ? { root } : undefined
        return ipcRenderer.invoke(CHANNELS.WORKSPACE_INDEX_REFRESH, request)
      },
      cancel: (root?: string) => ipcRenderer.invoke(CHANNELS.WORKSPACE_INDEX_CANCEL, root ? { root } : undefined),
      onEvent: (listener: (event: WorkspaceIndexEvent) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, payload: WorkspaceIndexEvent) => listener(payload)
        ipcRenderer.on(CHANNELS.WORKSPACE_INDEX_EVENT, handler)
        return () => ipcRenderer.removeListener(CHANNELS.WORKSPACE_INDEX_EVENT, handler)
      },
    },
  },

  workspaceState: {
    load: () => ipcRenderer.invoke(CHANNELS.WORKSPACE_STATE_LOAD),
    saveSettings: (value: unknown) =>
      ipcRenderer.invoke(CHANNELS.WORKSPACE_STATE_SAVE_SETTINGS, value),
    saveLayout: (value: unknown) =>
      ipcRenderer.invoke(CHANNELS.WORKSPACE_STATE_SAVE_LAYOUT, value),
    saveDocuments: (value: unknown) =>
      ipcRenderer.invoke(CHANNELS.WORKSPACE_STATE_SAVE_DOCUMENTS, value),
  },

  settings: {
    get: (key: string) => ipcRenderer.invoke(CHANNELS.SETTINGS_GET, key),
    set: (key: string, value: unknown) =>
      ipcRenderer.invoke(CHANNELS.SETTINGS_SET, { key, value }),
    /** 写入自定义主题 CSS（主进程校验体积与形状；通用 set 已禁止该键） */
    setCustomCss: (value: { name: string; content: string } | null) =>
      ipcRenderer.invoke(CHANNELS.SETTINGS_SET_CUSTOM_CSS, value),
    /** 写入导出模板 CSS（HTML/PDF 导出追加在默认样式之后；校验同上） */
    setExportCss: (value: { name: string; content: string } | null) =>
      ipcRenderer.invoke(CHANNELS.SETTINGS_SET_EXPORT_CSS, value),
    upsertDraft: (id: string, content: string) =>
      ipcRenderer.invoke(CHANNELS.SETTINGS_UPSERT_DRAFT, { id, content }),
    deleteDraft: (id: string) => ipcRenderer.invoke(CHANNELS.SETTINGS_DELETE_DRAFT, id),
  },

  history: {
    /** 记录一次保存后的快照（主进程读盘写入 userData/version-history） */
    record: (path: string) => ipcRenderer.invoke(CHANNELS.HISTORY_RECORD, { path }),

    /** 列出某文件的历史快照元数据（时间 + 字节数，新到旧） */
    list: (path: string) => ipcRenderer.invoke(CHANNELS.HISTORY_LIST, { path }),

    /** 读取指定时间戳的快照内容 */
    read: (path: string, t: number) =>
      ipcRenderer.invoke(CHANNELS.HISTORY_READ, { path, t }),
  },
}

contextBridge.exposeInMainWorld('desktopAPI', desktopAPI)

/** 类型导出，供渲染进程使用 */
export type DesktopAPI = typeof desktopAPI
