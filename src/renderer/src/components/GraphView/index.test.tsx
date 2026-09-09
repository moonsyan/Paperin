// @vitest-environment jsdom
/* ==================== GraphView 渲染冒烟测试 ====================
 *
 * 背景：图谱组件两次线上崩溃（TDZ 先用后声明）都没被纯逻辑单测覆盖——
 * 闭包内引用后声明的 const 是运行时错误，tsc 不检查闭包时序。
 * 本文件真实渲染组件：激活、失活（切到文件标签）、关闭、布局数据变化
 * 四条路径都必须不抛错。jsdom 缺少 rAF/ResizeObserver，测试内打桩。
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { DEFAULT_GRAPH_SETTINGS, GraphView } from './index'
import type { BacklinkGraph } from '../../lib/backlinks'

const graph: BacklinkGraph = {
  nodes: [
    { path: 'D:/ws/a.md', name: 'a.md', relPath: 'a.md', inDegree: 1, outDegree: 1 },
    { path: 'D:/ws/b.md', name: 'b.md', relPath: 'b.md', inDegree: 1, outDegree: 1 },
    { path: 'D:/ws/c.md', name: 'c.md', relPath: 'c.md', inDegree: 0, outDegree: 0 },
  ],
  edges: [
    {
      sourcePath: 'D:/ws/a.md',
      targetPath: 'D:/ws/b.md',
      target: 'b',
      line: 3,
      preview: '见 [[b]]',
      kind: 'wiki',
    },
    {
      sourcePath: 'D:/ws/b.md',
      targetPath: null,
      target: '不存在',
      line: 1,
      preview: '[[不存在]]',
      kind: 'wiki',
    },
  ],
  ghosts: [{ target: '不存在', refs: 1 }],
}

const noop = () => {}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback): number =>
    window.setTimeout(() => cb(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', (id: number): void => window.clearTimeout(id))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('GraphView 内置标签渲染', () => {
  it('激活时渲染链接节点与 ghost，孤立节点默认隐藏', () => {
    const { container } = render(
      <GraphView
        active
        graph={graph}
        activePath="D:/ws/a.md"
        workspaceName="ws"
        truncated={false}
        onClose={noop}
        onOpenNode={noop}
        onGhostClick={noop}
      />,
    )
    // a、b 有链接 + 1 个 ghost；c 无任何链接，默认隐藏
    expect(container.querySelectorAll('.graph-node')).toHaveLength(3)
    expect(container.querySelectorAll('.graph-edge')).toHaveLength(2)
    expect(container.querySelector('.graph-node.active')).not.toBeNull()
    expect(container.querySelectorAll('.graph-node.ghost')).toHaveLength(1)
  })

  it('设置 showOrphans 后孤立节点重新显示', () => {
    const { container } = render(
      <GraphView
        active
        graph={graph}
        activePath="D:/ws/a.md"
        workspaceName="ws"
        truncated={false}
        onClose={noop}
        onOpenNode={noop}
        onGhostClick={noop}
        settings={{ ...DEFAULT_GRAPH_SETTINGS, showOrphans: true }}
      />,
    )
    // a、b、c + 1 个 ghost
    expect(container.querySelectorAll('.graph-node')).toHaveLength(4)
  })

  it('失活（切到文件标签）不再渲染，重新激活不抛错', () => {
    const { container, rerender } = render(
      <GraphView
        active
        graph={graph}
        activePath={null}
        workspaceName="ws"
        truncated={false}
        onClose={noop}
        onOpenNode={noop}
        onGhostClick={noop}
      />,
    )
    expect(container.querySelectorAll('.graph-node').length).toBeGreaterThan(0)
    expect(() =>
      rerender(
        <GraphView
          active={false}
          graph={graph}
          activePath={null}
          workspaceName="ws"
          truncated={false}
          onClose={noop}
          onOpenNode={noop}
          onGhostClick={noop}
        />,
      ),
    ).not.toThrow()
    expect(container.querySelectorAll('.graph-node')).toHaveLength(0)
    expect(() =>
      rerender(
        <GraphView
          active
          graph={graph}
          activePath={null}
          workspaceName="ws"
          truncated={false}
          onClose={noop}
          onOpenNode={noop}
          onGhostClick={noop}
        />,
      ),
    ).not.toThrow()
    expect(container.querySelectorAll('.graph-node').length).toBeGreaterThan(0)
  })

  it('布局数据变化（新图谱对象）不抛错', () => {
    const { rerender } = render(
      <GraphView
        active
        graph={graph}
        activePath={null}
        workspaceName="ws"
        truncated={false}
        onClose={noop}
        onOpenNode={noop}
        onGhostClick={noop}
      />,
    )
    const bigger: BacklinkGraph = {
      ...graph,
      nodes: [
        ...graph.nodes,
        { path: 'D:/ws/d.md', name: 'd.md', relPath: 'd.md', inDegree: 0, outDegree: 0 },
      ],
    }
    expect(() =>
      rerender(
        <GraphView
          active
          graph={bigger}
          activePath="D:/ws/d.md"
          workspaceName="ws"
          truncated={false}
          onClose={noop}
          onOpenNode={noop}
          onGhostClick={noop}
        />,
      ),
    ).not.toThrow()
  })
})
