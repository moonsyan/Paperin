# GraphView 维护边界

GraphView 是编辑器区的工作区级图谱标签。它保持零额外图形依赖，使用 SVG 和项目内置的力导向模拟。本文档记录组件拆分后的维护边界，不改变用户交互或持久化 schema。

## 模块职责

- `index.tsx`：组装数据、视口、布局、指针交互和子视图；保持对外 `GraphView`、`GraphSettings` 和 `DEFAULT_GRAPH_SETTINGS` 出口不变。
- `graph-settings.ts`：定义可持久化的图谱设置与默认值。
- `graph-data.ts`：将链接图或工作区索引转换为可渲染节点/边，并负责筛选和规模上限。
- `graph-visual.ts`：容纳结构签名、搜索命中、相邻表、节点半径和稳定目录色相等无副作用规则。
- `force.ts`：单一职责的确定性力导向算法。该文件虽超过 300 行，但内聚于模拟状态和每步积分；强行分开会扩大可变数值状态的边界，因此本次评估后保持不变。
- `useGraphLayout.ts`：管理模拟器生命周期、帧预算、位置快照、DOM 坐标批量更新和高亮 class。
- `useGraphViewport.ts`：管理尺寸观察、缩放/平移 transform、滚轮同步和 Escape 关闭。
- `useGraphNodeInteractions.ts`：管理节点指针捕获、拖动阈值、坐标转换与已解析/ghost 节点点击路由。
- `GraphCanvas.tsx`：只渲染 SVG 节点、边和箭头标记；模拟帧不通过 React state 重绘整图。
- `GraphToolbar.tsx` 与 `GraphSettingsPanel.tsx`：分别负责顶部操作和右侧设置表单。

## 交互与性能契约

- 图谱未激活时不渲染，并停止模拟循环。
- Escape 关闭活动图谱；焦点在设置搜索输入框时不触发关闭。
- 节点拖动使用 2px 阈值区分点击；已解析节点打开文件，ghost 节点走未解析回调。
- 平移、缩放和模拟帧直接更新 SVG transform/坐标，手势结束后才同步 React state，避免千级节点的每帧协调。
- 静态布局有 6,000 帧总预算；开启“动画”时允许收敛后保持微弱回热。
- 节点标签默认只在悬停、当前文件或达到缩放阈值时渲染，避免大图 SVG 文本膨胀。

## 直接测试

当前图谱反映传入索引，不自行证明磁盘目标仍存在。P0-07 已在 Main 索引层拆分正文解析与资源解析失效：`workspace-index-resources.ts` 维护依赖映射，`workspace-file-watcher` 合并附件事件；旧 generation 快照不被原地改写。目标删除/补回/移动后的 `resolvedPath`、ghost 与反链联动见 `workspace-index-service.test.ts` 与 `workspace-index-resources.test.ts`。索引释放与迟到回包属于已落地的 P1-08；监听故障可见降级见审查 A04。详见[项目状态](PROJECT-STATUS.md)与[实施计划](superpowers/plans/2026-09-22-product-workflow-implementation.md)。

- `graph-visual.test.ts`：结构签名、搜索命中、相邻表和稳定视觉计算。
- `GraphSettingsPanel.test.tsx`：设置控件的可访问名称、当前值和逐项更新契约。
- `index.test.tsx`：激活/失活、图数据变化、孤立节点、Escape 输入例外与节点点击路由。
- `force.test.ts` 与 `graph-data.test.ts`：数值模拟和数据裁剪/筛选边界。
