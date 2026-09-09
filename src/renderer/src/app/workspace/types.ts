import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { SaveResult } from '../../../../preload/api'
import type { OpenFile } from '../../components/Sidebar'
import type { PendingDraft } from '../../hooks/useDraftPersistence'

/**
 * 文档会话暴露给工作区文件操作的窄桥接。
 *
 * 工作区模块只经此接口打开文档、迁移会话记录（id/内容/基线/mtime/编码），
 * 不接触 document-session 的内部子 Hook 与自动保存队列实现。
 * ref 镜像成员供 await 竞态期间读取最新值（连续重命名 A-L3、
 * 切换标签后回写 H3/M2/M3），setter 把就地迁移同步到 React 状态；
 * id 口径为 file-路径 / untitled-N，与 useDocumentSession 保持一致。
 */
export interface DocumentWorkspaceBridge {
  /* ── 打开 ── */

  /** 按树路径打开工作区文档（带读取请求守卫，返回是否成功打开） */
  openDocumentPath(path: string, pinned?: boolean): Promise<boolean>
  /** 重开工作区目录：silent=true 不重置布局记录，preserveActiveTab=true 保持当前标签 */
  openFolder(path?: string, silent?: boolean, preserveActiveTab?: boolean): Promise<void>

  /* ── 结构变更前落账未保存内容 ── */

  /** 读指定文档实时内容（活动文件读编辑器实时值，防抖窗口内不滞后） */
  liveContentOf(fileId: string): string
  /** 带编码降级与冲突检测的写盘；失败/CONFLICT 时由调用方决定中止与文案 */
  saveWithEncodingFallback(
    path: string,
    content: string,
    expectedMtime: number | undefined,
    fileId: string,
    interactive?: boolean,
  ): Promise<SaveResult>
  /** 把防抖窗口内的编辑器输入立即落账到 contents（移动文件夹前必须调用） */
  flushEditorContent(): void
  /** 替换编辑器内容并同步会话状态（移动后按新目录重渲染相对图片路径） */
  replaceEditorContent(
    fileId: string,
    content: string,
    mode?: 'ignore' | 'initialize' | 'update',
  ): void

  /* ── 标签切换与草稿 ── */

  switchFile(id: string): void
  clearDraft(id: string): Promise<void>

  /* ── 会话记录就地迁移（ref 镜像 + React setter） ── */

  openFilesRef: MutableRefObject<OpenFile[]>
  contentsRef: MutableRefObject<Record<string, string>>
  activeFileIdRef: MutableRefObject<string>
  /** 脏检查基线（INITIAL_OR_SAVED）：结构变更后新 id 的基线随之搬迁 */
  initialOrSavedRef: MutableRefObject<Record<string, string>>
  /** 防抖中的待写草稿：源 id 迁移后同步改写目标 id，避免写回旧路径 */
  draftPendingRef: MutableRefObject<PendingDraft | null>
  setOpenFiles: Dispatch<SetStateAction<OpenFile[]>>
  setContents: Dispatch<SetStateAction<Record<string, string>>>
  setSavedMap: Dispatch<SetStateAction<Record<string, boolean>>>
  setFileMtime: Dispatch<SetStateAction<Record<string, number>>>
  setEncodingMap: Dispatch<SetStateAction<Record<string, string>>>
  setActiveFileId: Dispatch<SetStateAction<string>>
  setDocTitle: Dispatch<SetStateAction<string>>
}
