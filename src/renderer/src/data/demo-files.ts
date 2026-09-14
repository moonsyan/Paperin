/**
 * 演示用文件树数据源
 * 正式版将由 Main 进程读取真实目录生成，结构保持一致。
 */

export interface DemoFile {
  /** 文件唯一 ID（正式版使用文件绝对路径） */
  id: string
  /** 显示名称 */
  name: string
  /** Markdown 正文 */
  content: string
}

export interface DemoFolder {
  /** 文件夹名称 */
  label: string
  /** 文件夹下的文件 ID 列表（顺序即显示顺序） */
  fileIds: string[]
}

export const DEMO_FILES: Record<string, DemoFile> = {
  publish: {
    id: 'publish',
    name: '发布与集合示例.md',
    content: `---
title: 发布与集合示例
order: 1
tags:
  - 示例
  - 发布
---

# 发布与集合示例

这篇示例演示 **发布** 功能的两个用法：

1. **导出 HTML 资源包**：菜单「文件 → 发布…」，把当前文档（或按目录/标签的集合）导出为 index.html + assets/ 图片文件夹，可独立打开或托管。
2. **复制富文本**：粘贴到公众号、邮件等编辑器，图片自动内联。

## 集合顺序约定

合集按 Frontmatter 的 \`order\` 升序合并，缺失 \`order\` 的文档排在最后：

\`\`\`yaml
---
title: 发布与集合示例
order: 1
---
\`\`\`

## 双链与模板

- 用 [[欢迎使用]] 建立笔记间链接；发布时可选择展开为纯文本。
- 命令面板（Ctrl+K）提供 README / API / 设计文档 / 变更日志模板，一键创建新文档。
`,
  },

  welcome: {
    id: 'welcome',
    name: '欢迎使用.md',
    content: `# 欢迎使用 Paperin

一款对标 Typora 的**柔和简洁**的 Markdown 桌面编辑器。

## 设计理念

> 少即是多。最好的写作工具不会分散你的注意力——它让你专注于文字本身。

没有工具栏，没有分栏预览。你只需要安静地写字，Markdown 标记在落笔的瞬间自然呈现。

## 核心特性

### 所见即所得

输入 Markdown 语法即刻渲染，不需要切换模式，不需要侧边预览：

- 输入 \`# \` 立刻变成一级标题
- 输入 \`**文字**\` 立刻变成**粗体**
- 输入 \`- \` 立刻变成列表项

### 柔和配色

精心调配的多套主题色系，长时间书写也不会感到视觉疲劳：

- **暖白** — 经典暖色调（default）
- **墨夜** — 深邃暗色（dark）
- **海雾** — 冷调蓝灰（ocean）
- **玫砂** — 温暖粉棕（rose）
- **星夜** — 类 GitHub Dark 高对比（github）
- **原子** — 经典 One Dark 编码配色（atom）
- **纸墨** — 暖纸墨打字机质感（typewriter）

点击右上角的太阳图标即可切换；可写作区与暗色主题均做过对比度调校。

### 功能隐藏

所有功能收纳在顶部菜单栏，界面只留下文字本身。

## 任务清单

- [x] 所见即所得编辑
- [x] 多主题适配
- [x] 文件树与大纲
- [ ] 插件系统
- [ ] 云端同步

## 表格

| 特性 | 状态 | 说明 |
| ---- | ---- | ---- |
| 所见即所得 | 已完成 | Typora 式编辑 |
| 多主题 | 已完成 | CSS 变量驱动 |
| 文件管理 | 已完成 | 打开 / 保存 / 另存为 |

## 扩展语法

### 数学公式（KaTeX）

行内公式：质能方程 $E = mc^2$，勾股定理 $a^2 + b^2 = c^2$。

块级公式用双美元符号包裹：

$$
\\int_0^\\infty e^{-x}\\,dx = 1
$$

### 流程图（Mermaid）

用 mermaid 代码块书写：

\`\`\`mermaid
graph TD
  A[书写 Markdown] --> B[即时渲染]
  B --> C{满意?}
  C -->|是| D[导出分享]
  C -->|否| A
\`\`\`

### 脚注

Paperin 支持脚注语法[^1]，适合学术写作。

[^1]: 行内输入 [^标签] 插入引用；行首输入 [^标签]: 内容 定义脚注。

### 代码块

输入 \`\`\`python 或 ~~~python 加空格即可创建带语言的代码块；
鼠标悬停代码块可修改语言、复制内容；直接在块内编辑代码。

\`\`\`python
def greet(name):
    print(f"Hello, {name}!")
\`\`\`

---

*开始书写你的想法。*
`,
  },
  quickstart: {
    id: 'quickstart',
    name: '快速开始.md',
    content: `# 快速开始：Markdown 全语法教程

> 本教程覆盖 Paperin 支持的全部 Markdown 语法。从未接触过 Markdown 也能跟着学会——每个语法都有"输入方式"和"渲染效果"对照。

## 一、标题

在行首输入 \`#\` 加空格创建标题，\`#\` 的数量决定标题层级（1—6 级）。

| 输入 | 层级 |
| --- | --- |
| \`# 标题\` | 一级（最大） |
| \`## 标题\` | 二级 |
| \`### 标题\` | 三级 |
| \`#### 标题\` | 四级 |
| \`##### 标题\` | 五级 |
| \`###### 标题\` | 六级（最小） |

快捷键：\`Ctrl+1\` / \`Ctrl+2\` / \`Ctrl+3\` 切换标题层级，\`Ctrl+0\` 恢复为正文。

## 二、文本格式

| 语法 | 输入 | 效果 |
| --- | --- | --- |
| 粗体 | \`**粗体**\` | **粗体** |
| 斜体 | \`*斜体*\` | *斜体* |
| 粗斜体 | \`***粗斜体***\` | ***粗斜体*** |
| 删除线 | \`~~删除线~~\` | ~~删除线~~ |
| 行内代码 | \`\` \`代码\` \`\` | \`代码\` |

快捷键：\`Ctrl+B\` 粗体，\`Ctrl+Shift+X\` 删除线。

## 三、列表

### 无序列表

输入 \`-\` 或 \`*\` 加空格：

- 苹果
- 香蕉
- 橘子

### 有序列表

输入 \`1.\` 加空格：

1. 打开 Paperin
2. 新建文档
3. 开始写作

### 嵌套列表

在列表项中按 **Tab** 键缩进创建嵌套，**Shift+Tab** 取消缩进：

- 水果
  - 苹果
  - 香蕉
- 饮品
  - 咖啡
  - 茶

## 四、任务清单

输入 \`- [ ]\` 创建未完成项，\`- [x]\` 创建已完成项。**鼠标点击**左侧方框即可切换勾选状态：

- [x] 安装 Paperin
- [x] 打开快速开始
- [ ] 写第一篇笔记
- [ ] 分享给朋友

## 五、链接

### 行内链接

语法：\`[显示文字](网址)\`

示例：访问 [Paperin](https://github.com) 了解更多。

### 自动链接

在正文中书写裸网址（如 https://github.com），保存后重新打开文件时会自动识别为链接。也可用 \`[文字](网址)\` 语法立即创建链接。

> 提示：按住 **Ctrl**（macOS 为 **⌘**）并**点击链接**，可在系统浏览器中打开。

快捷键：\`Ctrl+K\` 插入链接。

## 六、图片

语法：\`![描述](图片路径)\`

也可直接**粘贴**或**拖拽**图片到编辑器中插入。

快捷键：\`Ctrl+Alt+I\` 插入图片。

## 七、引用

输入 \`>\` 加空格：

> 这是一段引用。
> 可以包含多行文本。

引用可嵌套：

> 外层引用
> > 内层引用

快捷键：\`Ctrl+Alt+Q\` 插入引用。

## 八、代码块

### 创建代码块

输入三个反引号或三个波浪号（~~~）后按回车，即可创建代码块。

### 语法高亮

在代码块标记后添加语言名，启用语法高亮。Paperin 使用 Prism 引擎，支持 200+ 种语言。

\`\`\`python
def greet(name):
    print(f"Hello, {name}!")

greet("Paperin")
\`\`\`

\`\`\`javascript
const sum = (a, b) => a + b
console.log(sum(1, 2))
\`\`\`

\`\`\`typescript
interface User {
  name: string
  age: number
}

const user: User = { name: 'Alice', age: 30 }
\`\`\`

\`\`\`sql
SELECT name, email
FROM users
WHERE active = true
ORDER BY created_at DESC
\`\`\`

\`\`\`json
{
  "name": "Paperin",
  "version": "1.0.0",
  "features": ["editor", "themes", "export"]
}
\`\`\`

### 代码块操作

- 直接在代码块内点击即可编辑代码
- 鼠标悬停代码块右上角，出现语言输入框和复制按钮，可直接修改语言
- 点击复制按钮可复制代码内容

快捷键：\`Ctrl+Alt+C\` 插入代码块。

## 九、表格

### 基本表格

用 \`|\` 分隔列，用 \`---\` 分隔表头和内容：

| 功能 | 状态 | 说明 |
| --- | --- | --- |
| 所见即所得 | 已完成 | 即时渲染 |
| 多主题 | 已完成 | 7 套配色 |
| 文件管理 | 已完成 | 打开/保存/另存为 |

### 对齐方式

在分隔行中使用冒号控制对齐：

| 左对齐 | 居中 | 右对齐 |
| :--- | :---: | ---: |
| 左 | 中 | 右 |
| AAA | BBB | CCC |

> 提示：表格列宽可拖拽调整。

## 十、分割线

输入 \`---\` 或 \`***\` 加回车：

上方内容

---

下方内容

快捷键：\`Ctrl+Alt+R\` 插入分割线。

## 十一、数学公式

Paperin 使用 KaTeX 渲染数学公式，支持行内和块级两种写法。

### 行内公式

用 \`$\` 包裹：

质能方程 $E = mc^2$，勾股定理 $a^2 + b^2 = c^2$，分数 $\\frac{1}{2}$。

### 块级公式

用 \`$$\` 包裹：

$$
\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}
$$

$$
\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}
$$

> 提示：双击公式进入编辑模式。行内公式按 Enter 提交，块级公式按 **Ctrl+Enter**（macOS 为 **⌘+Enter**）提交，按 Esc 取消。

## 十二、流程图与图表

使用 mermaid 代码块绘制图表。在代码块语言处填入 mermaid 即可。

### 流程图

\`\`\`mermaid
graph TD
    A[开始写作] --> B{满意?}
    B -->|是| C[导出分享]
    B -->|否| D[修改内容]
    D --> B
\`\`\`

### 时序图

\`\`\`mermaid
sequenceDiagram
    participant 用户
    participant 编辑器
    participant 文件系统
    用户->>编辑器: 输入内容
    编辑器->>文件系统: 自动保存
    文件系统-->>编辑器: 保存成功
    编辑器-->>用户: 状态更新
\`\`\`

### 甘特图

\`\`\`mermaid
gantt
    title 开发计划
    section 设计
    需求分析 :a1, 2026-01-01, 7d
    原型设计 :after a1, 5d
    section 开发
    编码实现 :2026-01-13, 10d
    测试修复 :2026-01-23, 5d
\`\`\`

## 十三、脚注

适合学术写作和补充说明。在正文中用 \`[^标签]\` 引用，在任意位置用 \`[^标签]: 内容\` 定义。

输入方法：正文里输入 \`[^1]\` 后继续输入会自动变成上标引用；在行首输入 \`[^1]:\` 会自动变成脚注定义块。**点击**正文中的上标引用可跳转到对应定义。

这是一段文字[^1]，需要补充说明。也可以用其他标签名[^note]。

[^1]: 这是第一个脚注的内容。脚注会在文末汇总展示。
[^note]: 标签名可以是数字或文字。

## 十四、文档元数据（YAML Frontmatter）

在文档最开头用 \`---\` 包裹 YAML 格式的元数据。以下是一个示例：

~~~
---
title: 我的文档
date: 2026-08-24
tags: [笔记, Markdown]
author: 张三
---
~~~

> 注意：Frontmatter 必须位于文档第一行才会被识别为元数据。

## 十五、Wiki 链接

用双方括号创建笔记间链接：

[[欢迎使用]]

输入 \`[[\` 后会弹出已有文件的自动补全。点击链接可跳转到对应文件，适合构建知识库。

## 十六、快捷键速查

### 编辑器内置（不可自定义）

| 快捷键 | 功能 |
| --- | --- |
| Ctrl+B | 粗体 |
| Ctrl+I | 斜体 |
| Ctrl+Z | 撤销 |
| Ctrl+Y | 重做 |

### 全局层（可在设置中自定义）

| 快捷键 | 功能 |
| --- | --- |
| Ctrl+N | 新建文档 |
| Ctrl+O | 打开文件 |
| Ctrl+Shift+O | 打开文件夹 |
| Ctrl+S | 保存 |
| Ctrl+Shift+S | 另存为 |
| Ctrl+W | 关闭标签页 |
| Ctrl+F | 查找 |
| Ctrl+H | 查找替换 |
| Ctrl+K | 插入链接 |
| Ctrl+Alt+I | 插入图片 |
| Ctrl+Alt+C | 插入代码块 |
| Ctrl+Alt+Q | 插入引用 |
| Ctrl+Alt+R | 插入分割线 |
| Ctrl+1 / 2 / 3 | 标题 1 / 2 / 3 |
| Ctrl+0 | 恢复正文 |
| Ctrl+J | 切换侧栏 |
| Ctrl+Shift+L | 大纲面板 |
| Ctrl+Shift+P | 分栏预览 |
| Ctrl+= | 放大编辑区 |
| Ctrl+- | 缩小编辑区 |
| F11 | 专注模式 |

---

> 恭喜！你已了解 Paperin 支持的全部语法。新建一个空白文档，尝试组合使用这些语法吧。
`,
  },
  design: {
    id: 'design',
    name: '设计理念.md',
    content: `# 设计理念

## 安静的界面

> 界面应当像纸一样安静，让文字成为唯一的主角。

Paperin 遵循三条设计原则：

1. **柔和** — 低对比、暖色调，长时间书写不疲劳
2. **简洁** — 功能收纳进菜单，界面只保留文字
3. **专注** — 专注模式隐藏一切干扰元素

## 色彩系统

所有颜色通过 CSS 变量定义，新增主题只需要一组变量：

\`\`\`css
[data-theme="my-theme"] {
  --bg-app: #FAFAFA;
  --accent: #5B8DEF;
}
\`\`\`

## 排版细节

- 正文行高 1.85，最舒适的中文字距
- 内容区限宽 720px，避免过长的阅读行
- 标题层级间保持呼吸感的留白
`,
  },
  architecture: {
    id: 'architecture',
    name: '架构说明.md',
    content: `# 架构说明

## 三进程模型

| 进程 | 职责 | 技术 |
| ---- | ---- | ---- |
| Main | 窗口管理、文件读写 | Electron |
| Preload | 安全桥接 | contextBridge |
| Renderer | 界面与编辑 | React + Milkdown |

## 渲染进程分层

- **components** — 纯 UI 组件（MenuBar / Sidebar / Editor / StatusBar）
- **features** — 业务能力（文件管理、主题、导出）
- **core** — 核心域模型（文档、目录树）
- **ports** — 能力接口（EditorPort / FilePort / StoragePort）

## 编辑器内核

基于 [Milkdown](https://milkdown.dev)（ProseMirror 之上），实现 Typora 式所见即所得。

- \`commonmark\` 预设 — 标准语法
- \`gfm\` 预设 — 表格 / 任务列表 / 删除线
- \`history\` 插件 — 撤销重做
- \`listener\` 插件 — 内容变更监听
`,
  },
  api: {
    id: 'api',
    name: 'API 参考.md',
    content: `# API 参考

## DesktopAPI（window.desktopAPI）

Preload 暴露给渲染进程的安全接口。

### document

\`\`\`typescript
// 打开文件对话框并读取内容
document.open(): Promise<FileResult>

// 保存到指定路径
document.save(path: string, content: string): Promise<SaveResult>

// 另存为（可自定义过滤器导出 HTML）
document.saveAs(content: string, options?): Promise<SaveAsResult>
\`\`\`

### settings

\`\`\`typescript
settings.get(key: string): Promise<unknown>
settings.set(key: string, value: unknown): Promise<void>
\`\`\`

## IPC 结果约定

所有 IPC 返回统一结构：

\`\`\`typescript
{ ok: boolean; data?: T; error?: { code: string; message?: string } }
\`\`\`
`,
  },
  meeting: {
    id: 'meeting',
    name: '会议记录.md',
    content: `# 会议记录

## 2026-08-08 产品评审

### 结论

- [x] 确定 Typora 式所见即所得方向
- [x] 四套主题全部保留
- [ ] 下阶段：接入真实文件系统
- [ ] 下阶段：插件系统预研

### 待讨论

1. 是否支持 LaTeX 公式
2. 图片粘贴上传策略

> 下次会议时间：待定
`,
  },
  todo: {
    id: 'todo',
    name: '待办事项.md',
    content: `# 待办事项

## 本周

- [x] 完成所见即所得编辑器
- [x] 文件树与大纲联动
- [ ] 导出 PDF
- [ ] 拼写检查

## 后续

- [ ] 插件市场
- [ ] 多窗口支持
- [ ] 国际化
`,
  },
}

/** 文件树结构（顺序即显示顺序） */
export const DEMO_TREE: DemoFolder[] = [
  { label: '项目文档', fileIds: ['welcome', 'quickstart', 'design', 'publish'] },
]

/** 默认打开的文件 */
export const DEFAULT_FILE_ID = 'welcome'
