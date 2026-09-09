/* ==================== 力导向布局模拟（零依赖，供知识图谱使用） ==================== */

export interface ForceNode {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  /** 拖拽期间的固定位置（存在即视为钉住） */
  fx?: number
  fy?: number
  /** 视觉半径（按度数） */
  radius: number
}

export interface ForceLink {
  source: number
  target: number
}

const ALPHA_DECAY = 0.985
const ALPHA_MIN = 0.02
const VELOCITY_DECAY = 0.78
const REPULSE_STRENGTH = 2600
const REPULSE_SAMPLE_LIMIT = 30
/** 大图斥力采样的确定性步进系数（随 tick 平移配对序列）：
 *  随机采样每次布局结果都不同、且高温段表现为持续随机游走（不"稳定"），
 *  确定性步进在有限 tick 内覆盖全体节点对，布局可复现、收敛平稳。
 *  步进取与常见节点数互斥的小质数——过大的质数会在 n 恰好等于它时
 *  让 k 项归零，30 个采样伙伴退化成同一个节点 */
const SAMPLE_STRIDE_A = 11
const SAMPLE_STRIDE_B = 7
const SAMPLE_STRIDE_C = 53
const SPRING_LENGTH = 92
const SPRING_STRENGTH = 0.035
const GRAVITY = 0.028
/** 径向软约束半径系数：圆形边界的回拉强度（Obsidian 式球形轮廓） */
const RADIAL_PULL = 0.14
/** 节点碰撞最小间隙（像素），弹簧 rest 长度同样受它约束 */
const COLLIDE_PAD = 2
/**
 * 碰撞修正强度的低温下限。碰撞是纯位置解算（不注入动能），配合
 * VELOCITY_DECAY 不会抖动；若随 alpha 衰减到接近零，低温段弹簧会把
 * 邻居拉进重叠区而碰撞推不开，模拟停机时重叠被永久冻结。
 */
const COLLIDE_STRENGTH_MIN = 0.72
/** 停机前全强度终局解算的轮数 */
const FINAL_COLLIDE_ROUNDS = 4

/** 作用力参数（Obsidian 图谱设置面板同款，均为基准值的倍率） */
export interface ForceParams {
  /** 向心力倍率 0–2 */
  centerForce: number
  /** 斥力倍率 0–2 */
  repelForce: number
  /** 弹簧劲度倍率 0–2 */
  linkForce: number
  /** 期望边长（像素） */
  linkDistance: number
  /** 节点显示大小倍率（参与碰撞半径，保证放大后仍不遮挡） */
  nodeScale: number
}

export const DEFAULT_FORCE_PARAMS: ForceParams = {
  centerForce: 1,
  repelForce: 1,
  linkForce: 1,
  linkDistance: SPRING_LENGTH,
  nodeScale: 1,
}

/**
 * 经典力导向（Fruchterman-Reingold 简化版）：
 * 斥力（节点对）+ 弹簧（边）+ 向心力，alpha 随迭代衰减至静止。
 * 节点数超过采样上限时对斥力做随机采样（每 tick 每节点与固定数量
 * 随机节点互斥），避免大图 O(n²) 卡顿；采样在大图下视觉差异可忽略。
 */
export class ForceSimulation {
  private alpha = 1
  private width: number
  private height: number
  readonly nodes: ForceNode[]
  readonly links: ForceLink[]
  private readonly nodeCount: number
  private params: ForceParams = DEFAULT_FORCE_PARAMS
  /** 已执行的 tick 数（确定性采样配对序列的相位） */
  private tickCount = 0

  /**
   * @param initialPositions 初始位置（按节点 id）：切回标签/重开视图时按
   *        上次布局原位置温和回热；缺省按黄金角螺旋确定性初始化
   */
  constructor(
    nodes: ForceNode[],
    links: ForceLink[],
    width: number,
    height: number,
    initialPositions?: Map<string, { x: number; y: number }>,
    params?: ForceParams,
  ) {
    this.nodes = nodes
    this.links = links
    this.width = width
    this.height = height
    this.nodeCount = nodes.length
    if (params) this.params = params
    const cx = width / 2
    const cy = height / 2
    nodes.forEach((node, i) => {
      const saved = initialPositions?.get(node.id)
      if (saved) {
        node.x = saved.x
        node.y = saved.y
      } else {
        const angle = i * 2.399963
        const r = 18 * Math.sqrt(i + 1)
        node.x = cx + r * Math.cos(angle)
        node.y = cy + r * Math.sin(angle)
      }
      node.vx = 0
      node.vy = 0
    })
  }

