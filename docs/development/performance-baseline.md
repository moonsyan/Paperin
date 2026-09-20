# 性能基线与可执行回归

> 2026-09-19：下文保留当时的夹具和阈值。后来的 Electron 记录以 [REFACTOR-STATUS](../REFACTOR-STATUS.md) 为准，不要把 2026-09-10 的合成扫描和 2026-09-15/18 的真实保存耗时拼成同一次结果。

> 2026-09-14 历史复核说明：本文保留既有夹具、历史样本与阈值。当时 5 MiB 门禁还没有通过记录；2026-09-15 起的通过记录写在 [REFACTOR-STATUS](../REFACTOR-STATUS.md)，不要回写成“仍未通过”。文中“超过 1 MiB 优先快照”的实现实际为 `content.length > 1_000_000`（字符串长度），不是字节数。当前执行顺序见 [R00–R17 实施任务](../superpowers/plans/2026-09-20-product-strategy-execution.md)。

## 结论

2026-09-20（R09）：修复 Electron 冒烟 React **#301** 后重跑门禁。`npm run smoke` exit **0**；`npm run perf:electron` exit **0**，当次 `ELECTRON_PERF_METRICS`：`largeOpenMs` 1275.45、`largeSaveMs` 157.76、`largeExportMs` 85.33、20 标签切换 P95 **79.3** ms（40 次样本）。体验预算对照见下文 **§R09 体验预算（M01）**；未测项与未达标项保留目标值并标 **UNVERIFIED** 或阻塞原因，不修改阈值。

2026-09-10 在 Windows 开发机上完成了四项可复现基线：直接调用生产 `WorkspaceIndexService` 和真实文件系统适配器的 5000 文件索引门禁、真实主进程搜索 IPC 和 watcher 风暴门禁，以及 5000 文件、单个 5 MiB 文件的两项合成扫描。仓库随附实测基线和独立阈值。另提供真实 Electron 性能 smoke：它启动构建产物，让 5 MiB Markdown 经 Main → Preload → 文档会话 → Milkdown 打开、编辑、快捷键保存，并将编辑器真实 DOM 写入受信任的临时资源包；随后打开 20 个真实文件标签并循环切换。

生产门禁验证主进程实际装配的目录枚举、编码读取、`WorkspaceIndexService` 解析与增量复用，不复制索引算法。合成脚本仍只验证 `scripts/perf-baseline.mjs` 的文件树遍历、结构解析与行级搜索口径；两者都不等同于 Electron 窗口首屏、Milkdown 渲染或真实用户知识库的端到端性能。

## 生产搜索与 watcher 门禁

命令：

```powershell
npm run perf:workspace-search-watch
```

该门禁在系统临时目录生成 5,000 个真实 Markdown 文件，调用已注册的
`file:search-workspace` IPC handler（包括窗口工作区授权、目录遍历、文件 stat、
自动编码读取和行级匹配）。唯一命中词放在最后一个文件，因而测试会拒绝任何仅扫描
前若干文件的实现。搜索覆盖与生产索引共享 5,000 文件预算；结果数仍限制为 200，
两者的截断语义独立。

同一 fixture 还会先经生产 `WorkspaceIndexService` 和真实文件系统依赖建立暖索引，
再连续五次注入 20,000 个 watcher 事件。每轮必须合并为一个、恰有 5,000 条唯一路径
的批次，并在随后暖刷新完成时记录端到端稳定时间；报告重复样本的 P95。基线及阈值
保存在 `workspace-search-watch-performance-baseline.json`：本机搜索 P95 为 452.72 ms、
watcher 稳定 P95 为 189.43 ms，两个回归阈值均为 5,000 ms。输出仅含聚合指标，不含
用户文件路径或正文。

## 采集环境

| 项目 | 值 |
| --- | --- |
| 本地日期 | 2026-09-10（Asia/Shanghai） |
| 操作系统 | Microsoft Windows 11 专业版 10.0.26200 |
| CPU | Intel Core Ultra 7 265K |
| 内存 | 31.4 GiB |
| 架构 | AMD64 |
| Node.js | v24.19.0 |

fixture 仅在系统临时目录创建，测量结束后删除。fixture 写入时间不计入指标；文件树连续执行三次并取中位数，索引和搜索各执行一次。输出只包含聚合指标，不包含正文或绝对路径。

## 生产索引门禁

命令：

```powershell
npm run perf:production
```

门禁生成 5000 个 2048 B 的真实 Markdown 文件，然后直接使用应用主进程同一个 `createWorkspaceIndexFilesystemDependencies()` 和 `WorkspaceIndexService`。冷索引必须完整纳入 5000 个文件；无变更刷新必须不重读正文；修改一个文件后，增量刷新必须且只能多读取该文件一次。产品默认索引预算现为 5000 个文件，第 5001 个文件用于准确标记结果截断。

