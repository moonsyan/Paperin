# 合成性能基线与脚本回归

## 结论

2026-09-10 在 Windows 开发机上完成了两项可复现的合成基线：5000 个 Markdown 文件的脚本扫描，以及单个 5 MiB Markdown 文件的脚本扫描。仓库现在随附默认场景、实测基线和脚本自身的回归阈值；`npm run perf:regression` 不再依赖缺失的本地文件。

这组数据验证的是 `scripts/perf-baseline.mjs` 的文件树遍历、结构解析与行级搜索口径，不等同于 Electron 窗口首屏、Milkdown 渲染或真实用户知识库的端到端性能。

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

阈值为跨开发机和 CI 抖动预留了余量，只用于捕获这套合成脚本口径自身的数量级退化；它不调用生产 `WorkspaceIndexService`、真实搜索 IPC 或 Electron Renderer，不能替代产品性能门禁，也不是所有设备的产品承诺。运行：

```powershell
npm run perf:regression
```

临时比较其他场景时可显式覆盖 `--documents` 和 `--size`。只有在相同口径下重新采集并人工审查结果后，才应运行以下命令更新 JSON 中的 `baseline` 和默认 `scenario`；更新基线不会自动放宽 `targets`：

```powershell
node scripts/perf-regression.mjs --update-baseline
```

## 尚未覆盖

- 20 个已打开标签页尚无自动化性能口径。现有脚本不启动 Renderer 或 Milkdown，无法可靠测量标签切换、编辑器装载、布局稳定时间与 Electron 总内存。后续应增加 Electron smoke 场景：打开 20 个真实文件、等待编辑器稳定、循环切换标签并记录 P50/P95 延迟与主进程/渲染进程 RSS。
- 当前 fixture 结构固定，未覆盖大量目录层级、超长行、复杂公式/Mermaid、图片解码、文件监听风暴或慢速磁盘。
- 索引和搜索只各测一次，适合作为粗粒度回归门禁；发布级性能报告应多轮采样并报告分位数。
- 峰值 RSS 目前记录但未作为失败条件，因为短任务的 10 ms 采样会漏掉瞬时峰值，且不同 Node.js 版本的基线差异较大。
