// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SettingsDialog } from './index'
import { DEFAULT_SHORTCUTS } from '../../data/shortcuts'
import type { ImageHostStatus } from '../../../../shared/image-host'

afterEach(() => cleanup())

const localHost = (status: Partial<ImageHostStatus> = {}): ImageHostStatus => ({
  provider: 'local',
  configured: false,
  credentialState: 'missing',
  ...status,
})

const baseProps = {
  open: true,
  onClose: vi.fn(),
  theme: 'default',
  onThemeChange: vi.fn(),
  workspaceAvailable: false,
  workspaceThemeEnabled: false,
  onWorkspaceThemeEnabledChange: vi.fn(),
  fontSize: 16,
  onFontSizeChange: vi.fn(),
  contentWidth: 900,
  onContentWidthChange: vi.fn(),
  lineHeight: 1.85,
  onLineHeightChange: vi.fn(),
  contentFont: 'default' as const,
  onContentFontChange: vi.fn(),
  zoom: 1,
  onZoomChange: vi.fn(),
  autosave: true,
  onAutosaveChange: vi.fn(),
  typewriter: false,
  onTypewriterChange: vi.fn(),
  spellcheck: false,
  onSpellcheckChange: vi.fn(),
  spellcheckLang: 'en-US',
  onSpellcheckLangChange: vi.fn(),
  multiWindow: false,
  onMultiWindowChange: vi.fn(),
  blankClickToEnd: true,
  onBlankClickToEndChange: vi.fn(),
  codeLineNumbers: false,
  onCodeLineNumbersChange: vi.fn(),
  collapseFoldersOnOpen: true,
  onCollapseFoldersOnOpenChange: vi.fn(),
  wordGoal: null,
  onWordGoalChange: vi.fn(),
  onImportCss: vi.fn(),
  onRemoveCss: vi.fn(),
  onImportExportCss: vi.fn(),
  onRemoveExportCss: vi.fn(),
  autoUpdateEnabled: true,
  onAutoUpdateEnabledChange: vi.fn(),
  onOpenSupportSummary: vi.fn(),
  imageHost: localHost(),
  onImageHostProviderChange: vi.fn(async () => undefined),
  onImageHostTokenSave: vi.fn(async () => true),
  globalAttachmentDirectory: 'attachments',
  onGlobalAttachmentDirectoryChange: vi.fn(),
  workspaceAttachmentDirectory: null,
  onWorkspaceAttachmentDirectoryChange: vi.fn(),
  shortcuts: DEFAULT_SHORTCUTS,
  onShortcutsChange: vi.fn(),
}

describe('SettingsDialog 更新开关与图床凭据状态', () => {
  it('高级面板的自动检查更新开关有可访问名称，并说明关闭后不会下载或退出安装', () => {
    render(<SettingsDialog {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: '高级' }))
    const toggle = screen.getByRole('switch', { name: '自动检查更新' })
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(
      screen.getByText(/关闭后不会检查更新、不会自动下载，也不会在退出时安装已下载的包/),
    ).toBeTruthy()
  })

  it('安全存储不可用时显示明确状态且不误报已配置', () => {
    render(
      <SettingsDialog
        {...baseProps}
        imageHost={localHost({ credentialState: 'unavailable' })}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '编辑器' }))
    expect(screen.getByText(/系统安全存储不可用，无法保存凭据，已使用本地附件/)).toBeTruthy()
    expect(screen.queryByText('已配置')).toBeNull()
  })

  it('迁移失败时禁用远程上传提示可见，且不显示已配置', () => {
    render(
      <SettingsDialog
        {...baseProps}
        imageHost={{
          provider: 'smms',
          configured: false,
          credentialState: 'migrate-failed',
        }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '编辑器' }))
    expect(screen.getByText(/凭据无法加密保存，已禁用远程上传，明文未丢弃/)).toBeTruthy()
    expect(screen.queryByText('已配置')).toBeNull()
  })
})