  setSize(width: number, height: number): void {
    this.width = width
    this.height = height
  }

  setParams(params: ForceParams): void {
    this.params = params
  }

  /**
   * 碰撞分离（Obsidian forceCollide 同款作用）：重叠的节点圆彼此推开，
   * 保证任何缩放/节点大小下文件节点互不遮挡。基于均匀空间网格查邻
   * （O(n) 建格 + 每节点只查 3×3 邻格），并对每节点检查数设上限，
   * 1500 节点每帧仅数千次运算。位置法直接解算，每步迭代两轮收紧。
   *
   * @param strength 本步修正强度（0–1）；@param rounds 解算轮数。
   *                停机前的终局解算用全强度多轮，保证冻结态无遮挡。
   */
  private resolveCollisions(strength: number, rounds = 2): void {
    const nodes = this.nodes
    const n = this.nodeCount
    if (n < 2) return
    const scale = this.params.nodeScale
    const pad = COLLIDE_PAD
    let maxRadius = 0
    for (let i = 0; i < n; i++) {
      const r = nodes[i].radius * scale
      if (r > maxRadius) maxRadius = r
    }
    const cell = Math.max(24, maxRadius * 2 + pad)
    const toCell = (v: number): number => {
      const c = Math.floor(v / cell)
      return c < -128 ? -128 : c > 127 ? 127 : c
    }
    const grid = new Map<number, number[]>()
    for (let i = 0; i < n; i++) {
      const key = (toCell(nodes[i].x) + 128) * 256 + (toCell(nodes[i].y) + 128)
      const bucket = grid.get(key)
      if (bucket) bucket.push(i)
      else grid.set(key, [i])
    }
    // 密集堆叠区（大图中心簇、大量 ghost 挤在一起）需要更多邻检才能
    // 完全解开重叠；小图放宽预算几乎零开销，大图控制在帧预算内
    const MAX_CHECKS = n > 800 ? 32 : 64
    for (let round = 0; round < rounds; round++) {
      for (let i = 0; i < n; i++) {
        const a = nodes[i]
        const gx = toCell(a.x)
        const gy = toCell(a.y)
        let checks = 0
        for (let dx = -1; dx <= 1 && checks < MAX_CHECKS; dx++) {
          for (let dy = -1; dy <= 1 && checks < MAX_CHECKS; dy++) {
            const bucket = grid.get((gx + dx + 128) * 256 + (gy + dy + 128))
            if (!bucket) continue
            for (const j of bucket) {
              if (checks >= MAX_CHECKS) break
              if (j <= i) continue
              const b = nodes[j]
              checks++
              const minDist = (a.radius + b.radius) * scale + pad
              let ox = b.x - a.x
              let oy = b.y - a.y
              const distSq = ox * ox + oy * oy
              if (distSq >= minDist * minDist) continue
              let dist = Math.sqrt(distSq)
              if (dist < 0.01) {
                ox = (i % 2 === 0 ? 1 : -1) * 0.1
                oy = 0.05
                dist = 0.11
              }
              const overlap = (minDist - dist) / dist
              const aFixed = a.fx !== undefined
              const bFixed = b.fx !== undefined
              if (aFixed && bFixed) continue
              const share = (aFixed || bFixed ? 1 : 0.5) * strength
              const ax = ox * overlap * share
              const ay = oy * overlap * share
              if (!aFixed) {
                a.x -= ax
                a.y -= ay
              }
              if (!bFixed) {
                b.x += ax
                b.y += ay
              }
            }
          }
        }
      }
    }
  }

  restart(): void {
    this.alpha = 1
  }

  /** 温和回热：数据未变时低强度重新收敛（切回标签/拖拽/窗口尺寸变化） */
  reheat(alpha = 0.2): void {
    this.alpha = Math.max(this.alpha, Math.min(1, alpha))
  }

  get active(): boolean {
    return this.alpha > ALPHA_MIN
  }

