import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { OpenFile, WorkspaceInfo } from '../../components/Sidebar'
import { getNeighborTabId, isDocumentDirty } from '../../lib/document-tabs'
import { sameDesktopFilePath } from '../../lib/desktop-file-path'
import type { DocumentWorkspaceBridge } from './types'

/** Windows 大小写不敏感的路径相等判定（与 useDocumentSession/move 同口径）：
 *  删除/重命名按树路径寻址标签时避免大小写差异留下指向已删文件的幽灵标签 */
const sameFilePath = (a: string | undefined, b: string | undefined): boolean =>
  sameDesktopFilePath(a, b, window.desktopAPI?.platform === 'win32')

export interface UseWorkspaceFilesOptions {
  workspace: WorkspaceInfo | null
  /** 打开文件快照：移动文件夹前圈定受影响的脏文件（await 期间以 ref 为准） */
  openFiles: OpenFile[]
  savedMap: Record<string, boolean>
  fileMtime: Record<string, number>
  /** 会话能力窄桥接（App 以 useMemo 从 useDocumentSession 公共 API 组装） */
  bridge: DocumentWorkspaceBridge
  setToast: Dispatch<SetStateAction<string>>
}

/**
 * 工作区文件操作：新建/重命名/删除/移动（含每类操作前置的"落账未保存内容 +
 * 冲突检测保存"与完整的状态迁移），以及目录刷新与新窗口打开。
 * 状态迁移经 DocumentWorkspaceBridge 访问会话记录，id 口径必须与
 * useDocumentSession 同步（file-路径 / untitled-N），任何一步改动都需
 * 同时验证编辑器同步、自动保存队列与草稿持久化。
 */
