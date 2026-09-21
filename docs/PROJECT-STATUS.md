# Paperin 项目状态

更新时间：2026-09-21（Asia/Shanghai）  
代码基线：`97210a50e16606bae60ad9ed9b158d7e599b10d6`（`master`）  
产品版本：`0.6.0`

> 本文只记录当前状态，不保存逐批实施日志。历史任务、提交与当时的验证结果由 Git 历史和 [2026-09-20 代码审计快照](development/product-audit-2026-09-20.md)承担。当前战略见[全量战略发展报告](PRODUCT-STRATEGY-REVIEW-2026-09-21.md)，执行顺序见[产品战略实施计划](superpowers/plans/2026-09-21-product-strategy-implementation.md)。

## 当前结论

Paperin 已有完整的 Electron 本地桌面架构和较密集的自动测试，Markdown 编辑、工作区、多标签、搜索、来源引用、草稿、版本历史、冲突保护、恢复写入和多格式导出均有生产实现。当前最准确的阶段是：

> 工程化程度较高的个人产品候选，处于私有种子验证和发行门禁收敛期。

目前不能称为稳定公开版。许可、隐私和安全入口已经在仓库里；Windows 安装循环仍未验证，两位现有用户的任务记录尚未采集。

## 产品定位

> Paperin 是面向个人技术写作者和独立开发者的本地 Markdown 项目知识工作台，帮助用户把散落的项目资料写成带来源、可持续维护、可直接交付的文档。

短表达：**把项目资料，写成能交付、能继续维护的文档。**

当前核心任务：

```text
打开自己的资料
  -> 找到相关内容和来源
  -> 写成当前结论
  -> 安全保存并继续维护
  -> 交付 Markdown / HTML / PDF / Word 等成果
```

## 新鲜门禁结果

| 检查 | 2026-09-21 结果 | 当前判断 |
| --- | --- | --- |
| `npm run lint` | 退出 0 | 当前 lint 基线通过 |
| `npm run typecheck` | 退出 0 | Renderer 与 Node 严格类型检查通过 |
| `npm run test` | 221 个文件、1600 项测试通过 | 自动测试基线通过，不代表桌面链路通过 |
| `npm run build` | 退出 0 | 生产构建通过，未证明安装器可用 |
| `npm run a11y` | 退出 0；仍有 37 项对比度基线债务 | 没有新增静态违规，不能宣称全面可访问 |
| `npm run smoke` | 退出 0；打开工作区、新建、保存、冲突、重命名、搜索、关闭、系统文件关联，以及来源查找/插入引用/保存重开/资源包导出 | 核心任务冒烟先走真实「打开文件夹」菜单绑定渲染层工作区，再打开全文搜索；步骤失败输出 `CORE_TASK_FAIL` |
| `npm run perf:regression` | Node 22.23.2 与 Node 24.19.0 空闲各三轮退出 0；索引/搜索读盘占墙钟约 85%–95% | 与 2026-09-09 基线同量级。同日审查的 3482/1672 ms 判定为 I/O 波动；阈值未改 |
| `npm run perf:production` | 2 个性能文件、3 项测试全部通过；搜索 P95 1350.59 ms，冷索引 1558.02 ms | 夹具已调用真实 `trustDirectory`；搜索 IPC 进入性能测量。与合成 `perf:regression` 的 2000/1500 ms 阈值是不同口径 |
| `npm audit --omit=dev --audit-level=moderate` | 0 vulnerabilities；生产 `js-yaml@4.3.2` | 已消除 GHSA-2883-xcg3-v3hh；dev 依赖审计仍独立 |

历史提交上的绿灯不能替代当前 `HEAD` 的新鲜结果。上表里的 lint、a11y、smoke、性能和审计是同日工程提交上的记录；测试计数在 `97210a5` 上重跑。工作区路径授权、依赖升级和发行材料的代码与文档已经落地；安装循环、真人样本和 8 小时实测仍未验证。

## 当前阻断和优先级

| 优先级 | 状态 | 完成定义 |
| --- | --- | --- |
| P0 | 修复工作区规范路径比较 | **已完成**：不存在目标使用最近存在父目录的真实路径比较；短路径/长路径、junction 换靶和多窗口越权有回归；`npm run smoke` 退出 0 |
| P0 | 修正生产搜索性能夹具授权 | **已完成**：夹具调用真实 `trustDirectory` 与 `isPathTrusted`，搜索 IPC 不再因测试装配返回 `INVALID_TARGET` |
| P0 | 诊断 5000 篇性能退化 | **已完成**：分段指标证明空闲样本通过且为读盘主导；保留 200/2000/1500 ms 阈值，未覆盖基线 |
| P0 | 升级易受攻击的间接依赖 | **已完成**：生产依赖审计无 moderate 及以上漏洞；`js-yaml` 由 4.3.1 升至 4.3.2，锁文件门禁拒绝回退 |
| P0 | 清理失效 `demo:soft*` 脚本 | **已完成**：`package.json` 不再引用不存在的 `design/soft-workbench` |
| P0 | 收紧联网与外部服务凭据 | **已完成**：生产环境默认检查/下载/退出安装，设置中有可见开关，关闭后下次启动不联网也不安装已下载包。开发环境永不检查。SM.MS token 经 `safeStorage` 加密；渲染进程只有 `configured`/`credentialState`；明文迁移失败与安全存储不可用均禁用远程上传并回退本地附件 |
| P0 | 补齐许可、隐私与 Windows 候选材料 | **材料已提交**：`LICENSE`、`THIRD-PARTY-NOTICES.md`、`PRIVACY.md`、`SECURITY.md` 与四类 Issue 模板；`validateReleaseMaterials` 拒绝缺文件。Windows 两套隔离环境安装/升级/卸载循环为 **UNVERIFIED** |
| P1 | 验证 15 分钟首次核心闭环 | **自动链路已完成**：`runCoreTaskSmoke` 按真实 UI 覆盖来源查找、插入引用、保存重开、资源包导出，`npm run smoke` 退出 0。无口头帮助的真人 15 分钟样本为 **UNVERIFIED** |
| P1 | 完成两位现有用户任务记录 | 两周内每人至少 3 次真实任务，记录阻塞、成果和再次使用理由，不计算虚假留存率 |
| P2 | 来源健康与变化提示 | **代码已完成**：质量面板显示来源已变化/缺失/索引未完成；缺失只提供重新定位和打开搜索，mtime 提示不改正文。两设备 8 小时稳定性与真人验证仍为后续门槛 |
| P2 | 发布配置与交付报告 | **代码已完成**：工作区可保存最多 20 条发布配置；HTML 资源包含 `reports/paperin-delivery-report.json`，不含正文、绝对路径或搜索词。接收方阅读与真人专业交付验证仍为后续门槛 |
| P2 | 长期稳定性门禁 | **代码已完成**：五结构 5 MiB 夹具与 `summarizeStability`（30 分钟基线窗口 vs 末两小时，增长须 ≤15% 且 ≤100 MiB，watcher 不得增多）。`--stability-hours 8` 可启动采样。两设备 8 小时实测为 **UNVERIFIED** |

