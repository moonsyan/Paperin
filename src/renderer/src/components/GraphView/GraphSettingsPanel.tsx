import type { GraphSettings } from './graph-settings'
import { MAX_GRAPH_NODE_LIMIT, MIN_GRAPH_NODE_LIMIT } from './graph-settings'

interface GraphSettingsPanelProps {
  open: boolean
  settings: GraphSettings
  onSettingChange: <Key extends keyof GraphSettings>(
    key: Key,
    value: GraphSettings[Key],
  ) => void
}

interface GraphSliderProps {
  label: string
  min: number
  max: number
  step: number
  value: number
  displayValue: string
  onChange: (value: number) => void
}

function GraphSlider({
  label,
  min,
  max,
  step,
  value,
  displayValue,
  onChange,
}: GraphSliderProps): JSX.Element {
  return (
    <label className="gs-slider">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <em>{displayValue}</em>
    </label>
  )
}

export function GraphSettingsPanel({
  open,
  settings,
  onSettingChange,
}: GraphSettingsPanelProps): JSX.Element {
  return (
    <div className={`graph-settings ${open ? 'open' : ''}`} aria-label="图谱设置">
      <div className="gs-section">
        <div className="gs-title">滤镜</div>
        <input
          className="gs-search"
          type="text"
          placeholder="搜索笔记 / 路径…"
          value={settings.search}
          spellCheck={false}
          onChange={(event) => onSettingChange('search', event.target.value)}
        />
      </div>
      <div className="gs-section">
        <div className="gs-title">显示</div>
        <label className="gs-toggle">
          <input
            type="checkbox"
            checked={settings.arrows}
            onChange={(event) => onSettingChange('arrows', event.target.checked)}
          />
          箭头
        </label>
        <label className="gs-toggle">
          <input
            type="checkbox"
            checked={settings.animate}
            onChange={(event) => onSettingChange('animate', event.target.checked)}
          />
          动画
        </label>
        <label className="gs-toggle">
          <input
            type="checkbox"
            checked={settings.folderColor}
            onChange={(event) => onSettingChange('folderColor', event.target.checked)}
          />
          按目录着色
        </label>
        <label className="gs-toggle">
          <input
            type="checkbox"
            checked={settings.showOrphans}
            onChange={(event) => onSettingChange('showOrphans', event.target.checked)}
          />
          显示孤立节点
        </label>
        <GraphSlider
          label="节点大小"
          min={0.5}
          max={2}
          step={0.1}
          value={settings.nodeSize}
          displayValue={settings.nodeSize.toFixed(1)}
          onChange={(value) => onSettingChange('nodeSize', value)}
        />
        <GraphSlider
          label="连线粗细"
          min={0.5}
          max={3}
          step={0.1}
          value={settings.linkThickness}
          displayValue={settings.linkThickness.toFixed(1)}
          onChange={(value) => onSettingChange('linkThickness', value)}
        />
        <GraphSlider
          label="文字淡出"
          min={0}
          max={10}
          step={0.5}
          value={settings.textFade}
          displayValue={settings.textFade.toFixed(1)}
          onChange={(value) => onSettingChange('textFade', value)}
        />
      </div>
      <div className="gs-section">
        <div className="gs-title">规模</div>
        <GraphSlider
          label="最大节点数"
          min={MIN_GRAPH_NODE_LIMIT}
          max={MAX_GRAPH_NODE_LIMIT}
          step={100}
          value={settings.maxNodes}
          displayValue={String(settings.maxNodes)}
          onChange={(value) => onSettingChange('maxNodes', value)}
        />
      </div>
      <div className="gs-section">
        <div className="gs-title">作用力</div>
        <GraphSlider
          label="中心力"
          min={0}
          max={2}
          step={0.05}
          value={settings.centerForce}
          displayValue={settings.centerForce.toFixed(2)}
          onChange={(value) => onSettingChange('centerForce', value)}
        />
        <GraphSlider
          label="斥力"
          min={0}
          max={2}
          step={0.05}
          value={settings.repelForce}
          displayValue={settings.repelForce.toFixed(2)}
          onChange={(value) => onSettingChange('repelForce', value)}
        />
        <GraphSlider
          label="连接力"
          min={0}
          max={2}
          step={0.05}
          value={settings.linkForce}
          displayValue={settings.linkForce.toFixed(2)}
          onChange={(value) => onSettingChange('linkForce', value)}
        />
        <GraphSlider
          label="连接距离"
          min={30}
          max={300}
          step={5}
          value={settings.linkDistance}
          displayValue={settings.linkDistance.toFixed(0)}
          onChange={(value) => onSettingChange('linkDistance', value)}
        />
      </div>
    </div>
  )
}
