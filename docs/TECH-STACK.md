# Paperin 技术栈评估

更新时间：2026-09-22（Asia/Shanghai）。当前实际版本以 `package.json` 为准：Electron 43、React 18.3、Vite 5.4、electron-vite 2.3、TypeScript 5.7、Vitest 2.1；本地与 CI 验证基线为 Node.js 22 LTS。下方升级建议仍是候选，不是已经完成的迁移。

## 结论

建议继续使用 Electron + React + TypeScript。当前版本先冻结到已验证组合，待 P0 文件安全、性能、供应链和 Windows 候选发布门禁完成后，再单独评估 Electron、Node、Vite 或 React 的升级。不要为了追逐 Web 框架趋势而改用 Next.js、Tauri 或 React Native：这是本地优先桌面编辑器，文件系统、窗口、协议、原生对话框和跨平台打包是核心能力，Electron 的生态和现有代码资产更匹配。

当前保留的组合（不是升级清单）：

| 层 | 推荐 | 原因 |
| --- | --- | --- |
| 桌面容器 | 锁文件中的 Electron 43.x | 保留现有窗口、协议、更新和打包边界；升级另行验证 |
| UI | React 18.3 | 不以 React 19 升级为本轮来源/索引修复前置条件 |
| 语言 | TypeScript 5.x，strict | 已有类型基础，适合 IPC DTO、文档模型和编辑器扩展 |
| 构建 | electron-vite + Vite | 与当前项目一致，开发反馈快，三进程配置清晰 |
| 编辑器 | Milkdown 7 + ProseMirror | 已经覆盖 Markdown、GFM、数学、代码和 Mermaid。代码块整理使用 yaml 2.9；图表使用 Mermaid 11。保留 Markdown 往返能力 |
| Markdown | mdast / micromark 现有链路 | 解析、序列化和扩展生态成熟，适合做格式兼容边界 |
| 状态 | React 局部状态 + 功能级 hooks/controller | DocumentRecord 单一快照，正文仍由编辑器持有；当前无 Zustand 依赖 |
| 样式 | 原生 CSS、CSS Variables、组件级样式 | 当前项目已有主题体系，避免引入重量级 UI 套件改变产品气质 |
| 测试 | Vitest + Testing Library + 自有 Electron smoke | Playwright 是后续候选，当前 package.json 未安装；不把规划工具写成已有门禁 |
| 打包 | electron-builder | 当前已有 Windows/macOS/Linux 发布配置和 CI 经验 |

## 不建议的替代方案

### Tauri

Tauri 的包体积和内存占用更有优势，但需要重新绑定 Rust 文件系统、窗口和打包能力，Milkdown/ProseMirror 的迁移收益有限。除非产品将“极小安装包”和低资源占用置于最高优先级，否则不值得在本轮重构中更换容器。

### Next.js / Web-only

Next.js 适合网站和服务端渲染，不适合直接承载本地文件权限、窗口生命周期和离线桌面体验。它会增加边界，而不能解决当前编辑器架构问题。

### 重型组件库

Ant Design、MUI 等可以快速拼界面，但会把知识库产品带向通用后台风格。当前的“安静工作区”需要自己控制密度、主题和编辑区节奏，保留原生 CSS 更合适。

## 目标架构

```text
Renderer
  App Shell / Workspace State
  ├─ File Tree / Search / Tabs
  ├─ Editor Adapter (Milkdown)
  └─ Settings / Export UI
        ↓ window.desktopAPI
Preload
  typed, narrow API only
        ↓ IPC channels
Main
  File Service / Workspace Service / Settings / Window / Export
        ↓
Shared
  DTOs / error codes / document metadata / IPC channel constants
```

关键原则：

1. “知识库”是工作区上下文，“当前文件”是选中对象，两者不做互斥模式。
2. 编辑器内部状态由 Milkdown/ProseMirror 持有，App 只维护会话快照和保存协调状态。
3. 文件读写、冲突检测、编码处理和回收站操作全部留在主进程。
4. Renderer 不获得 `fs`、`path`、通用 `ipcRenderer` 或任意 Node 能力。
5. 先建立稳定的文档服务接口，再替换 UI，避免视觉重构和文件安全逻辑同时变动。

## 有实际缺口后才评估的依赖

不要在第一阶段一次性安装大量库。优先评估：

- `zustand`：只有会话状态继续膨胀时引入。
- `@testing-library/user-event`：补充键盘、输入法和焦点流程测试。
- `playwright`：用于窗口启动后的打开、保存、搜索和主题冒烟。
- `zod`：若 IPC DTO 数量增加，可用于主进程入参运行时校验；否则使用已有手写守卫即可。

来源归属、异步 epoch、资源依赖失效、缓存 DTO 和内存预算先复用当前工具实现；它们不需要更换框架或引入数据库。按职责拆出索引缓存/资源解析与来源 hook，相关测试直接覆盖新边界。文档基准为 Node 22，实际命令若运行于 Node 24 须如实标记，不能冒充发行基线。

## 版本策略

- Node.js 22 LTS 作为本地与 CI 验证基线；Node 24 样本只作诊断对照，不作为发布基线。Node 主版本升级必须单独跑完整门禁和目标平台安装态验证。
- Electron、Milkdown、electron-builder 分开升级，不能和功能迁移放在同一个变更中。
- 所有升级先跑 lint、typecheck、test、build，UI 追加 a11y，相关变更追加 smoke，再进行目标平台安装包冒烟；性能相关升级单独运行性能门禁。
