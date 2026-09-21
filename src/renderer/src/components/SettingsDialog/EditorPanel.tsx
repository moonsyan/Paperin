import { useEffect, useState } from 'react'
import type { ImageHostStatus } from '../../../../shared/image-host'
import { SPELL_LANG_OPTIONS } from './constants'

interface EditorPanelProps {
  autosave: boolean
  onAutosaveChange: (value: boolean) => void
  typewriter: boolean
  onTypewriterChange: (value: boolean) => void
  spellcheck: boolean
  onSpellcheckChange: (value: boolean) => void
  spellcheckLang: string
  onSpellcheckLangChange: (value: string) => void
  multiWindow: boolean
  onMultiWindowChange: (value: boolean) => void
  blankClickToEnd: boolean
  onBlankClickToEndChange: (value: boolean) => void
  codeLineNumbers: boolean
  onCodeLineNumbersChange: (value: boolean) => void
  collapseFoldersOnOpen: boolean
  onCollapseFoldersOnOpenChange: (value: boolean) => void
  wordGoal: number | null
  onWordGoalChange: (value: number | null) => void
  imageHost: ImageHostStatus
  onImageHostProviderChange: (provider: 'local' | 'smms') => Promise<void>
  onImageHostTokenSave: (token: string) => Promise<boolean>
  globalAttachmentDirectory: string
  onGlobalAttachmentDirectoryChange: (value: string) => void
  workspaceAttachmentDirectory: string | null
  onWorkspaceAttachmentDirectoryChange: (value: string | null) => void
  hasWorkspace: boolean
}

