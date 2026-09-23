import { CORE_TASK_DISCOVER, CORE_TASK_HEADLINE, CORE_TASK_TAGLINE } from '../../../../shared/product/core-task'
import { ProductIcon } from '../ProductIcon'

interface StartScreenProps {
  /** 新建空白文档 */
  onNew: () => void
  /** 打开单个文件对话框 */
  onOpen: () => void
  /** 打开文件夹（工作区） */
  onOpenFolder: () => void
  /**
   * 当前是否已打开知识库（NEXT-UI-SPEC §7 空状态）：
   * - 无库：主要动作是「打开知识库文件夹」，其次新建/打开文件
   * - 有库：有可继续的本库最近文件时主按钮「继续最近编辑」，否则「在此知识库新建」
   */
  hasWorkspace?: boolean
  /** 打开知识库后的只读兼容说明。不改原文。 */
  notices?: readonly string[]
  /** 本库最近文件的展示名（有值且提供 onContinueRecent 时启用继续写作主按钮） */
  continueRecentLabel?: string
  /** 打开本库最近编辑中的一篇 */
  onContinueRecent?: () => void
  /** 当前生效主题：切换开始页产品图标明/暗 */
  theme?: string
}

/**
 * 「开始」界面：当用户关闭全部标签页时显示，替代原先"自动新建空白文档"的行为。
 * 左侧文件夹树始终保留，用户可从中点击样例文件，或用此处按钮创建/打开文档。
 * 关闭全部标签不会被欢迎页强行接管为重新打开图谱等动作——本组件只提供主动作。
 */
export function StartScreen({
  onNew,
  onOpen,
  onOpenFolder,
  hasWorkspace = false,
  notices = [],
  continueRecentLabel,
  onContinueRecent,
  theme = 'default',
}: StartScreenProps): JSX.Element {
  const canContinueRecent = Boolean(hasWorkspace && continueRecentLabel && onContinueRecent)

  return (
    <div className="start-screen">
      <div className="start-inner">
        <ProductIcon className="start-logo" theme={theme} />
        <h1 className="start-title">Paperin</h1>
        <p className="start-sub">{CORE_TASK_HEADLINE}</p>
        <p className="start-tagline">{CORE_TASK_TAGLINE}</p>
        <div className="start-actions">
          {hasWorkspace ? (
            <>
              {canContinueRecent ? (
                <button type="button" className="start-btn primary" onClick={onContinueRecent}>
                  <svg viewBox="0 0 24 24">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                  继续最近编辑
                </button>
              ) : null}
              <button type="button" className={canContinueRecent ? 'start-btn' : 'start-btn primary'} onClick={onNew}>
                <svg viewBox="0 0 24 24">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                在此知识库新建
              </button>
              <button type="button" className="start-btn" onClick={onOpen}>
                <svg viewBox="0 0 24 24">
                  <path d="M3 7a2 2 0 0 1 2-2h4.2a1 1 0 0 1 .8.4L11.6 7H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                </svg>
                打开文件
              </button>
              <button type="button" className="start-btn" onClick={onOpenFolder}>
                <svg viewBox="0 0 24 24">
                  <path d="M3 7a2 2 0 0 1 2-2h4.2a1 1 0 0 1 .8.4L11.6 7H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-7L9 5.6A2 2 0 0 0 7.6 5H5" />
                </svg>
                打开其他知识库
              </button>
            </>
          ) : (
            <>
              <button type="button" className="start-btn primary" onClick={onOpenFolder}>
                <svg viewBox="0 0 24 24">
                  <path d="M3 7a2 2 0 0 1 2-2h4.2a1 1 0 0 1 .8.4L11.6 7H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-7L9 5.6A2 2 0 0 0 7.6 5H5" />
                </svg>
                打开知识库文件夹
              </button>
              <button type="button" className="start-btn" onClick={onNew}>
                <svg viewBox="0 0 24 24">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                新建文档
              </button>
              <button type="button" className="start-btn" onClick={onOpen}>
                <svg viewBox="0 0 24 24">
                  <path d="M3 7a2 2 0 0 1 2-2h4.2a1 1 0 0 1 .8.4L11.6 7H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                </svg>
                打开文件
              </button>
            </>
          )}
        </div>
        {notices.length > 0 && (
          <ul className="start-notices">
            {notices.map((notice) => <li key={notice}>{notice}</li>)}
          </ul>
        )}
        <ul className="start-discover" aria-label="核心任务可发现动作">
          <li>{CORE_TASK_DISCOVER.materials}</li>
          <li>{CORE_TASK_DISCOVER.template}</li>
          <li>{CORE_TASK_DISCOVER.citation}</li>
        </ul>
        {hasWorkspace ? (
          <p className="start-hint">
            {canContinueRecent
              ? `将打开「${continueRecentLabel}」；也可在侧栏「最近编辑」里另选一篇`
              : '要继续上次写作，可打开侧栏的「最近编辑」列表'}
          </p>
        ) : (
          <p className="start-hint">或点击左侧「示例任务 / 资料来源」中的合成样例（不会写入你的知识库）</p>
        )}
      </div>
    </div>
  )
}