完整依赖、文件、失败测试和验证命令见[产品战略实施计划](superpowers/plans/2026-09-21-product-strategy-implementation.md)。

## 已有能力与证据边界

| 能力 | 当前代码状态 | 仍未证明 |
| --- | --- | --- |
| Markdown 写作 | GFM、表格、任务列表、代码、公式、Mermaid、脚注、frontmatter、查找替换和粘贴转换 | 真实中文 IME、复杂 5 MiB 文档和长期编辑 |
| 工作区 | 文件树、外部文件、多标签、最近、收藏、路径条和窄窗口抽屉 | 安装态文件关联未验证 |
| 知识复用 | 全文/结构搜索、标签、Wiki 链接、反链、图谱、搜索/反链插入来源；插入后来源 mtime 可在质量面板提示变化或缺失 | 外部用户是否更快完成真实任务；移动文件后的人工重定位 |
| 文件安全 | 编码校验、冲突检测、保存队列、恢复日志、回收站删除、草稿和关闭保护 | 真实磁盘满、进程终止、多窗口和跨平台完整故障矩阵 |
| 导出交付 | Markdown、HTML、PDF、DOCX、Pandoc、集合资源包、可复用发布配置和脱敏交付报告 | 接收方软件、打印、字体和安装态完整矩阵 |
| 发行 | 三平台构建配置、Draft 候选、显式正式发布门禁；更新可关闭；许可/隐私/安全入口已提供 | Windows 安装循环、macOS 签名/公证、Linux 桌面集成均为 UNVERIFIED |
| 团队/企业 | 标准文件可经 Git、共享目录或现有知识平台传递 | 身份、权限、审计、评论、审批、实时协作和运维控制面均不存在 |

## 文件规模债务

2026-09-21 审查统计的生产文件中，以下文件超过 450 行门禁。它们不是立即整仓重构的理由，但触及对应职责时必须先拆分并补直接测试：

| 文件 | 行数 | 主要职责 |
| --- | ---: | --- |
| `src/renderer/src/lib/docx.ts` | 599 | OOXML、关系、图片、样式与转换 |
| `src/renderer/src/data/demo-files.ts` | 552 | 内置示例文档正文 |
| `src/renderer/src/app/useAppSettings.ts` | 538 | 设置加载、状态与持久化装配 |
| `src/renderer/src/components/Editor/overlays/useEditorOverlays.ts` | 486 | 编辑器浮层与交互生命周期 |
| `src/renderer/src/components/Editor/plugins/mermaidCodeBlock.ts` | 484 | Mermaid 代码块渲染与源码回退 |
| `src/renderer/src/app/AppComposition.tsx` | 478 | 页面编排与对话框装配 |
| `src/renderer/src/components/Editor/instance/useMilkdownInstance.ts` | 462 | Milkdown 插件注册和实例生命周期 |

## 明确未验证

- Windows 安装包在两个隔离环境中的安装、升级、卸载、文件关联和用户文件保留。
- macOS 签名/公证、Finder 关联；Linux MIME、字体和桌面集成。
- 真实磁盘满、权限拒绝、进程终止、硬件掉电；硬件故障不在零丢失承诺范围。
- 复杂结构 5 MiB 文档的重复测量、第二台 16 GB/SSD 设备和 8 小时稳定性（夹具与汇总函数已具备，实测为 UNVERIFIED）。
- 九主题 × 100/125/150% 缩放 × 窄窗口，以及真实系统中文输入法。
- 两位现有用户的有效观察、6–8 位外部用户任务、W1/W4 留存、真实付款和团队需求。

## 执行顺序

1. 计划中的产品代码已经在 `master`。下一步是 Windows 两个隔离环境的安装循环；材料齐全不等于已发布。
2. 完成两位现有用户两周任务观察，只修最大的真实阻塞。
3. 再进入 GitHub 外部 Alpha，并在真实发布材料中补 `CHANGELOG.md` 与 `CONTRIBUTING.md`。个人重复价值成立后才验证付费；至少 3 个团队重复提出同类问题后才进入团队方案。

本状态页每次只接受新鲜证据更新。已完成工程任务的旧编号、逐批日志和旧计划不再复制到这里。
