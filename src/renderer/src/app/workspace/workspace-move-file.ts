import type { Dispatch, SetStateAction } from 'react'
import type { OpenFile } from '../../components/Sidebar'
import type { DocumentWorkspaceBridge } from './types'
import { mtimeOfFile, needsDocumentSave } from './workspace-file-pre-save'

export interface WorkspaceMoveFileDeps {
  openFiles: OpenFile[]
  bridge: DocumentWorkspaceBridge
  setToast: Dispatch<SetStateAction<string>>
  refreshWorkspace: () => Promise<void>
  onWorkspacePathRemapped?: (oldAbsolutePath: string, newAbsolutePath: string) => void
}

/**
 * 工作区移动文件/文件夹：落账、脏文件写盘、会话记录迁移与活动标签 id 更新。
 * 从 useWorkspaceFiles 拆出以保持 hook 文件低于 450 行门禁。
 */
export async function runWorkspaceMoveFile(
  path: string,
  targetDir: string,
  { openFiles, bridge, setToast, refreshWorkspace, onWorkspacePathRemapped }: WorkspaceMoveFileDeps,
): Promise<boolean> {
  if (!window.desktopAPI) return false
  const {
    liveContentOf,
    saveWithEncodingFallback,
    clearDraft,
    replaceEditorContent,
    flushEditorContent,
    leaveCurrentDocument,
    openFilesRef,
    contentsRef,
    activeFileIdRef,
    fileMtimeRef,
    initialOrSavedRef,
    draftPendingRef,
    setOpenFiles,
    setContents,
    setSavedMap,
    setFileMtime,
    setEncodingMap,
    setActiveFileId,
  } = bridge

  const normalizePathForCompare = (value: string) => {
    const normalized = value.replace(/\\/g, '/')
    return window.desktopAPI?.platform === 'win32' ? normalized.toLowerCase() : normalized
  }
  const sourceForCompare = normalizePathForCompare(path)
  const isUnder = (value: string) => {
    const candidate = normalizePathForCompare(value)
    return candidate === sourceForCompare || candidate.startsWith(`${sourceForCompare}/`)
  }
  const currentActive = activeFileIdRef.current
  const activeIsMoved = currentActive.startsWith('file-') && isUnder(currentActive.slice(5))
  if (activeIsMoved && !(await leaveCurrentDocument())) return false
  if (activeIsMoved) flushEditorContent()
  const dirty = openFiles.filter(
    (f) => f.path && isUnder(f.path) && needsDocumentSave(f.id, liveContentOf, initialOrSavedRef),
  )
  for (const f of dirty) {
    const saveRes = await saveWithEncodingFallback(
      f.path!,
      liveContentOf(f.id),
      mtimeOfFile(f.id, fileMtimeRef),
      f.id,
      true,
    )
    if (!saveRes.ok) {
      setToast(
        saveRes.error?.code === 'CONFLICT'
          ? `「${f.name}」已被外部修改，已中止移动`
          : '移动前保存失败，已中止',
      )
      return false
    }
    if (saveRes.data) {
      initialOrSavedRef.current[f.id] = contentsRef.current[f.id] ?? ''
      setFileMtime((prev) => ({ ...prev, [f.id]: saveRes.data!.modifiedTime }))
    }
  }
  const res = await window.desktopAPI.workspace.moveFile(path, targetDir)
  if (!res.ok || !res.data) {
    setToast(res.error?.code === 'EXISTS' ? '目标目录已存在同名文件' : '移动失败')
    return false
  }
  const newPath = res.data.path
  const mapPath = (p: string) => {
    if (p === path) return newPath
    const pNorm = normalizePathForCompare(p)
    const pathNorm = normalizePathForCompare(path)
    if (pNorm === pathNorm) return newPath
    if (pNorm.startsWith(`${pathNorm}/`)) return newPath + p.slice(path.length)
    return p
  }
  const movedFiles = openFilesRef.current.map((file) => {
    if (!file.path || !isUnder(file.path)) return file
    const nextPath = mapPath(file.path)
    return {
      ...file,
      id: `file-${nextPath}`,
      name: nextPath.split(/[\\/]/).pop() ?? file.name,
      path: nextPath,
    }
  })
  openFilesRef.current = movedFiles
  setOpenFiles(movedFiles)
  setContents((prev) => {
    let changed = false
    const next: Record<string, string> = {}
    for (const [id, val] of Object.entries(prev)) {
      if (id.startsWith('file-') && isUnder(id.slice(5))) {
        next[`file-${mapPath(id.slice(5))}`] = val
        changed = true
      } else {
        next[id] = val
      }
    }
    return changed ? next : prev
  })
  {
    let refChanged = false
    const nextRef: Record<string, string> = {}
    for (const [id, val] of Object.entries(contentsRef.current)) {
      if (id.startsWith('file-') && isUnder(id.slice(5))) {
        nextRef[`file-${mapPath(id.slice(5))}`] = val
        refChanged = true
      } else {
        nextRef[id] = val
      }
    }
    if (refChanged) contentsRef.current = nextRef
  }
  for (const [id, val] of Object.entries({ ...initialOrSavedRef.current })) {
    if (id.startsWith('file-') && isUnder(id.slice(5))) {
      initialOrSavedRef.current[`file-${mapPath(id.slice(5))}`] = val
      delete initialOrSavedRef.current[id]
    }
  }
  setSavedMap((prev) => {
    let changed = false
    const next: Record<string, boolean> = {}
    for (const [id, val] of Object.entries(prev)) {
      if (id.startsWith('file-') && isUnder(id.slice(5))) {
        next[`file-${mapPath(id.slice(5))}`] = true
        changed = true
      } else {
        next[id] = val
      }
    }
    return changed ? next : prev
  })
  const dp = draftPendingRef.current
  if (dp && dp.id.startsWith('file-') && isUnder(dp.id.slice(5))) {
    draftPendingRef.current = { id: `file-${mapPath(dp.id.slice(5))}`, content: dp.content }
  }
  for (const f of openFiles) {
    if (f.path && isUnder(f.path)) void clearDraft(`file-${f.path}`)
  }
  setEncodingMap((prev) => {
    let changed = false
    const next: Record<string, string> = {}
    for (const [id, val] of Object.entries(prev)) {
      if (id.startsWith('file-') && isUnder(id.slice(5))) {
        next[`file-${mapPath(id.slice(5))}`] = val
        changed = true
      } else {
        next[id] = val
      }
    }
    return changed ? next : prev
  })
  setFileMtime((prev) => {
    const next: Record<string, number> = {}
    for (const [id, val] of Object.entries(prev)) {
      if (id.startsWith('file-') && isUnder(id.slice(5))) {
        next[`file-${mapPath(id.slice(5))}`] = val
      } else {
        next[id] = val
      }
    }
    next[`file-${newPath}`] = res.data!.modifiedTime || next[`file-${newPath}`] || 0
    return next
  })
  const currentId = activeFileIdRef.current
  if (currentId.startsWith('file-') && isUnder(currentId.slice(5))) {
    const nid = `file-${mapPath(currentId.slice(5))}`
    const live = liveContentOf(currentId)
    activeFileIdRef.current = nid
    setActiveFileId(nid)
    replaceEditorContent(nid, live, 'update')
  }
  setToast('已移动')
  onWorkspacePathRemapped?.(path, newPath)
  await refreshWorkspace()
  return true
}
