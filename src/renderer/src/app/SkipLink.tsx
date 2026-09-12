import type { JSX } from 'react'

/** 跳转链接的目标：正文宿主容器（`AppWorkspace` 以它为 `id` 并设 `tabIndex={-1}`） */
export const SKIP_LINK_TARGET_ID = 'editor-content'

/**
 * 键盘跳转链接：作为应用中第一个可聚焦元素存在，让键盘 / 读屏用户跳过顶栏、
 * 侧栏与标签栏直达正文，不必按几十次 Tab。
 *
 * 平时被 `transform` 移出视口上方（`styles/global.css` 的 `.skip-link`），
 * 获得焦点时滑入可见；不使用 `display: none` / `visibility: hidden`，
 * 否则它会掉出 Tab 序列，跳转链接本身也就失效了。
 */
export function SkipLink(): JSX.Element {
  return (
    <a className="skip-link" href={`#${SKIP_LINK_TARGET_ID}`}>
      跳到正文
    </a>
  )
}
