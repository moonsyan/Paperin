import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'

interface StatusBarProps {
  saved: boolean
  wordCount: number
  lineCount: number
  readTime: number
  /** 光标行（1 起） */
  cursorLine?: number
  /** 光标列（1 起） */
  cursorCol?: number
  /** 光标上方最近的标题 */
  currentHeading?: string
  /** 文档最后修改时间戳（毫秒） */
  modifiedTime?: number
  /** 选中字数（>0 时显示） */
  selectedChars?: number
  /** 当前文件源编码（自动探测，保存统一写回 UTF-8） */
  encoding?: string
  /** 光标所在章节字数（累计含子标题；无章节时不显示） */
  sectionWords?: number
  /** 当前生效字数目标（null = 未设置） */
  goalWords?: number | null
  /** 目标进度百分比（null = 未设置目标） */
  goalPercent?: number | null
  /** 保存/清除当前文档的字数目标覆盖；undefined = 移除覆盖（跟随全局） */
  onGoalChange?: (value: number | undefined) => void
}

/** 目标弹层：打开时预填当前生效目标，Enter 保存、Escape 关闭 */
const GoalPopover = ({
  currentGoal,
  onDone,
  onClose,
}: {
  currentGoal: number | null
  onDone: (value: number | undefined) => void
  onClose: () => void
}): JSX.Element => {
  const [input, setInput] = useState(currentGoal != null ? String(currentGoal) : '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const parsed = Number.parseInt(input, 10)
  const saveable = Number.isFinite(parsed) && parsed > 0

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Enter') return
    event.preventDefault()
    if (saveable) onDone(parsed)
  }

  return (
    <div className="st-goal-pop" role="dialog" aria-label="设置本文档字数目标">
      <label className="st-goal-label" htmlFor="st-goal-input">
        本文档目标字数
      </label>
      <input
        id="st-goal-input"
        ref={inputRef}
        className="st-goal-input"
        type="number"
        min={1}
        step={100}
        placeholder="如 5000"
        value={input}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setInput(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div className="st-goal-actions">
        <button
          type="button"
          className="st-goal-btn-primary"
          disabled={!saveable}
          onClick={() => onDone(parsed)}
        >
          保存
        </button>
        <button type="button" className="st-goal-btn-plain" onClick={() => onDone(undefined)}>
          跟随全局
        </button>
      </div>
    </div>
  )
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  // U3：包含秒数，便于确认刚保存文件的精确时间
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function StatusBar({
  saved,
  wordCount,
  lineCount,
  readTime,
  cursorLine,
  cursorCol,
  currentHeading,
  modifiedTime,
  selectedChars,
  encoding = 'UTF-8',
  sectionWords,
  goalWords = null,
  goalPercent = null,
  onGoalChange,
}: StatusBarProps): JSX.Element {
  const [goalOpen, setGoalOpen] = useState(false)
  const closeGoal = () => setGoalOpen(false)
  const handleGoalDone = (value: number | undefined) => {
    onGoalChange?.(value)
    closeGoal()
  }

  return (
    <div className="statusbar">
      <div className="st-item">
        <span className={`st-dot ${saved ? '' : 'unsaved'}`} />
        {saved ? '已保存' : '未保存'}
      </div>
      {currentHeading ? (
        <div className="st-item st-heading" title={currentHeading}>
          {currentHeading}
        </div>
      ) : null}
      <div className="st-spacer" />
      {typeof modifiedTime === 'number' && modifiedTime > 0 && (
        <div className="st-item">修改于 {formatTime(modifiedTime)}</div>
      )}
      {typeof cursorLine === 'number' && typeof cursorCol === 'number' && (
        <div className="st-item">
          行 {cursorLine}, 列 {cursorCol}
        </div>
      )}
      {typeof selectedChars === 'number' && selectedChars > 0 && (
        <div className="st-item st-selected">已选中 {selectedChars} 字</div>
      )}
      {typeof sectionWords === 'number' && (
        <div className="st-item" title="光标所在章节字数（含子标题）">
          本章 {sectionWords} 字
        </div>
      )}
      {(goalPercent != null || onGoalChange) && (
        <div className="st-item st-goal">
          {goalPercent != null ? (
            onGoalChange ? (
              <button
                type="button"
                className="st-goal-trigger"
                aria-haspopup="dialog"
                aria-expanded={goalOpen}
                title={`字数目标进度 ${goalPercent}%，点击设置本文档目标`}
                onClick={() => setGoalOpen((v) => !v)}
              >
                <span className="st-goal-bar" aria-hidden="true">
                  <span className="st-goal-fill" style={{ width: `${goalPercent}%` }} />
                </span>
                目标 {goalPercent}%
              </button>
            ) : (
              <span title={`字数目标进度 ${goalPercent}%`}>目标 {goalPercent}%</span>
            )
          ) : (
            onGoalChange && (
              <button
                type="button"
                className="st-goal-trigger st-goal-empty"
                aria-haspopup="dialog"
                aria-expanded={goalOpen}
                title="设置本文档字数目标"
                onClick={() => setGoalOpen((v) => !v)}
              >
                设置目标
              </button>
            )
          )}
          {goalOpen && onGoalChange && (
            <>
              {/* 点击弹层外任意区域关闭 */}
              <div className="st-backdrop" onClick={closeGoal} aria-hidden="true" />
              <GoalPopover currentGoal={goalWords} onDone={handleGoalDone} onClose={closeGoal} />
            </>
          )}
        </div>
      )}
      <div className="st-item">{wordCount} 字</div>
      <div className="st-item">{lineCount} 行</div>
      <div className="st-item">约 {readTime} 分钟</div>
      <div className="st-item">{encoding === 'UTF-8-BOM' ? 'UTF-8 (BOM)' : encoding}</div>
      <div className="st-item">Markdown</div>
    </div>
  )
}
