import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { BacklinkGraph } from '../../lib/backlinks'
import type { WorkspaceIndex } from '../../../../shared/workspace-index'
import { ForceSimulation } from './force'
import type { ForceNode, ForceParams } from './force'
import { buildGraphData, MAX_GRAPH_NODE_LIMIT, MIN_GRAPH_NODE_LIMIT, GRAPH_NODE_LIMIT, type GraphFilter } from './graph-data'

/* ==================== 知识图谱视图（编辑器区内置标签页，零依赖力导向 SVG） ==================== */

interface GraphViewProps {
  /** 标签是否激活（挂载由父级 graphTabOpen 控制；未激活时不渲染并暂停模拟） */
  active: boolean
  graph: BacklinkGraph | null
  /** 当前活动文件（高亮圈） */
  activePath: string | null
  workspaceName: string
  truncated: boolean
  /** 关闭图谱标签 */
  onClose: () => void
  /** 点击已解析节点打开文件 */
  onOpenNode: (path: string) => void
  /** 点击未解析节点 */
  onGhostClick: (target: string) => void
  /** 图谱设置（Obsidian 式；缺省用默认值，由 App 持久化） */
  settings?: GraphSettings
  onSettingsChange?: (settings: GraphSettings) => void
  /** 数据层筛选（目录、标签、深度）；搜索由图谱设置透传到数据层 */
  graphFilter?: Omit<GraphFilter, 'search' | 'activePath'>
  workspaceIndex?: WorkspaceIndex | null
}

/** 图谱设置（Obsidian 图谱设置面板同款项） */
export interface GraphSettings {
  /** 滤镜：按笔记名/路径子串过滤，未命中节点淡出 */
  search: string
  /** 显示：连线箭头（链接方向） */
  arrows: boolean
  /** 显示：持续微动画 */
  animate: boolean
  /** 显示：按顶层目录着色 */
  folderColor: boolean
  /** 显示：孤立节点（无任何链接的文件）。大工作区默认隐藏——
   *  无链接笔记会铺满画布、淹没真正有链接关系的核心结构 */
  showOrphans: boolean
  /** 显示：节点大小倍率 0.5–2 */
  nodeSize: number
  /** 显示：连线粗细倍率 0.5–3 */
  linkThickness: number
  /** 显示：文字淡出阈值 0–10（越大越需要放大才显示标签） */
  textFade: number
  /** 作用力：向心力 0–2 */
  centerForce: number
  /** 作用力：斥力 0–2 */
  repelForce: number
  /** 作用力：连接力 0–2 */
  linkForce: number
  /** 作用力：连接距离（像素）30–300 */
  linkDistance: number
  /** 节点规模上限 100–10000（超过时按度数保留最重要的节点） */
  maxNodes: number
}

export const DEFAULT_GRAPH_SETTINGS: GraphSettings = {
  search: '',
  arrows: false,
  animate: false,
  folderColor: false,
  showOrphans: false,
  nodeSize: 1,
  linkThickness: 1,
  // 默认 10：标签只随悬停/当前文件显示（Obsidian 默认不显示文件名，
  // 大图渲染上千个 <text> 也会拖垮帧率）；调低可恢复缩放渐显
  textFade: 10,
  centerForce: 1,
  repelForce: 1,
  linkForce: 1,
  linkDistance: 92,
  maxNodes: GRAPH_NODE_LIMIT,
}

/** 帧预算保险：任何情况下模拟循环最多运行这么多帧（animate 模式豁免） */
const MAX_SIM_FRAMES = 6000

interface VisualNode {
  id: string
  /** 文件路径；ghost 节点为 null */
  path: string | null
  label: string
  /** 顶层目录（着色用；根级文件与 ghost 为空串） */
  folder: string
  ghost: boolean
  degree: number
}

const baseNodeRadius = (degree: number): number => 5 + Math.min(10, Math.sqrt(degree) * 2.4)

/* ---------- 节点子组件：memo 隔离，悬停只重渲染受影响的 1-2 个节点 ---------- */

