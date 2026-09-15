/**
 * Electron 冒烟探针脚本构建器。
 *
 * CurrentFileBanner 收敛后不再渲染 `.current-file-banner-title`——
 * 文件名契约改由「活动标签 .tab-name + 外部来源 data-source + 正文标记」
 * 三者联合断言，避免冒烟依赖单一易过时的 DOM 结构。
 * 失败诊断只输出有限字段（活动标签名/来源/标签数/hash/桥可用性），
 * 不输出用户路径或正文内容。
 */

/** 系统文件关联步骤：等待活动标签、来源与正文标记一致 */
export const buildAssociationProbeScript = (expectedName: string, bodyMarker: string): string => {
  const nameArg = JSON.stringify(expectedName)
  const markerArg = JSON.stringify(bodyMarker)
  return `(async () => {
  const deadline = Date.now() + 10000
  const readState = () => {
    const banner = document.querySelector('.current-file-banner')
    const activeTabName = document.querySelector('[role="tab"][aria-selected="true"] .tab-name')?.textContent ?? null
    const bodyText =
      document.querySelector('.ProseMirror')?.textContent ??
      document.querySelector('.editor-content')?.textContent ??
      ''
    return {
      source: banner?.getAttribute('data-source') ?? null,
      activeTabName,
      bodyMatched: bodyText.includes(${markerArg}),
      tabs: document.querySelectorAll('[role="tab"]').length,
    }
  }
  while (Date.now() < deadline) {
    const state = readState()
    if (state.source === 'external' && state.activeTabName === ${nameArg} && state.bodyMatched) {
      return { ok: true, tabs: state.tabs }
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  return {
    ok: false,
    ...readState(),
    hash: window.location.hash,
    hasOnOpenFile: typeof window.desktopAPI?.window?.onOpenFile === 'function',
  }
})()`
}

/** 关联去重步骤：读取当前标签数量 */
export const buildTabCountProbeScript = (): string =>
  `Promise.resolve({ tabs: document.querySelectorAll('[role="tab"]').length })`

/** 路径条、顶栏与状态栏对同一无盘文档表达相同的持久化语义。 */
export const buildUnpersistedStatusProbeScript = (kind: 'demo' | 'unnamed', label: string): string => `
(async () => {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const pathKind = document.querySelector('.document-pathbar')?.getAttribute('data-kind')
    const banner = document.querySelector('.current-file-banner')
    const bannerStatus = banner?.querySelector('.current-file-banner-status')?.textContent?.trim() ?? null
    const footerStatus = document.querySelector('.statusbar .st-item')?.textContent?.trim() ?? null
    if (pathKind === ${JSON.stringify(kind)} && banner?.getAttribute('data-storage-kind') === ${JSON.stringify(kind)} && bannerStatus === ${JSON.stringify(label)} && footerStatus === ${JSON.stringify(label)}) {
      return { ok: true }
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  return {
    ok: false,
    pathKind: document.querySelector('.document-pathbar')?.getAttribute('data-kind') ?? null,
    storageKind: document.querySelector('.current-file-banner')?.getAttribute('data-storage-kind') ?? null,
    bannerStatus: document.querySelector('.current-file-banner-status')?.textContent?.trim() ?? null,
    footerStatus: document.querySelector('.statusbar .st-item')?.textContent?.trim() ?? null,
  }
})()`
