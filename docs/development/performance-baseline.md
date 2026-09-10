# 性能基线与可执行回归

## 结论

2026-09-10 在 Windows 开发机上完成了三项可复现基线：直接调用生产 `WorkspaceIndexService` 和真实文件系统适配器的 5000 文件索引门禁，以及 5000 文件、单个 5 MiB 文件的两项合成扫描。仓库随附实测基线和独立阈值。

生产门禁验证主进程实际装配的目录枚举、编码读取、`WorkspaceIndexService` 解析与增量复用，不复制索引算法。合成脚本仍只验证 `scripts/perf-baseline.mjs` 的文件树遍历、结构解析与行级搜索口径；两者都不等同于 Electron 窗口首屏、Milkdown 渲染或真实用户知识库的端到端性能。

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

## 尚未覆盖

- 单个 5 MiB 文件当前只有合成扫描数据；尚未通过生产编辑器会话测量打开、Milkdown 装载、编辑、保存和导出，因此不把合成结果宣称为产品门禁。
- 20 个已打开标签页尚无自动化性能口径。现有脚本不启动 Renderer 或 Milkdown，无法可靠测量标签切换、编辑器装载、布局稳定时间与 Electron 总内存。后续应增加 Electron smoke 场景：打开 20 个真实文件、等待编辑器稳定、循环切换标签并记录 P50/P95 延迟与主进程/渲染进程 RSS。
- 真实全文搜索 IPC 仍受 500 文件扫描预算约束，尚未建立 5000 文件搜索门禁；文件监听已有防抖和行为测试，但尚未测量监听风暴下从事件到索引稳定的 P95。
- 当前 fixture 结构固定，未覆盖大量目录层级、超长行、复杂公式/Mermaid、图片解码、文件监听风暴或慢速磁盘。
- 索引和搜索只各测一次，适合作为粗粒度回归门禁；发布级性能报告应多轮采样并报告分位数。
- 峰值 RSS 目前记录但未作为失败条件，因为短任务的 10 ms 采样会漏掉瞬时峰值，且不同 Node.js 版本的基线差异较大。