interface NodeGProps {
  node: VisualNode
  radius: number
  folderFill: string | undefined
  showLabel: boolean
  isActive: boolean
  registerEl: (id: string, el: SVGGElement | null) => void
  onNodePointerDown: (e: ReactPointerEvent, id: string) => void
  onNodePointerMove: (e: ReactPointerEvent) => void
  onNodePointerUp: (e: ReactPointerEvent) => void
  onNodeEnter: (id: string) => void
  onNodeLeave: (id: string) => void
}

const NodeG = memo(function NodeG({
  node,
  radius,
  folderFill,
  showLabel,
  isActive,
  registerEl,
  onNodePointerDown,
  onNodePointerMove,
  onNodePointerUp,
  onNodeEnter,
  onNodeLeave,
}: NodeGProps): JSX.Element {
  return (
    <g
      ref={(el) => registerEl(node.id, el)}
      className={`graph-node ${node.ghost ? 'ghost' : ''} ${isActive ? 'active' : ''}`}
      onPointerDown={(e) => onNodePointerDown(e, node.id)}
      onPointerMove={onNodePointerMove}
      onPointerUp={onNodePointerUp}
      onPointerEnter={() => onNodeEnter(node.id)}
      onPointerLeave={() => onNodeLeave(node.id)}
    >
      <circle
        r={radius}
        className="graph-node-circle"
        style={folderFill ? { fill: folderFill } : undefined}
      />
      {showLabel && (
        <text className="graph-node-label" y={radius + 13}>
          {node.label}
        </text>
      )}
    </g>
  )
})

/** 目录名 → 稳定色相（Obsidian 颜色组效果） */
const folderHueCache = new Map<string, number>()
const folderHue = (folder: string): number => {
  let hue = folderHueCache.get(folder)
  if (hue === undefined) {
    let hash = 0
    for (let i = 0; i < folder.length; i++) {
      hash = (hash * 31 + folder.charCodeAt(i)) | 0
    }
    hue = Math.abs(hash) % 360
    folderHueCache.set(folder, hue)
  }
  return hue
}