实测聚合数据保存在 `production-performance-baseline.json`：

| 指标 | 实测基线 | 失败阈值 |
| --- | ---: | ---: |
| 冷索引 | 1075.25 ms | 15000 ms |
| 无变更刷新 | 97.46 ms | 5000 ms |
| 单文件增量刷新 | 96.34 ms | 5000 ms |
| 峰值 RSS（记录项） | 131.8 MiB | 不设门禁 |

阈值为不同磁盘、杀毒软件和 CI 主机的波动保留余量，用于发现数量级退化，不是面向所有设备的产品承诺。门禁在每次运行时输出 `PRODUCTION_PERF_METRICS` JSON，便于保存和比较新的采集结果；基线时间为 `2026-09-10T13:00:21.884Z`，Node.js 为 v24.19.0。

## 实测结果

命令：

```powershell
npm run perf:baseline
npm run perf:large-file
```

| 场景 | 文件树 `treeMs` | 结构索引 `indexMs` | 搜索 `searchMs` | 峰值 RSS |
| --- | ---: | ---: | ---: | ---: |
| 5000 文件 × 2048 B | 11.55 ms | 474.95 ms | 345.38 ms | 142.5 MiB |
| 1 文件 × 5 MiB | 1.12 ms | 36.00 ms | 23.29 ms | 56.9 MiB |

原始聚合结果和默认场景保存在 `docs/development/performance-baseline.json`。时间戳使用 UTC：5000 文件场景为 `2026-09-09T16:51:26.508Z`，5 MiB 场景为 `2026-09-09T16:51:26.793Z`。

## 合成脚本回归阈值

默认回归场景为 5000 文件 × 2048 B：

| 指标 | 基线 | 失败阈值 |
| --- | ---: | ---: |
| 文件树 | 11.55 ms | 200 ms |
| 结构索引 | 474.95 ms | 2000 ms |
| 搜索 | 345.38 ms | 1500 ms |

阈值为跨开发机和 CI 抖动预留了余量，只用于捕获这套合成脚本口径自身的数量级退化；它不调用生产 `WorkspaceIndexService`、真实搜索 IPC 或 Electron Renderer，不能替代上述生产索引门禁，也不是所有设备的产品承诺。运行：

```powershell
npm run perf:regression
```

临时比较其他场景时可显式覆盖 `--documents` 和 `--size`。只有在相同口径下重新采集并人工审查结果后，才应运行以下命令更新 JSON 中的 `baseline` 和默认 `scenario`；更新基线不会自动放宽 `targets`：

```powershell
node scripts/perf-regression.mjs --update-baseline
```

## 真实 Electron 大文档与标签门禁

运行前先构建，再执行：

```powershell
npm run build
npm run perf:electron
```

该命令创建并删除唯一的临时工作区，不触碰用户工作区或设置。导出选择原生对话框无法在无人值守环境安全、稳定地驱动，因此它刻意选用现有的 `exportBundle` 资源包通道：目标目录是 Main 已授信的临时工作区，导出仍经过真实 IPC、体积限制、路径授权和原子写入。它不把自动化脚本变成可向任意路径写入的旁路。

门禁的 5 MiB 夹具由 256 个约 20 KiB 的 Markdown 段落组成：它固定正文尺寸，同时避免把“单文档大小”测试意外变成数万短段落的极端节点压力测试。它会打印 `ELECTRON_PERF_METRICS` JSON，包括 5 MiB 打开、保存、资源包导出时间，40 次（20 标签 × 2 轮）切换的 P50/P95/最大延迟，主进程 RSS，以及 Chromium 可用时的渲染器 JS heap。缺少 Chromium `performance.memory` 时该字段为 `null`，不把“不支持指标”误判为零内存。

| 指标 | 阈值 | 含义 |
| --- | --- | --- |
| 5 MiB 打开并完成 Milkdown 装载 | 120 s | 包含真实解析、流式替换与尾部内容可读检查 |
| 5 MiB 编辑后 Ctrl+S 持久化 | 120 s | 确认编辑标记经正常快捷键进入磁盘文件 |
| 5 MiB 资源包导出 | 60 s | 确认编辑器 DOM 中的编辑标记经受信 IPC 原子写出 |
| 20 标签切换 P95 | 10 s | 每轮都检查活动标签和对应正文标记，防止只量到视觉切换 |

这些值是跨磁盘、杀毒软件和 CI 图形环境的失效保护线，目的是发现卡死、错误的全量重载或数量级退化，而不是把本机结果伪装成所有设备的用户体验承诺。每次有意更新基线时，应保留一次 `ELECTRON_PERF_METRICS` 输出及运行环境信息。