/** 编辑器面板：编辑行为开关 + 图床配置 */
export function EditorPanel({
  autosave,
  onAutosaveChange,
  typewriter,
  onTypewriterChange,
  spellcheck,
  onSpellcheckChange,
  spellcheckLang,
  onSpellcheckLangChange,
  multiWindow,
  onMultiWindowChange,
  blankClickToEnd,
  onBlankClickToEndChange,
  codeLineNumbers,
  onCodeLineNumbersChange,
  collapseFoldersOnOpen,
  onCollapseFoldersOnOpenChange,
  wordGoal,
  onWordGoalChange,
  imageHost,
  onImageHostProviderChange,
  onImageHostTokenSave,
  globalAttachmentDirectory,
  onGlobalAttachmentDirectoryChange,
  workspaceAttachmentDirectory,
  onWorkspaceAttachmentDirectoryChange,
  hasWorkspace,
}: EditorPanelProps): JSX.Element {
  const [tokenInput, setTokenInput] = useState('')
  // 字数目标输入允许中间态（如清空后再输入），失焦/变更时解析写回
  const [goalInput, setGoalInput] = useState(wordGoal != null ? String(wordGoal) : '')

  useEffect(() => {
    setTokenInput('')
  }, [imageHost.provider])

  useEffect(() => {
    setGoalInput(wordGoal != null ? String(wordGoal) : '')
  }, [wordGoal])

  const handleGoalInputChange = (value: string) => {
    setGoalInput(value)
    const parsed = Number.parseInt(value, 10)
    onWordGoalChange(Number.isFinite(parsed) && parsed > 0 ? parsed : null)
  }

  const handleSaveToken = async () => {
    if (!tokenInput.trim()) return
    if (await onImageHostTokenSave(tokenInput)) setTokenInput('')
  }

  return (
    <>
      <div className="settings-section-title">编辑</div>
      <button type="button" className="settings-row settings-row-toggle" aria-pressed={autosave} onClick={() => onAutosaveChange(!autosave)}>
        <span className="settings-label">
          自动保存
          <span className="settings-hint">停止输入约 1 秒后自动写回磁盘</span>
        </span>
        <span className={`switch ${autosave ? 'on' : ''}`} />
      </button>
      <button type="button" className="settings-row settings-row-toggle" aria-pressed={typewriter} onClick={() => onTypewriterChange(!typewriter)}>
        <span className="settings-label">
          打字机模式
          <span className="settings-hint">光标所在行始终保持屏幕居中</span>
        </span>
        <span className={`switch ${typewriter ? 'on' : ''}`} />
      </button>
      <button type="button" className="settings-row settings-row-toggle" aria-pressed={spellcheck} onClick={() => onSpellcheckChange(!spellcheck)}>
        <span className="settings-label">
          拼写检查（多语言词典）
          <span className="settings-hint">默认关闭。打开后可能下载对应语言词典，不上传正文；代码块与行内代码自动排除，中文不在词典范围</span>
        </span>
        <span className={`switch ${spellcheck ? 'on' : ''}`} />
      </button>
      {spellcheck && (
        <div className="settings-row">
          <span className="settings-label">拼写检查语言</span>
          <select
            className="settings-text-input"
            value={spellcheckLang}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onSpellcheckLangChange(e.target.value)}
          >
            {SPELL_LANG_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <button type="button" className="settings-row settings-row-toggle" aria-pressed={multiWindow} onClick={() => onMultiWindowChange(!multiWindow)}>
        <span className="settings-label">
          多窗口模式
          <span className="settings-hint">允许同时打开多个窗口（重启后生效）</span>
        </span>
        <span className={`switch ${multiWindow ? 'on' : ''}`} />
      </button>
      <button type="button" className="settings-row settings-row-toggle" aria-pressed={blankClickToEnd} onClick={() => onBlankClickToEndChange(!blankClickToEnd)}>
        <span className="settings-label">
          点击空白区跳到文末
          <span className="settings-hint">点击正文下方空白区域时光标定位到文档末尾（Typora 同款行为）</span>
        </span>
        <span className={`switch ${blankClickToEnd ? 'on' : ''}`} />
      </button>
      <button type="button" className="settings-row settings-row-toggle" aria-pressed={codeLineNumbers} onClick={() => onCodeLineNumbersChange(!codeLineNumbers)}>
        <span className="settings-label">
          代码块行号
          <span className="settings-hint">在代码,块左侧显示行号（导出 HTML/PDF 时一并包含）</span>
        </span>
        <span className={`switch ${codeLineNumbers ? 'on' : ''}`} />
      </button>
      <button type="button" className="settings-row settings-row-toggle" aria-pressed={collapseFoldersOnOpen} onClick={() => onCollapseFoldersOnOpenChange(!collapseFoldersOnOpen)}>
        <span className="settings-label">
          默认打开文件夹全部折叠
          <span className="settings-hint">折叠文件夹时一并折叠其所有子文件夹；展开并只展开被点击的文件夹</span>
        </span>
        <span className={`switch ${collapseFoldersOnOpen ? 'on' : ''}`} />
      </button>

      <div className="settings-section-title">写作目标</div>
      <div className="settings-row">
        <span className="settings-label">
          全局字数目标
          <span className="settings-hint">状态栏显示全文进度；单个文档可在状态栏单独设置</span>
        </span>
        <input
          className="settings-text-input"
          type="number"
          min={1}
          step={100}
          placeholder="未设置"
          value={goalInput}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => handleGoalInputChange(e.target.value)}
        />
      </div>

      <div className="settings-section-title">图床（粘贴/拖入图片）</div>
      <div className="settings-row">
        <span className="settings-label">
          全局附件目录
          <span className="settings-hint">相对工作区路径；留空使用 attachments</span>
        </span>
        <input className="settings-text-input" value={globalAttachmentDirectory} placeholder="attachments" onChange={(event) => onGlobalAttachmentDirectoryChange(event.target.value)} />
      </div>
      {hasWorkspace && (
        <div className="settings-row">
          <span className="settings-label">
            当前工作区附件目录
            <span className="settings-hint">留空继承全局设置</span>
          </span>
          <input className="settings-text-input" value={workspaceAttachmentDirectory ?? ''} placeholder="继承全局" onChange={(event) => onWorkspaceAttachmentDirectoryChange(event.target.value || null)} />
        </div>
      )}
      <div className="settings-row">
        <span className="settings-label">图片存储位置</span>
        <div className="seg">
          <button
            type="button"
            className={`seg-item ${imageHost.provider === 'local' ? 'on' : ''}`}
            aria-pressed={imageHost.provider === 'local'}
            onClick={() => void onImageHostProviderChange('local')}
          >
            本地附件
          </button>
          <button
            type="button"
            className={`seg-item ${imageHost.provider === 'smms' ? 'on' : ''}`}
            aria-pressed={imageHost.provider === 'smms'}
            onClick={() => void onImageHostProviderChange('smms')}
          >
            SM.MS 图床
          </button>
        </div>
      </div>
      {imageHost.credentialState === 'unavailable' && (
        <div className="settings-row">
          <span className="settings-hint">系统安全存储不可用，无法保存凭据，已使用本地附件</span>
        </div>
      )}
      {imageHost.provider === 'smms' && (
        <div className="settings-row">
          <span className="settings-label">
            SM.MS Token
            <span className="settings-hint">在 sm.ms 账号设置中获取；未填写时自动降级为本地附件</span>
          </span>
          <input
            className="settings-text-input"
            type="password"
            placeholder="粘贴 Token"
            value={tokenInput}
            spellCheck={false}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setTokenInput(e.target.value)}
          />
          <button
            type="button"
            className="sc-btn"
            disabled={!tokenInput.trim()}
            onClick={() => void handleSaveToken()}
          >
            保存
          </button>
          {imageHost.configured && imageHost.credentialState === 'ok' && (
            <span className="settings-hint">已配置</span>
          )}
          {imageHost.credentialState === 'migrate-failed' && (
            <span className="settings-hint">凭据无法加密保存，已禁用远程上传，明文未丢弃</span>
          )}
        </div>
      )}
    </>
  )
}
