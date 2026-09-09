import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { $prose } from '@milkdown/kit/utils'

/* ==================== 链接点击打开（对标 Typora） ==================== */

/**
 * Ctrl/Cmd + 点击链接在系统浏览器打开。普通单击保持编辑行为
 * （点击定位光标），与 Typora 的 Cmd/Ctrl+Click 打开链接一致。
 *
 * 经由 window.open 触发主进程 setWindowOpenHandler（src/main/index.ts），
 * 主进程仅放行 http/https/mailto 并转 shell.openExternal；此处再做一次
 * 同口径过滤，避免非安全协议产生无意义的新开窗口请求。
 */

const SAFE_HREF = /^(https?:|mailto:)/i

export const linkClickPlugin = $prose(() =>
  new Plugin({
    key: new PluginKey('link-click-open'),
    props: {
      handleClick(view, _pos, event) {
        if (!event.ctrlKey && !event.metaKey) return false
        const target = event.target
        if (!(target instanceof HTMLElement)) return false
        const anchor = target.closest('a')
        if (!anchor) return false
        const href = anchor.getAttribute('href') ?? ''
        if (!SAFE_HREF.test(href)) return false
        event.preventDefault()
        window.open(href)
        return true
      },
    },
  }),
)