2026-09-10 的早期脚本曾报告超过 240 秒未观察到保存完成；旧观察方式不能证明 IPC 未调用。2026-09-15 的分段核对证实，Milkdown 已将末次输入写进 ProseMirror 并在约 450 ms 后生成 Markdown 快照，真实保存 IPC 约 100 ms 返回成功。失败由门禁匹配原始 `PERF_LARGE...`，却漏掉 Milkdown 的 `PERF\_LARGE...` 正文转义造成；不可写的 preload bridge 包装又额外引入 15 秒等待。生产保存和 Q02 的快照保护保持原状，本次修正验收观察方式。

| 2026-09-15 独立批次 | 5 MiB 打开 | 末次输入保存到磁盘 | 资源包导出 | 20 标签 40 次暖切换 P95 | 结果 |
| --- | ---: | ---: | ---: | ---: | --- |
| 1 | 1272.37 ms | 211.56 ms | 60.74 ms | 29.9 ms | 全部通过 |
| 2 | 1231.72 ms | 226.47 ms | 52.33 ms | 29.6 ms | 全部通过 |
| 3 | 1212.50 ms | 185.64 ms | 54.29 ms | 29.4 ms | 全部通过 |

## R09 体验预算（M01，2026-09-20）

环境：Windows 11 26200、Core Ultra 7 265K、31.4 GiB、Node v24.19.0、Electron 43、生产构建；夹具见 `src/main/testing/fixtures/` 与 `scripts/performance-fixtures.mjs`（smoke 用）。下列为**真实 Electron 用户动作**或**生产 IPC 门禁**；合成 `perf:baseline` 扫描时延不得代入本表。

| 指标 | 体验目标 | 2026-09-20 实测 | 判定 |
| --- | ---: | --- | --- |
| 普通输入 P95 | ≤50 ms | 未采集 | **UNVERIFIED** |
| 普通保存 P95 | ≤500 ms | 5 MiB 单次 157.76 ms（perf:electron） | 单次优于目标；M01 50× 协议未跑 |
| 20 标签暖切换 P95 | ≤300 ms | 79.3 ms（40 次） | 达标 |
| 5 MiB 打开 | ≤10 s | 1275.45 ms | 达标 |
| 5 MiB 保存 | ≤5 s | 157.76 ms | 达标 |
| 5000 文档搜索 P95 | ≤800 ms | `perf:production` watcher 子项失败（`INVALID_TARGET`）；历史搜索 P95 452.72 ms 见上节 | 门禁阻塞，不推断通过 |
| 多结构 5 MiB ×20（Electron） | M01 协议 | 未跑 | **UNVERIFIED** |
| 第二台 16GB 设备 / 8 h 稳定性 | M01/Q01 | 未跑 | **UNVERIFIED** |

原始 JSON（当次 perf:electron）：

```json
{"largeOpenMs":1275.45,"largeSaveMs":157.76,"largeExportMs":85.33,"tabSwitch":{"count":40,"p50Ms":44.3,"p95Ms":79.3,"maxMs":1129.4},"mainRssMb":488.93}
```

## 尚未覆盖

2026-09-15 复核确认：context bridge 对象不可写，旧脚本对 `document.save` 的包装不能证明 IPC 未调用。临时分段核对已看到保存 IPC 成功回执；正式门禁现以磁盘中的原文尾部和末次编辑确认结果。历史“未进入 IPC”只保留为旧观察器的误判记录。

- 真实 Electron 门禁覆盖一次临时工作区的主/预加载/渲染路径，但不等同于 Windows 安装后的原生文件关联、macOS/Linux 包、GPU 合成性能或真实用户工作区的长期内存曲线。
- 资源包导出覆盖可无人值守验证的安全格式；原生文件选择器驱动的 HTML、PDF、DOCX、pandoc 导出，以及超大 PDF 的打印窗口内存，仍需在对应平台手工或专用 E2E 环境验证。
- 搜索和 watcher 门禁运行于 Node/Vitest 中的真实主进程模块与文件系统，不启动完整 Electron 窗口；仍不能代替渲染器搜索面板、首屏和跨进程调度的端到端测量。
- 当前 fixture 结构固定，未覆盖大量目录层级、超长行、复杂公式/Mermaid、图片解码、文件监听风暴或慢速磁盘。
- 索引和搜索只各测一次，适合作为粗粒度回归门禁；发布级性能报告应多轮采样并报告分位数。
- 峰值 RSS 目前记录但未作为失败条件，因为短任务的 10 ms 采样会漏掉瞬时峰值，且不同 Node.js 版本的基线差异较大。
