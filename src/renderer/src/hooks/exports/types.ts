import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { EditorHandle } from '../../components/Editor'
import type { PublishScope } from '../../lib/export-bundle'
import type { CollectionEntry } from '../../lib/document-collection'
import type { DeliveryReport } from '../../lib/delivery-report'

/**
 * useExports 入口参数。集中定义在 exports 子目录，方便各拆分模块按需要
 * 只 pick 自己关心的字段，避免把整包 options 传下去导致耦合。
 */
export interface UseExportsOptions {
  editorRef: MutableRefObject<EditorHandle | null>
  /** 当前文档标题（导出默认文件名与 HTML 页标题） */
  docTitle: string
  activeFileId: string
  /** 活动文档 id 的 ref 镜像：异步导出期间判定用户是否切换了文档 */
  activeFileIdRef: MutableRefObject<string>
  contents: Record<string, string>
  /** 求某文件所在目录（相对图片路径回写用） */
  dirOfFile: (fileId: string) => string | undefined
  setToast: Dispatch<SetStateAction<string>>
  /** 用户自定义导出模板 CSS（追加在默认样式后，可覆盖；null = 默认样式） */
  exportCss?: { name: string; content: string } | null
  /** 解析集合范围的文档条目（读盘 + 标题/顺序提取 + 图片协议转换；
   *  读取失败的文档以含 path 的错误抛出）。未提供时集合范围回退当前文档 */
  resolveCollectionEntries?: (scope: Exclude<PublishScope, { kind: 'document' }>) => Promise<CollectionEntry[]>
  /** 资源包交付报告；不含正文、绝对路径或搜索词 */
  getDeliveryReport?: () => DeliveryReport
}

/**
 * 各导出流程共享的最小上下文：编辑器句柄、活动文档 id ref、Toast、
 * 导出会话 ref。用 Pick 派生，避免每个子 hook 都重复列全部字段。
 */
export type ExportFlowContext = Pick<
  UseExportsOptions,
  'editorRef' | 'activeFileIdRef' | 'setToast'
>
