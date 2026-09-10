import {
  GRAPH_NODE_LIMIT,
  MAX_GRAPH_NODE_LIMIT,
  MIN_GRAPH_NODE_LIMIT,
} from './graph-data'

/** Persistent graph presentation and force-layout preferences. */
export interface GraphSettings {
  search: string
  arrows: boolean
  animate: boolean
  folderColor: boolean
  showOrphans: boolean
  nodeSize: number
  linkThickness: number
  textFade: number
  centerForce: number
  repelForce: number
  linkForce: number
  linkDistance: number
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
  // Labels stay limited to hover/current-file by default; lowering this value
  // enables zoom-based labels without rendering thousands of SVG text nodes.
  textFade: 10,
  centerForce: 1,
  repelForce: 1,
  linkForce: 1,
  linkDistance: 92,
  maxNodes: GRAPH_NODE_LIMIT,
}

export { MAX_GRAPH_NODE_LIMIT, MIN_GRAPH_NODE_LIMIT }