  /** 执行一步模拟；返回是否仍需继续迭代 */
  step(): boolean {
    if (!this.active) return false
    const { nodes, links } = this
    const n = this.nodeCount
    if (n === 0) {
      this.alpha = 0
      return false
    }
    const sampled = n > REPULSE_SAMPLE_LIMIT * 3
    this.tickCount++

    // 斥力
    for (let i = 0; i < n; i++) {
      const a = nodes[i]
      // 采样模式：与若干确定性轮换的伙伴节点互斥（每次布局结果一致）；
      // 小图严格全对互斥
      const partnerCount = sampled ? REPULSE_SAMPLE_LIMIT : n
      for (let k = 0; k < partnerCount; k++) {
        const j = sampled
          ? (i * SAMPLE_STRIDE_A + k * SAMPLE_STRIDE_B + this.tickCount * SAMPLE_STRIDE_C) % n
          : k
        if (j <= i) continue
        const b = nodes[j]
        let dx = a.x - b.x
        let dy = a.y - b.y
        let distSq = dx * dx + dy * dy
        if (distSq < 1) {
          // 重合节点给确定性微小位移脱离奇点（相位取自索引的黄金比例，
          // 不用随机数——随机位移会让每次布局结果不可复现）
          const angle = ((i * 0.6180339887 + j * 0.7548776662) % 1) * Math.PI * 2
          dx = Math.cos(angle) * 0.5
          dy = Math.sin(angle) * 0.5
          distSq = 0.25
        }
        const dist = Math.sqrt(distSq)
        const force = Math.min((REPULSE_STRENGTH * this.params.repelForce) / distSq, 12)
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        a.vx += fx
        a.vy += fy
        b.vx -= fx
        b.vy -= fy
      }
    }

    // 弹簧（边）。rest 长度不小于两端碰撞半径之和：否则连接距离调到
    // 小于节点直径时，弹簧全强度把邻居拉进重叠区，与碰撞解算永久对抗，
    // 表现为布局始终无法收敛到无遮挡状态。
    for (const link of links) {
      const a = nodes[link.source]
      const b = nodes[link.target]
      if (!a || !b) continue
      const rest = Math.max(
        this.params.linkDistance,
        (a.radius + b.radius) * this.params.nodeScale + COLLIDE_PAD,
      )
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
      const force = (dist - rest) * (SPRING_STRENGTH * this.params.linkForce)
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      a.vx += fx
      a.vy += fy
      b.vx -= fx
      b.vy -= fy
    }

    // 向心 + 积分
    const cx = this.width / 2
    const cy = this.height / 2
    // 圆形软边界：超出球半径的节点按超出量向内拉，整体收敛成
    // Obsidian 式的球形轮廓（不做矩形硬裁剪——裁剪会把布局压成扁条）
    const radius = Math.max(80, Math.min(this.width, this.height) / 2 - 24)
    for (const node of nodes) {
      node.vx += (cx - node.x) * GRAVITY * this.params.centerForce * this.alpha
      node.vy += (cy - node.y) * GRAVITY * this.params.centerForce * this.alpha
      if (node.fx !== undefined) {
        node.x = node.fx
        node.y = node.fy ?? node.y
        node.vx = 0
        node.vy = 0
        continue
      }
      node.vx *= VELOCITY_DECAY
      node.vy *= VELOCITY_DECAY
      node.x += Math.max(-18, Math.min(18, node.vx))
      node.y += Math.max(-18, Math.min(18, node.vy))
      const dx = node.x - cx
      const dy = node.y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > radius && dist > 0) {
        const pull = ((dist - radius) / dist) * RADIAL_PULL
        node.x -= dx * pull
        node.y -= dy * pull
      }
    }

    // 碰撞分离放在积分与边界之后：任何力把节点挤到一起都在此解开，
    // 收敛后仍每步执行（否则拖动/参数变化时节点重新叠住）。
    // 低温段保底下限见 COLLIDE_STRENGTH_MIN 注释。
    this.resolveCollisions(Math.min(1, Math.max(COLLIDE_STRENGTH_MIN, this.alpha * 6)))

    this.alpha *= ALPHA_DECAY
    if (this.alpha <= ALPHA_MIN) {
      this.alpha = 0
      // 终局解算：模拟即将冻结，以全强度多轮解开低温段累积的残余重叠，
      // 保证最终呈现的布局互不遮挡（纯位置操作，对已分离节点零影响）
      this.resolveCollisions(1, FINAL_COLLIDE_ROUNDS)
    }
    return true
  }
}