export function useWorkspaceFiles({
  workspace,
  openFiles,
  savedMap,
  fileMtime,
  bridge,
  setToast,
}: UseWorkspaceFilesOptions): {
  /** 文件操作返回是否真正完成（false = 冲突/失败已提示并中止），供控制器聚合结果 */
  handleCreateFile: (dirPath: string, name?: string) => Promise<boolean>
  handleRenameFile: (path: string, newName: string) => Promise<boolean>
  handleDeleteFile: (path: string) => Promise<boolean>
  handleMoveFile: (path: string, targetDir: string) => Promise<boolean>
  handleOpenInNewWindow: (path: string) => void
  refreshWorkspace: () => Promise<void>
} {
  const {
    openDocumentPath: handleSelectWorkspaceFile,
    openFolder: handleOpenFolder,
    liveContentOf,
    saveWithEncodingFallback,
    clearDraft,
    replaceEditorContent,
    switchFile,
    flushEditorContent,
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
    setDocTitle,
  } = bridge
  const mtimeOf = (fileId: string): number | undefined =>
    fileMtimeRef.current[fileId] ?? fileMtime[fileId]
  const flushActiveIf = (fileId: string): void => {
    if (activeFileIdRef.current === fileId) flushEditorContent()
  }
  const needsSave = (fileId: string): boolean =>
    isDocumentDirty(liveContentOf(fileId), initialOrSavedRef.current[fileId] ?? '')
  /** 重新扫描工作区目录（增删改后刷新文件树）。
   *  刷新只是同步文件结构，不改变编辑上下文：preserveActiveTab=true
   *  禁止恢复路径按布局记录重放活动标签——否则新建/重命名提交后，
   *  用户可能被从正在编辑的标签拽回布局中记录的旧标签（首次打开
   *  工作区时的活动文档），再被后续流程切走，表现为编辑器来回跳转。 */
  const refreshWorkspace = useCallback(async () => {
    if (!workspace) return
    await handleOpenFolder(workspace.path, true, true)
  }, [workspace, handleOpenFolder])

  const handleCreateFile = useCallback(
    async (dirPath: string, name = '新文档.md'): Promise<boolean> => {
      if (!window.desktopAPI) return false
      const res = await window.desktopAPI.workspace.createFile(dirPath, name)
      if (!res.ok) {
        setToast(res.error?.code === 'EXISTS' ? '同名文件已存在' : '新建失败')
        return false
      }
      await refreshWorkspace()
      if (res.data) await handleSelectWorkspaceFile(res.data.path)
      return true
    },
    [refreshWorkspace, handleSelectWorkspaceFile, setToast],
  )

  const handleRenameFile = useCallback(
    async (path: string, newName: string): Promise<boolean> => {
      if (!newName.trim()) {
        setToast('文件名不能为空')
        return false
      }
      if (!window.desktopAPI) return false
      // 先写回未保存内容，避免重命名丢失编辑（带冲突检测：外部修改过的不静默覆盖，中止重命名）。
      // A-L3：记录一律按"当前 path 查到的 id"寻址而非闭包里的旧 id——
      // 连续两次重命名（A→B 后立刻 B→C）交错完成时，闭包 oldId 已过期，
      // 用旧 id 迁移会把记录/内容搬到错误键下，产生重复标签 id 或内容丢失
      const currentRecord = openFilesRef.current.find((f) => sameFilePath(f.path, path))
      const currentId = currentRecord?.id ?? `file-${path}`
      flushActiveIf(currentId)
      let pending: string | undefined
      if (needsSave(currentId) && contentsRef.current[currentId] !== undefined) {
        pending = liveContentOf(currentId)
        // interactive：GBK 内容含不可映射字符时弹降级确认而非误报"保存失败，已中止"
        const saveRes = await saveWithEncodingFallback(path, pending, mtimeOf(currentId), currentId, true)
        if (!saveRes.ok) {
          setToast(
            saveRes.error?.code === 'CONFLICT'
              ? `「${path.split(/[\\/]/).pop()}」已被外部修改，已中止重命名`
              : '重命名前保存失败，已中止',
          )
          return false
        }
        if (saveRes.data) {
          initialOrSavedRef.current[currentId] = pending
          setFileMtime((prev) => ({ ...prev, [currentId]: saveRes.data!.modifiedTime }))
        }
      }
      const res = await window.desktopAPI.workspace.renameFile(path, newName)
      if (!res.ok || !res.data) {
        if (res.error?.code === 'EXISTS') {
          setToast('同名文件已存在')
          return false
        }
        if (res.error?.code === 'INVALID_NAME') {
          setToast('文件名不能包含 \\ / : * ? " < > |')
          return false
        }
        setToast('重命名失败')
        return false
      }
      // 就地迁移打开记录/内容/基线/mtime 到新 id，避免旧路径幽灵标签残留。
      // 迁移瞬间再次按原 path 定位记录：若已被另一在途重命名/删除移走则无事可迁
      const newPath = res.data.path
      const finalName = res.data.name
      const newId = `file-${newPath}`
      const recordToMove = openFilesRef.current.find((f) => sameFilePath(f.path, path))
      if (!recordToMove) {
        void clearDraft(`file-${path}`)
        await refreshWorkspace()
        return true
      }
      const srcId = recordToMove.id
      // 迁移谓词与上方 recordToMove 的归一寻址同口径：大小写不同的树路径
      // 也要命中，否则记录不迁移而内容键全部搬走，活动 id 悬空、内容丢失
      const renamedFiles = openFilesRef.current.map((file) =>
        sameFilePath(file.path, path)
          ? { ...file, id: newId, name: finalName, path: newPath }
          : file,
      )
      openFilesRef.current = renamedFiles
      setOpenFiles(renamedFiles)
      setContents((prev) => {
        if (prev[srcId] === undefined) return prev
        const next = { ...prev }
        next[newId] = next[srcId]
        delete next[srcId]
        return next
      })
      // contents 的 ref 镜像同步迁移（与 handleMoveFile 同口径）：
      // 残留旧 id 条目会让后续对 contentsRef 的读取（保存前读 pending、
      // 删除/移动时回写基线）拿到旧键下的空值或幽灵内容
      if (contentsRef.current[srcId] !== undefined) {
        const nextRef = { ...contentsRef.current }
        nextRef[newId] = nextRef[srcId]
        delete nextRef[srcId]
        contentsRef.current = nextRef
      }
      // 基线：若刚写回了 pending，则基线即 pending（磁盘已是该内容），否则沿用旧基线
      initialOrSavedRef.current[newId] =
        pending !== undefined ? pending : (initialOrSavedRef.current[srcId] ?? '')
      delete initialOrSavedRef.current[srcId]
      // mtime 用重命名后的新值，避免旧值导致下次保存误报"外部修改"
      setFileMtime((prev) => {
        const next = { ...prev }
        if (res.data && res.data.modifiedTime > 0) next[newId] = res.data.modifiedTime
        else if (prev[srcId] !== undefined) next[newId] = prev[srcId]
        delete next[srcId]
        return next
      })
      // 源编码同步迁移（GBK 文件重命名后保存仍写回原编码）
      setEncodingMap((prev) => {
        if (prev[srcId] === undefined) return prev
        const next = { ...prev }
        next[newId] = next[srcId]
        delete next[srcId]
        return next
      })
      // savedMap 同步迁移：重命名前刚写回 pending 时磁盘已是该内容，新 id 记为已保存；
      // 否则沿用旧值。漏迁移会让重命名后的首次 Ctrl+S 误弹"未保存确认"或把已保存标为脏
      setSavedMap((prev) => {
        if (prev[srcId] === undefined && pending === undefined) return prev
        const next = { ...prev }
        next[newId] = pending !== undefined ? true : (prev[srcId] ?? true)
        delete next[srcId]
        return next
      })
      // H3：重命名 await 期间用户可能已切到其它标签。用 ref 实时判定，
      // 否则完成回调会把活动标签拽回旧文件、编辑器内容串号
      if (activeFileIdRef.current === srcId) {
        activeFileIdRef.current = newId
        setActiveFileId(newId)
        setDocTitle(finalName)
      }
      // 重命名前内容已写盘，旧草稿清除（含防抖中未落盘的待写项，避免写回旧 id）
      if (draftPendingRef.current?.id === srcId) draftPendingRef.current = null
      void clearDraft(srcId)
      await refreshWorkspace()
      return true
    },
    [savedMap, fileMtime, liveContentOf, saveWithEncodingFallback, refreshWorkspace, clearDraft, flushEditorContent, setToast, openFilesRef, contentsRef, initialOrSavedRef, draftPendingRef, activeFileIdRef, fileMtimeRef, setOpenFiles, setContents, setSavedMap, setFileMtime, setEncodingMap, setActiveFileId, setDocTitle],
  )

  const handleDeleteFile = useCallback(
    async (path: string): Promise<boolean> => {
      if (!window.desktopAPI) return false
      // Windows 大小写不敏感：树路径与已打开标签的路径大小写可能不同，
      // 按归一比较取真实标签 id，否则删除后写回被跳过、标签残留成幽灵
      const delRecord = openFilesRef.current.find((f) => sameFilePath(f.path, path))
      const delId = delRecord?.id ?? `file-${path}`
      flushActiveIf(delId)
      // 删除前先写回未保存内容，避免编辑丢失（与 rename/move 保持一致）
      if (needsSave(delId)) {
        // interactive：GBK 含不可映射字符时弹降级确认而非误报"保存失败，已取消删除"
        const saveRes = await saveWithEncodingFallback(
          path,
          liveContentOf(delId),
          mtimeOf(delId),
          delId,
          true,
        )
        if (!saveRes.ok) {
          setToast(
            saveRes.error?.code === 'CONFLICT'
              ? `「${path.split(/[\\/]/).pop()}」已被外部修改，已取消删除`
              : '删除前保存失败，已取消删除',
          )
          return false
        }
        if (saveRes.data) {
          initialOrSavedRef.current[delId] = contentsRef.current[delId] ?? ''
          setFileMtime((prev) => ({ ...prev, [delId]: saveRes.data!.modifiedTime }))
        }
      }
      const res = await window.desktopAPI.workspace.deleteFile(path)
      if (!res.ok) {
        setToast('删除失败')
        return false
      }
      // 相邻标签在删除前从实时列表快照（删除后列表已无该 id，无从取相邻项）；
      // 切换时 switchFile 会再按最新列表校验，快照过期（await 期间被关闭）则回退首标签
      const neighborId = getNeighborTabId(openFilesRef.current, delId)
      // 立即同步供编辑器异步回调读取的镜像，避免状态提交前继续写入已删除文件。
      openFilesRef.current = openFilesRef.current.filter((file) => file.id !== delId)
      setOpenFiles((prev) => prev.filter((f) => f.id !== delId))
      setContents((prev) => {
        const next = { ...prev }
        delete next[delId]
        return next
      })
      setSavedMap((prev) => {
        const next = { ...prev }
        delete next[delId]
        return next
      })
      setFileMtime((prev) => {
        const next = { ...prev }
        delete next[delId]
        return next
      })
      setEncodingMap((prev) => {
        const next = { ...prev }
        delete next[delId]
        return next
      })
      // 清理残留草稿/基线，避免重启后恢复已删除文件的内容
      if (draftPendingRef.current?.id === delId) draftPendingRef.current = null
      void clearDraft(delId)
      delete initialOrSavedRef.current[delId]
      await refreshWorkspace()
      // M3：删除 await 期间用户可能已切到其它标签。用 ref 实时判定，
      // 否则完成回调会把当前正在编辑的文档切走，未保存输入丢失
      if (activeFileIdRef.current === delId) {
        // 切到相邻标签；快照已过期（await 期间被关闭）时回退到当前首标签，
        // 避免活动 id 悬空指向已删除文件；一个标签都不剩时进入"开始"界面
        const target =
          neighborId && openFilesRef.current.some((f) => f.id === neighborId)
            ? neighborId
            : openFilesRef.current[0]?.id
        if (target) await switchFile(target)
      }
      return true
    },
    [refreshWorkspace, switchFile, clearDraft, savedMap, liveContentOf, fileMtime, saveWithEncodingFallback, flushEditorContent, setToast, openFilesRef, contentsRef, initialOrSavedRef, draftPendingRef, activeFileIdRef, fileMtimeRef, setOpenFiles, setContents, setSavedMap, setFileMtime, setEncodingMap],
  )

  const handleMoveFile = useCallback(
    async (path: string, targetDir: string): Promise<boolean> => {
      if (!window.desktopAPI) return false
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
      // 迁移前先把活动文档实时内容落账（用户可能刚打字，防抖回调未到）。
      // 必须在 openFilesRef 迁移之前调用：flush 的守卫按 openFilesRef 判定文件
      // 是否仍存在，迁移后旧 id 已被替换，flush 会静默跳过——末次输入就丢了。
      // 同时保证下方脏文件循环写入的基线取自最新内容（INITIAL_OR_SAVED 与磁盘一致）
      if (activeIsMoved) flushEditorContent()
      const dirty = openFiles.filter(
        (f) => f.path && isUnder(f.path) && needsSave(f.id),
      )
      for (const f of dirty) {
        // interactive：GBK 含不可映射字符时弹降级确认而非误报"移动前保存失败，已中止"
        const saveRes = await saveWithEncodingFallback(
          f.path!,
          liveContentOf(f.id),
          mtimeOf(f.id),
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
        // 写回成功后同步基线与 mtime（用旧 id，后续迁移会按序搬走）；
        // 否则陈旧基线造成"假脏状态"，且移动文件夹时子文件的旧 mtime 会导致下次保存误报 CONFLICT
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
      // Windows 大小写不敏感：isUnder 已归一化匹配，mapPath 必须用相同的归一化
      // 逻辑定位前缀，否则记录路径与树路径大小写不同时 slice 错位产生幽灵标签
      const mapPath = (p: string) => {
        if (p === path) return newPath
        const pNorm = normalizePathForCompare(p)
        const pathNorm = normalizePathForCompare(path)
        if (pNorm === pathNorm) return newPath
        if (pNorm.startsWith(`${pathNorm}/`)) return newPath + p.slice(path.length)
        return p
      }
      // 迁移已打开文件的 id（file-旧路径 → file-新路径），文件夹移动时子文件一并迁移
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
      // contents 的 ref 镜像同步迁移（setContents 只更新 state）：
      // 残留旧 id 条目会让后续 liveContentOf 兜底对已移动文件读到空串
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
      // 脏检查基线与 mtime 同步迁移
      for (const [id, val] of Object.entries({ ...initialOrSavedRef.current })) {
        if (id.startsWith('file-') && isUnder(id.slice(5))) {
          initialOrSavedRef.current[`file-${mapPath(id.slice(5))}`] = val
          delete initialOrSavedRef.current[id]
        }
      }
      // 保存状态迁移：脏文件已在移动前写盘，新 id 直接标记为干净；
      // 不迁移会导致旧 id 的未保存状态永久残留，每次关窗都误弹确认框
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
      // 清理被移动文件的旧路径草稿（内容已写盘，避免重启后恢复已不存在的旧路径）；
      // 防抖中的待写草稿随 id 迁移到新路径，避免写回旧路径后残留
      const dp = draftPendingRef.current
      if (dp && dp.id.startsWith('file-') && isUnder(dp.id.slice(5))) {
        draftPendingRef.current = { id: `file-${mapPath(dp.id.slice(5))}`, content: dp.content }
      }
      for (const f of openFiles) {
        if (f.path && isUnder(f.path)) void clearDraft(`file-${f.path}`)
      }
      // 源编码映射同步迁移（GBK 文件移动后状态栏仍显示真实源编码）
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
        // 移动项自身用主进程返回的最新 mtime
        next[`file-${newPath}`] = res.data!.modifiedTime || next[`file-${newPath}`] || 0
        return next
      })
      // M2：移动 await 期间用户可能已切到其它标签。用 ref 实时判定当前
      // 活动文件——不能用起始快照：
      // - 起始活动被移动但期间切走的：切回会拽回用户正在编辑的标签；
      // - 起始活动未移动但期间切到被移动文件的：必须迁移其 id，
      //   否则 activeFileIdRef 仍指向已从 openFiles 消失的旧 id，
      //   后续输入被 handleEditorChange 守卫丢弃（新 id 已在列表，旧 id 不在）
      const currentId = activeFileIdRef.current
      if (currentId.startsWith('file-') && isUnder(currentId.slice(5))) {
        const nid = `file-${mapPath(currentId.slice(5))}`
        // F1：必须先取实时内容再改写 activeFileIdRef——liveContentOf 的快路径
        // 要求 id === activeFileIdRef.current，而上方 contentsRef 已迁移
        // （旧 id 键被删除、内容搬至 nid 键）；先改写 ref 会让兜底读到空串，
        // 编辑器被清空、状态栏显示未保存，下次自动保存把空内容写回磁盘覆盖原文。
        // 取到的是实时值（上方已 flush 落账，防抖窗口内也不滞后）
        const live = liveContentOf(currentId)
        activeFileIdRef.current = nid
        setActiveFileId(nid)
        // M7：移动改变了文档目录，编辑器内 mdimg 仍按旧目录解析；
        // 按新目录重新迁移并重渲染，否则下一键保存就把 mdimg:///旧目录/ 绝对路径写进文件
        replaceEditorContent(nid, live, 'update')
      }
      setToast('已移动')
      await refreshWorkspace()
      return true
    },
    [openFiles, savedMap, fileMtime, liveContentOf, saveWithEncodingFallback, refreshWorkspace, clearDraft, replaceEditorContent, flushEditorContent, setToast, openFilesRef, contentsRef, initialOrSavedRef, draftPendingRef, activeFileIdRef, fileMtimeRef, setOpenFiles, setContents, setSavedMap, setFileMtime, setEncodingMap, setActiveFileId],
  )

  /** 右键在新窗口打开文件（U7） */
  const handleOpenInNewWindow = useCallback((path: string) => {
    void window.desktopAPI?.window.newWindowWithFile(path)
  }, [])

  return {
    handleCreateFile,
    handleRenameFile,
    handleDeleteFile,
    handleMoveFile,
    handleOpenInNewWindow,
    refreshWorkspace,
  }
}
