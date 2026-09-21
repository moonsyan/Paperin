import { useState } from 'react'
import type { PublishProfile } from '../../../../shared/publish-profile'

interface PublishProfileControlsProps {
  profiles: PublishProfile[]
  busy: boolean
  onApply: (profile: PublishProfile) => void
  onSave: (name: string) => void
  onDelete: (id: string) => void
}

/**
 * 发布配置的保存/应用/删除。从 PublishDialog 拆出，避免弹窗继续超过 250 行。
 */
export function PublishProfileControls({
  profiles,
  busy,
  onApply,
  onSave,
  onDelete,
}: PublishProfileControlsProps): JSX.Element {
  const [name, setName] = useState('')
  const [selectedId, setSelectedId] = useState(profiles[0]?.id ?? '')
  const selected = profiles.find((item) => item.id === selectedId) ?? profiles[0] ?? null
  const trimmed = name.trim()
  const saveDisabled = busy || !trimmed
  const applyDisabled = busy || !selected
  const deleteDisabled = busy || !selected

  const handleSave = (): void => {
    if (saveDisabled) return
    onSave(name)
    setName('')
  }

  return (
    <div className="publish-profiles">
      <div className="settings-row">
        <span className="settings-label">
          发布配置
          <span className="settings-hint">保存当前模板与范围，重启后仍可应用；最多 20 条，不含正文</span>
        </span>
      </div>
      {profiles.length > 0 && (
        <div className="publish-profile-row">
          <label className="sr-only" htmlFor="publish-profile-select">已保存的配置</label>
          <select
            id="publish-profile-select"
            className="settings-text-input"
            value={selected?.id ?? ''}
            disabled={busy}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
          <button type="button" className="publish-profile-action" disabled={applyDisabled} onClick={() => selected && onApply(selected)}>
            应用
          </button>
          <button type="button" className="publish-profile-action" disabled={deleteDisabled} onClick={() => selected && onDelete(selected.id)}>
            删除
          </button>
        </div>
      )}
      <div className="publish-profile-row">
        <label className="sr-only" htmlFor="publish-profile-name">配置名称</label>
        <input
          id="publish-profile-name"
          className="settings-text-input"
          value={name}
          disabled={busy}
          placeholder="配置名称"
          maxLength={40}
          onChange={(event) => setName(event.target.value)}
        />
        <button type="button" className="publish-profile-action" disabled={saveDisabled} onClick={handleSave}>
          保存当前配置
        </button>
      </div>
    </div>
  )
}