export function GraphView({
  active,
  graph,
  activePath,
  workspaceName,
  truncated,
  onClose,
  onOpenNode,
  onGhostClick,
  settings,
  onSettingsChange,
  graphFilter,
  workspaceIndex = null,
}: GraphViewProps): JSX.Element | null {
  const cfg = settings ?? DEFAULT_GRAPH_SETTINGS
  // 声明必须先于下方 prepared 的 useMemo——闭包内引用后声明的 const
  // 是 TDZ 运行时错误，TS 对闭包不做先用后声明检查
  const activePathRef = useRef(activePath)
  activePathRef.current = activePath
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg
  const prepared = useMemo(() => {
    // activePath 经 ref 读取：切换活动文件只影响渲染高亮与截断优先级，
    // 不得触发图谱数据重建（否则每次切文件都整体重排）
    const source = workspaceIndex ?? graph
    return source
      ? buildGraphData(
          source,
          { ...graphFilter, activePath: activePathRef.current, search: cfg.search },
          { maxNodes: cfg.maxNodes, hideOrphans: !cfg.showOrphans },
        )
      : null

  }, [graph, workspaceIndex, graphFilter, cfg.search, cfg.maxNodes, cfg.showOrphans])
  /** 结构签名：节点（含度数）+ 边。索引刷新但结构未变时不重建布局 */
  const preparedSig = useMemo(
    () =>
      prepared
        ? `${prepared.nodes.map((n) => `${n.id}:${n.degree}`).join('|')}##${prepared.links
            .map((l) => `${l.source}>${l.target}`)
            .join('|')}`
        : '',
    [prepared],
  )

  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const transformGRef = useRef<SVGGElement>(null)
  const [size, setSize] = useState({ width: 800, height: 560 })
  // view 的真实值在 viewRef（手势期间命令式更新，不经 React 状态——
  // 平移/缩放每次移动重渲染上千节点是主要卡顿源）；state 只在手势结束
  // 同步一次，用于触发标签按缩放阈值的重新计算
  const [view, setView] = useState({ tx: 0, ty: 0, scale: 1 })
  const viewRef = useRef(view)
  const applyViewTransform = useCallback(() => {
    const v = viewRef.current
    transformGRef.current?.setAttribute(
      'transform',
      `translate(${v.tx},${v.ty}) scale(${v.scale})`,
    )
  }, [])
  const [hovered, setHovered] = useState<string | null>(null)
  const simRef = useRef<ForceSimulation | null>(null)
  const nodeElsRef = useRef(new Map<string, SVGGElement>())
  const edgeElsRef = useRef<(SVGLineElement | null)[]>([])
  const idIndexRef = useRef(new Map<string, number>())
  const adjacencyRef = useRef<Map<string, Set<string>>>(new Map())
  const dragRef = useRef<{ id: string; moved: boolean } | null>(null)
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
  /** 切走标签时的节点位置快照：切回来按原位置温和回热，不整图重排 */
  const savedPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  const [settingsOpen, setSettingsOpen] = useState(false)

  /** 作用力参数（设置面板驱动）；nodeSize 参与碰撞半径——放大节点仍不遮挡 */
  const forceParams: ForceParams = useMemo(
    () => ({
      centerForce: cfg.centerForce,
      repelForce: cfg.repelForce,
      linkForce: cfg.linkForce,
      linkDistance: cfg.linkDistance,
      nodeScale: cfg.nodeSize,
    }),
    [cfg.centerForce, cfg.repelForce, cfg.linkForce, cfg.linkDistance, cfg.nodeSize],
  )
  const forceParamsRef = useRef(forceParams)
  forceParamsRef.current = forceParams

  /** 滤镜命中的节点集合；null = 无滤镜 */
  const filterMatches = useMemo(() => {
    const query = cfg.search.trim().toLowerCase()
    if (!query || !prepared) return null
    const match = new Set<string>()
    for (const node of prepared.nodes) {
      if (
        node.label.toLowerCase().includes(query) ||
        node.id.toLowerCase().includes(query) ||
        node.folder.toLowerCase().includes(query)
      ) {
        match.add(node.id)
      }
    }
    return match
     
  }, [cfg.search, prepared])

  /* ---------- 相邻表（悬停高亮/标签显示用） ---------- */
  useEffect(() => {
    const adj = new Map<string, Set<string>>()
    if (prepared) {
      for (const node of prepared.nodes) adj.set(node.id, new Set())
      for (const link of prepared.links) {
        adj.get(link.source)?.add(link.target)
        adj.get(link.target)?.add(link.source)
      }
    }
    adjacencyRef.current = adj
  }, [prepared])

  /* ---------- 尺寸自适应 ---------- */
  useEffect(() => {
    if (!active) return
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        setSize((prev) =>
          Math.abs(prev.width - rect.width) < 1 && Math.abs(prev.height - rect.height) < 1
            ? prev
            : { width: rect.width, height: rect.height },
        )
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [active])

  /* ---------- 模拟循环：直接改 DOM 属性，绕开每帧 React 协调 ---------- */
  // 未激活（切到文件标签）时暂停模拟并保存位置快照；依赖结构签名而非
  // prepared 对象：索引随自动保存重建（引用变化）但结构未变时不重排
  const startLoopRef = useRef<((animated?: boolean) => void) | null>(null)
  const prevSigRef = useRef('')
  useEffect(() => {
    if (!active || !prepared) {
      prevSigRef.current = ''
      return
    }
    const dataChanged = prevSigRef.current !== preparedSig
    prevSigRef.current = preparedSig
    const { width, height } = size
    const idIndex = new Map<string, number>()
    prepared.nodes.forEach((node, i) => idIndex.set(node.id, i))
    idIndexRef.current = idIndex

    const forceNodes: ForceNode[] = prepared.nodes.map((node) => ({
      id: node.id,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: baseNodeRadius(node.degree),
    }))
    const forceLinks = prepared.links.flatMap((link) => {
      const s = idIndex.get(link.source)
      const t = idIndex.get(link.target)
      return s !== undefined && t !== undefined ? [{ source: s, target: t }] : []
    })
    const sim = new ForceSimulation(
      forceNodes,
      forceLinks,
      width,
      height,
      dataChanged ? undefined : savedPositionsRef.current,
      forceParamsRef.current,
    )
    simRef.current = sim
    if (dataChanged) {
      viewRef.current = { tx: 0, ty: 0, scale: 1 }
      setView({ tx: 0, ty: 0, scale: 1 })
      setHovered(null)
    } else {
      // 结构未变（切回标签/对话重开）：按快照原位置温和回热
      sim.reheat(0.15)
    }

    let raf = 0
    let frames = 0
    const applyPositions = (updateEdges: boolean) => {
      for (const node of forceNodes) {
        const el = nodeElsRef.current.get(node.id)
        if (el) el.setAttribute('transform', `translate(${node.x.toFixed(1)},${node.y.toFixed(1)})`)
      }
      if (!updateEdges) return
      // 边隔帧更新（大图每帧数千次属性写是稳定帧率的负担；
      // 收敛最后一帧全量刷一次保证落点准确）
      const edgeEls = edgeElsRef.current
      for (let i = 0; i < forceLinks.length; i++) {
        const line = edgeEls[i]
        if (!line) continue
        const a = forceNodes[forceLinks[i].source]
        const b = forceNodes[forceLinks[i].target]
        line.setAttribute('x1', a.x.toFixed(1))
        line.setAttribute('y1', a.y.toFixed(1))
        line.setAttribute('x2', b.x.toFixed(1))
        line.setAttribute('y2', b.y.toFixed(1))
      }
    }
    const tick = () => {
      const iterations = frames < 30 ? 4 : 1
      for (let i = 0; i < iterations; i++) sim.step()
      frames++
      applyPositions(frames % 2 === 0 || !sim.active)
      // animate 模式：收敛后保持微弱扰动持续漂浮（Obsidian 同款），豁免帧预算；
      // 回热值必须略高于 ALPHA_MIN(0.02)；碰撞强度有保底下限，漂浮中重叠仍被解开
      if (cfgRef.current.animate && !sim.active) sim.reheat(0.028)
      const budgetOk = frames < MAX_SIM_FRAMES || cfgRef.current.animate
      if (sim.active && budgetOk) raf = requestAnimationFrame(tick)
      else applyPositions(true)
    }
    /** 运行布局：animate 模式走 rAF 动画；静态模式（默认）同步迭代到收敛
     *  后一次性呈现——节点位置固定不飘移，配合确定性采样每次打开布局一致。
     *  drag 传 animated=true 强制走动画（拖动时邻居需实时让位）。 */
    const runLayout = (animated = false) => {
      cancelAnimationFrame(raf)
      if (frames >= MAX_SIM_FRAMES && !cfgRef.current.animate) frames = 0
      if (animated || cfgRef.current.animate) {
        raf = requestAnimationFrame(tick)
        return
      }
      // alpha 从 1 衰减到 0.02 约需 260 步，上限留足余量并受帧预算约束
      let guard = 0
      while (sim.active && guard < 800 && frames < MAX_SIM_FRAMES) {
        sim.step()
        frames++
        guard++
      }
      applyPositions(true)
    }
    startLoopRef.current = runLayout
    runLayout()
    return () => {
      cancelAnimationFrame(raf)
      startLoopRef.current = null
      // 位置快照：切走标签后回来不重排
      savedPositionsRef.current = new Map(
        forceNodes.map((node) => [node.id, { x: node.x, y: node.y }]),
      )
      simRef.current = null
    }
    // size 变化经独立 effect 温和处理
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, preparedSig])

  /* ---------- 作用力参数变化：温和回热重新收敛 ---------- */
  useEffect(() => {
    const sim = simRef.current
    if (!active || !sim) return
    sim.setParams(forceParams)
    sim.reheat(0.35)
    startLoopRef.current?.()
  }, [active, forceParams])

  /* ---------- 尺寸变化：更新边界并温和重启收敛（不重排、不重置缩放） ---------- */
  useEffect(() => {
    const sim = simRef.current
    if (!active || !sim) return
    sim.setSize(size.width, size.height)
    sim.reheat(0.2)
    startLoopRef.current?.()
  }, [active, size.width, size.height])

  /* ---------- 悬停高亮 / 滤镜淡出 class 应用 ---------- */
  useEffect(() => {
    const highlighted = new Set<string>()
    if (hovered) {
      highlighted.add(hovered)
      adjacencyRef.current.get(hovered)?.forEach((id) => highlighted.add(id))
    }
    nodeElsRef.current.forEach((el, id) => {
      const filtered = filterMatches !== null && !filterMatches.has(id)
      el.classList.toggle('filtered', filtered)
      el.classList.toggle('dimmed', !filtered && Boolean(hovered) && !highlighted.has(id))
      el.classList.toggle('neighbor', !filtered && highlighted.has(id) && id !== hovered)
    })
    if (prepared) {
      prepared.links.forEach((link, i) => {
        const line = edgeElsRef.current[i]
        if (!line) return
        const dimmed =
          filterMatches !== null &&
          (!filterMatches.has(link.source) || !filterMatches.has(link.target))
        line.classList.toggle('filtered', dimmed)
        line.classList.toggle('dimmed', !dimmed && Boolean(hovered))
      })
    }
  }, [hovered, filterMatches, prepared])

  /* ---------- Esc 关闭标签 ---------- */
  useEffect(() => {
    if (!active) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement)) onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [active, onClose])

  /* ---------- 滚轮缩放（命令式：直接改 transform 属性，O(1)；
     滚轮停止 180ms 后才同步 React 状态，触发标签按缩放阈值重算） ---------- */
  useEffect(() => {
    if (!active) return
    const svg = svgRef.current
    if (!svg) return
    let syncTimer: ReturnType<typeof setTimeout> | null = null
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const rect = svg.getBoundingClientRect()
      const v = viewRef.current
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
      const scale = Math.min(3, Math.max(0.25, v.scale * factor))
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      viewRef.current = {
        tx: mx - ((mx - v.tx) / v.scale) * scale,
        ty: my - ((my - v.ty) / v.scale) * scale,
        scale,
      }
      applyViewTransform()
      if (syncTimer) clearTimeout(syncTimer)
      syncTimer = setTimeout(() => setView({ ...viewRef.current }), 180)
    }
    svg.addEventListener('wheel', handler, { passive: false })
    return () => {
      svg.removeEventListener('wheel', handler)
      if (syncTimer) clearTimeout(syncTimer)
    }
  }, [active, applyViewTransform])

  /* ---------- 交互：节点拖拽 / 点击 ---------- */
  const toGraphCoords = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
    const rect = svgRef.current?.getBoundingClientRect()
    const v = viewRef.current
    if (!rect) return { x: 0, y: 0 }
    return {
      x: (clientX - rect.left - v.tx) / v.scale,
      y: (clientY - rect.top - v.ty) / v.scale,
    }
  }, [])

  const handleNodePointerDown = useCallback((e: React.PointerEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = { id, moved: false }
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    setHovered(id)
  }, [])

  const handleNodePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const sim = simRef.current
      const index = idIndexRef.current.get(drag.id)
      if (!sim || index === undefined) return
      const pos = toGraphCoords(e.clientX, e.clientY)
      const node = sim.nodes[index]
      if (
        !drag.moved &&
        (Math.abs(node.x - pos.x) > 2 || Math.abs(node.y - pos.y) > 2)
      ) {
        drag.moved = true
      }
      node.fx = pos.x
      node.fy = pos.y
      // 拖拽需要邻居实时让位：强制走动画循环（即使静态布局模式）
      if (!sim.active) sim.reheat(0.3)
      startLoopRef.current?.(true)
    },
    [toGraphCoords],
  )

  const handleNodePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current
      dragRef.current = null
      ;(e.currentTarget as Element).releasePointerCapture?.(e.pointerId)
      if (!drag) return
      const sim = simRef.current
      const index = idIndexRef.current.get(drag.id)
      if (sim && index !== undefined) {
        sim.nodes[index].fx = undefined
        sim.nodes[index].fy = undefined
      }
      // 点击（非拖动）：已解析节点打开文件，ghost 节点提示未解析
      if (!drag.moved) {
        const target = prepared?.nodes.find((n) => n.id === drag.id)
        if (target) {
          if (target.path) onOpenNode(target.path)
          else onGhostClick(target.label)
        }
      }
    },
    [prepared, onOpenNode, onGhostClick],
  )

  /* ---------- 交互：画布平移（命令式 transform，指针抬起才同步状态） ---------- */
  const handleBackgroundPointerDown = useCallback((e: ReactPointerEvent) => {
    panRef.current = { x: e.clientX, y: e.clientY, tx: viewRef.current.tx, ty: viewRef.current.ty }
  }, [])

  const handleBackgroundPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const pan = panRef.current
      // 节点拖拽期间不触发画布平移（节点事件已 stopPropagation，此处为保险）
      if (!pan || dragRef.current) return
      viewRef.current = {
        ...viewRef.current,
        tx: pan.tx + (e.clientX - pan.x),
        ty: pan.ty + (e.clientY - pan.y),
      }
      applyViewTransform()
    },
    [applyViewTransform],
  )

  const handleBackgroundPointerUp = useCallback(() => {
    if (!panRef.current) return
    panRef.current = null
    setView({ ...viewRef.current })
  }, [])

  const zoomBy = useCallback(
    (factor: number) => {
      const v = viewRef.current
      const scale = Math.min(3, Math.max(0.25, v.scale * factor))
      const cx = size.width / 2
      const cy = size.height / 2
      viewRef.current = {
        tx: cx - ((cx - v.tx) / v.scale) * scale,
        ty: cy - ((cy - v.ty) / v.scale) * scale,
        scale,
      }
      applyViewTransform()
      setView({ ...viewRef.current })
    },
    [size.width, size.height, applyViewTransform],
  )

  /** 标签显示规则（Obsidian 默认）：仅悬停节点与当前文件显示文件名；
   *  文字淡出阈值调低时，缩放超过阈值也渐显（此时 view 由手势结束同步） */
  const labelThreshold = 0.25 + cfg.textFade * 0.28
  const zoomShowsLabels = view.scale >= labelThreshold

  /** 更新单项设置 */
  const updateSetting = useCallback(
    <K extends keyof GraphSettings>(key: K, value: GraphSettings[K]) => {
      onSettingsChange?.({ ...cfgRef.current, [key]: value })
    },
    [onSettingsChange],
  )

  /** 节点元素注册（供模拟循环命令式更新坐标） */
  const registerNodeEl = useCallback((id: string, el: SVGGElement | null) => {
    if (el) nodeElsRef.current.set(id, el)
    else nodeElsRef.current.delete(id)
  }, [])

  const handleNodeEnter = useCallback((id: string) => setHovered(id), [])
  const handleNodeLeave = useCallback(
    (id: string) => setHovered((h) => (h === id ? null : h)),
    [],
  )

  if (!active) return null

  const nodeCount = prepared?.nodes.length ?? 0
  const linkCount = prepared?.links.length ?? 0
  const ghostCount = prepared?.nodes.filter((n) => n.ghost).length ?? 0
  const arrowId = 'mkgraph-arrow'
  const lowerActivePath = activePath?.toLowerCase() ?? ''

  return (
    <div className="graph-tab-view" role="tabpanel" aria-label="知识图谱">
      <div className="graph-tab-toolbar">
        <div className="graph-tab-title">
          知识图谱
          <span className="graph-tab-sub">
            {workspaceName} · {nodeCount} 个笔记 · {linkCount} 条链接
            {ghostCount > 0 ? ` · ${ghostCount} 个未解析` : ''}
          </span>
        </div>
        <div className="graph-tab-actions">
          <button type="button" className="graph-zoom-btn" onClick={() => zoomBy(1.25)} aria-label="放大">
            +
          </button>
          <button type="button" className="graph-zoom-btn" onClick={() => zoomBy(0.8)} aria-label="缩小">
            −
          </button>
          <button
            type="button"
            className="graph-zoom-btn"
            onClick={() => setView({ tx: 0, ty: 0, scale: 1 })}
            aria-label="重置视图"
          >
            重置
          </button>
          <button
            type="button"
            className={`graph-zoom-btn ${settingsOpen ? 'active' : ''}`}
            onClick={() => setSettingsOpen((v) => !v)}
            aria-label="图谱设置"
            aria-pressed={settingsOpen}
            title="设置"
          >
            ⚙
          </button>
          <button type="button" className="graph-close-btn" onClick={onClose} aria-label="关闭知识图谱标签" title="关闭标签（Esc）">
            ×
          </button>
        </div>
      </div>
      <div className="graph-canvas-wrap" ref={containerRef}>
        <svg
          ref={svgRef}
          className="graph-canvas"
          width={size.width}
          height={size.height}
          onPointerDown={handleBackgroundPointerDown}
          onPointerMove={handleBackgroundPointerMove}
          onPointerUp={handleBackgroundPointerUp}
          onPointerLeave={handleBackgroundPointerUp}
        >
          <defs>
            <marker
              id={arrowId}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6.5"
              markerHeight="6.5"
              orient="auto"
            >
              <path d="M0,1 L9,5 L0,9 z" fill="context-stroke" />
            </marker>
          </defs>
          <g ref={transformGRef} transform={`translate(${view.tx},${view.ty}) scale(${view.scale})`}>
            <g className="graph-edges">
              {prepared?.links.map((link, i) => (
                <line
                  key={`${link.source}-${link.target}-${i}`}
                  ref={(el) => {
                    edgeElsRef.current[i] = el
                  }}
                  className="graph-edge"
                  strokeWidth={cfg.linkThickness}
                  markerEnd={cfg.arrows ? `url(#${arrowId})` : undefined}
                  x1={0}
                  y1={0}
                  x2={0}
                  y2={0}
                />
              ))}
            </g>
            <g className="graph-nodes">
              {prepared?.nodes.map((node) => {
                const isActive = Boolean(node.path) && node.id.toLowerCase() === lowerActivePath
                const r = baseNodeRadius(node.degree) * cfg.nodeSize
                const folderFill =
                  cfg.folderColor && !node.ghost && node.folder
                    ? `hsl(${folderHue(node.folder)}, 45%, 52%)`
                    : undefined
                const showLabel =
                  (node.id === hovered || isActive || zoomShowsLabels) &&
                  !(filterMatches !== null && !filterMatches.has(node.id))
                return (
                  <NodeG
                    key={node.id}
                    node={node}
                    radius={r}
                    folderFill={folderFill}
                    showLabel={showLabel}
                    isActive={isActive}
                    registerEl={registerNodeEl}
                    onNodePointerDown={handleNodePointerDown}
                    onNodePointerMove={handleNodePointerMove}
                    onNodePointerUp={handleNodePointerUp}
                    onNodeEnter={handleNodeEnter}
                    onNodeLeave={handleNodeLeave}
                  />
                )
              })}
            </g>
          </g>
        </svg>

        {/* ===== Obsidian 式设置面板 ===== */}
        <div className={`graph-settings ${settingsOpen ? 'open' : ''}`} aria-label="图谱设置">
          <div className="gs-section">
            <div className="gs-title">滤镜</div>
            <input
              className="gs-search"
              type="text"
              placeholder="搜索笔记 / 路径…"
              value={cfg.search}
              spellCheck={false}
              onChange={(e) => updateSetting('search', e.target.value)}
            />
          </div>
          <div className="gs-section">
            <div className="gs-title">显示</div>
            <label className="gs-toggle">
              <input
                type="checkbox"
                checked={cfg.arrows}
                onChange={(e) => updateSetting('arrows', e.target.checked)}
              />
              箭头
            </label>
            <label className="gs-toggle">
              <input
                type="checkbox"
                checked={cfg.animate}
                onChange={(e) => updateSetting('animate', e.target.checked)}
              />
              动画
            </label>
            <label className="gs-toggle">
              <input
                type="checkbox"
                checked={cfg.folderColor}
                onChange={(e) => updateSetting('folderColor', e.target.checked)}
              />
              按目录着色
            </label>
            <label className="gs-toggle">
              <input
                type="checkbox"
                checked={cfg.showOrphans}
                onChange={(e) => updateSetting('showOrphans', e.target.checked)}
              />
              显示孤立节点
            </label>
            <label className="gs-slider">
              <span>节点大小</span>
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.1}
                value={cfg.nodeSize}
                onChange={(e) => updateSetting('nodeSize', Number(e.target.value))}
              />
              <em>{cfg.nodeSize.toFixed(1)}</em>
            </label>
            <label className="gs-slider">
              <span>连线粗细</span>
              <input
                type="range"
                min={0.5}
                max={3}
                step={0.1}
                value={cfg.linkThickness}
                onChange={(e) => updateSetting('linkThickness', Number(e.target.value))}
              />
              <em>{cfg.linkThickness.toFixed(1)}</em>
            </label>
            <label className="gs-slider">
              <span>文字淡出</span>
              <input
                type="range"
                min={0}
                max={10}
                step={0.5}
                value={cfg.textFade}
                onChange={(e) => updateSetting('textFade', Number(e.target.value))}
              />
              <em>{cfg.textFade.toFixed(1)}</em>
            </label>
          </div>
          <div className="gs-section">
            <div className="gs-title">规模</div>
            <label className="gs-slider">
              <span>最大节点数</span>
              <input
                type="range"
                min={MIN_GRAPH_NODE_LIMIT}
                max={MAX_GRAPH_NODE_LIMIT}
                step={100}
                value={cfg.maxNodes}
                onChange={(e) => updateSetting('maxNodes', Number(e.target.value))}
              />
              <em>{cfg.maxNodes}</em>
            </label>
          </div>
          <div className="gs-section">
            <div className="gs-title">作用力</div>
            <label className="gs-slider">
              <span>中心力</span>
              <input
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={cfg.centerForce}
                onChange={(e) => updateSetting('centerForce', Number(e.target.value))}
              />
              <em>{cfg.centerForce.toFixed(2)}</em>
            </label>
            <label className="gs-slider">
              <span>斥力</span>
              <input
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={cfg.repelForce}
                onChange={(e) => updateSetting('repelForce', Number(e.target.value))}
              />
              <em>{cfg.repelForce.toFixed(2)}</em>
            </label>
            <label className="gs-slider">
              <span>连接力</span>
              <input
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={cfg.linkForce}
                onChange={(e) => updateSetting('linkForce', Number(e.target.value))}
              />
              <em>{cfg.linkForce.toFixed(2)}</em>
            </label>
            <label className="gs-slider">
              <span>连接距离</span>
              <input
                type="range"
                min={30}
                max={300}
                step={5}
                value={cfg.linkDistance}
                onChange={(e) => updateSetting('linkDistance', Number(e.target.value))}
              />
              <em>{cfg.linkDistance.toFixed(0)}</em>
            </label>
          </div>
        </div>

        {(prepared?.reduced || truncated) && (
          <div className="graph-note">
            工作区规模较大，图谱仅展示连接最多的 {cfg.maxNodes} 个节点（可在图谱设置调整上限）
          </div>
        )}
        {nodeCount === 0 && (
          <div className="graph-empty">
            暂无链接：用 [[笔记名]] 在文件之间建立链接后，这里会形成知识图谱
          </div>
        )}
        <div className="graph-legend">
          <span className="graph-legend-item"><i className="dot file" />笔记</span>
          <span className="graph-legend-item"><i className="dot ghost" />未解析</span>
          <span className="graph-legend-item"><i className="dot active" />当前文件</span>
          <span className="graph-legend-hint">拖动节点 · 滚轮缩放 · 点击打开</span>
        </div>
      </div>
    </div>
  )
}
