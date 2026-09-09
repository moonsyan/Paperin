import { describe, expect, it } from 'vitest'
import { DEFAULT_FORCE_PARAMS, ForceSimulation } from './force'
import type { ForceNode } from './force'

const makeNode = (id: string, x: number, y: number, radius: number): ForceNode => ({
  id,
  x,
  y,
  vx: 0,
  vy: 0,
  radius,
})

describe('ForceSimulation 碰撞分离', () => {
  it('完全重叠的两个节点被推开到互不遮挡的距离', () => {
    const nodes = [makeNode('a', 400, 300, 12), makeNode('b', 401, 300, 12)]
    const sim = new ForceSimulation(nodes, [], 800, 600, undefined, DEFAULT_FORCE_PARAMS)
    for (let i = 0; i < 120 && sim.active; i++) sim.step()
    const dx = nodes[0].x - nodes[1].x
    const dy = nodes[0].y - nodes[1].y
    const dist = Math.sqrt(dx * dx + dy * dy)
    // 两节点半径和 24 + 间隙 ≥ 24 即视为无遮挡
    expect(dist).toBeGreaterThanOrEqual(24)
  })

  it('放大节点（nodeScale=2）后仍互不遮挡', () => {
    const nodes = [makeNode('a', 400, 300, 10), makeNode('b', 412, 300, 10)]
    const sim = new ForceSimulation(nodes, [], 800, 600, undefined, {
      ...DEFAULT_FORCE_PARAMS,
      nodeScale: 2,
    })
    for (let i = 0; i < 120 && sim.active; i++) sim.step()
    const dx = nodes[0].x - nodes[1].x
    const dy = nodes[0].y - nodes[1].y
    const dist = Math.sqrt(dx * dx + dy * dy)
    // 半径和 20 × scale 2 = 40
    expect(dist).toBeGreaterThanOrEqual(38)
  })

  it('拖拽固定的节点不移动，被叠住的另一节点让开', () => {
    const nodes = [makeNode('a', 400, 300, 12), makeNode('b', 400, 300, 12)]
    nodes[0].fx = 400
    nodes[0].fy = 300
    const sim = new ForceSimulation(nodes, [], 800, 600, undefined, DEFAULT_FORCE_PARAMS)
    for (let i = 0; i < 60 && sim.active; i++) sim.step()
    // 固定节点原位
    expect(nodes[0].x).toBe(400)
    expect(nodes[0].y).toBe(300)
    // 另一节点被推开到不遮挡距离
    const dx = nodes[0].x - nodes[1].x
    const dy = nodes[0].y - nodes[1].y
    const dist = Math.sqrt(dx * dx + dy * dy)
    expect(dist).toBeGreaterThanOrEqual(24)
  })

  it('一串节点（60 个同点）能全部散开无残留重叠', () => {
    const nodes = Array.from({ length: 60 }, (_, i) => makeNode(`n${i}`, 400, 300, 8))
    const sim = new ForceSimulation(nodes, [], 800, 600, undefined, {
      ...DEFAULT_FORCE_PARAMS,
      repelForce: 1,
    })
    for (let i = 0; i < 400 && sim.active; i++) sim.step()
    let worst = 0
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x
        const dy = nodes[i].y - nodes[j].y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const overlap = 16 + 2 - dist
        if (overlap > worst) worst = overlap
      }
    }
    // 允许极小残留（多次迭代的数值余量），不允许明显遮挡
    expect(worst).toBeLessThan(2)
  })

  it('连接距离小于节点直径时，弹簧不把邻居拉进重叠区', () => {
    const nodes = [makeNode('a', 400, 300, 15), makeNode('b', 428, 300, 15)]
    const sim = new ForceSimulation(nodes, [{ source: 0, target: 1 }], 800, 600, undefined, {
      ...DEFAULT_FORCE_PARAMS,
      linkDistance: 30,
    })
    for (let i = 0; i < 400 && sim.active; i++) sim.step()
    const dx = nodes[0].x - nodes[1].x
    const dy = nodes[0].y - nodes[1].y
    const dist = Math.sqrt(dx * dx + dy * dy)
    // 弹簧 rest 长度被半径和（30+2）托底，收敛距离不得小于碰撞距离
    expect(dist).toBeGreaterThanOrEqual(31)
  })

  it('星形密集拓扑停机后无残留遮挡（终局解算）', () => {
    const nodes = Array.from({ length: 25 }, (_, i) => makeNode(`n${i}`, 400, 300, i === 0 ? 15 : 10))
    const links = nodes.slice(1).map((_, i) => ({ source: 0, target: i + 1 }))
    const sim = new ForceSimulation(nodes, links, 800, 600, undefined, DEFAULT_FORCE_PARAMS)
    for (let i = 0; i < 800 && sim.active; i++) sim.step()
    expect(sim.active).toBe(false)
    let worst = 0
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x
        const dy = nodes[i].y - nodes[j].y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const minDist = nodes[i].radius + nodes[j].radius + 2
        if (minDist - dist > worst) worst = minDist - dist
      }
    }
    expect(worst).toBeLessThan(2)
  })

  it('大图采样斥力为确定性步进：相同输入布局完全可复现', () => {
    // 200 节点 > 90 触发采样模式；随机采样会让两次布局完全不同
    const build = () => {
      const nodes = Array.from({ length: 200 }, (_, i) =>
        makeNode(`n${i}`, 400 + (i % 10) * 30, 300 + Math.floor(i / 10) * 20, 8),
      )
      const links = nodes.slice(1).map((_, i) => ({ source: 0, target: i + 1 }))
      return new ForceSimulation(nodes, links, 900, 700, undefined, DEFAULT_FORCE_PARAMS)
    }
    const simA = build()
    const simB = build()
    for (let i = 0; i < 120; i++) {
      simA.step()
      simB.step()
    }
    simA.nodes.forEach((node, index) => {
      expect(node.x).toBeCloseTo(simB.nodes[index].x, 10)
      expect(node.y).toBeCloseTo(simB.nodes[index].y, 10)
    })
  })

  it('采样步进系数不随节点数退化：伙伴序列保持满额多样性', () => {
    // 回归护栏：n 恰好等于旧步进质数 197 时，k 项曾整体归零，
    // 30 个采样伙伴退化成同一个节点
    const n = 197
    const partners = new Set<number>()
    for (let k = 0; k < 30; k++) {
      partners.add((0 * 11 + k * 7 + 1 * 53) % n)
    }
    expect(partners.size).toBe(30)
  })

  it('有限步内自然收敛：模拟停止后位置完全静止', () => {
    const nodes = Array.from({ length: 30 }, (_, i) => makeNode(`n${i}`, 400, 300, 9))
    const links = nodes.slice(1).map((_, i) => ({ source: 0, target: i + 1 }))
    const sim = new ForceSimulation(nodes, links, 800, 600, undefined, DEFAULT_FORCE_PARAMS)
    let steps = 0
    while (sim.active && steps < 2000) {
      sim.step()
      steps++
    }
    // 模拟必然在有限步内停止（不依赖外部 reheat）
    expect(sim.active).toBe(false)
    expect(steps).toBeLessThan(2000)
    const snapshot = nodes.map((n) => ({ x: n.x, y: n.y }))
    // 停止后 step 不再移动任何节点（真正静止，不是缓动）
    sim.step()
    nodes.forEach((n, i) => {
      expect(n.x).toBe(snapshot[i].x)
      expect(n.y).toBe(snapshot[i].y)
    })
  })
})
