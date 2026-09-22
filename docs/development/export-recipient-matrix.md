# 导出接收方兼容矩阵（P2-03 骨架）

> 更新时间：2026-09-22。本文记录 Paperin **写出侧**已有预检/转换边界与**接收方软件**实测状态；不宣称 Word/PDF 阅读器/浏览器组合已全部验收。导出行为细节见 [export-formats](../export-formats.md)，能力总表见 [compatibility-matrix](../compatibility-matrix.md)。

## 固定交付夹具（计划）

后续人工/半自动验收将使用仓库内固定 Markdown 夹具（中文/英文、公式、Mermaid、表格、任务、脚注、frontmatter、相对图片、缺附件），导出产物不得包含测试机绝对路径。夹具与 P1-02 来源兼容夹具分离；接收方矩阵只关心**导出文件**能否被目标软件打开阅读。

## 格式：保证 / 不保证 / 接收方实测

「保证」指 Paperin 在预检通过且用户确认缺失项后，按当前代码路径写出文件；**不**包含接收方排版、字体、打印或与第三方版本绑定的行为。「不保证」指可能降级、占位或保留源码片段。接收方列在未完成本机/隔离环境打开前一律标 **UNVERIFIED**。

| 格式 | Paperin 保证（写出侧） | Paperin 不保证 | 典型接收方 | 接收方实测 |
| --- | --- | --- | --- | --- |
| Markdown `.md` | 另存为新文件；空图片、`javascript:` 等不安全链接阻止写出；缺本地附件需确认；未完成任务保留正文并事后提醒 | 不替用户清理 Wiki/私有语法；不保证第三方对 GFM 扩展的解读一致 | Typora、Obsidian、VS Code、Git 托管预览 | **UNVERIFIED** |
| HTML 单篇 / 资源包 | 预检同 Markdown；抓取编辑器已渲染 DOM（单篇）或集合渲染器（标签/目录合集）；资源包含 `index.html`、`assets/`、脱敏 `reports/paperin-delivery-report.json` | 集合路径公式/Mermaid 为降级标注而非 KaTeX/脚本执行；自定义 CSS 去脚本片段；不执行页面内脚本 | Chrome、Edge、Firefox、Safari、静态托管 | **UNVERIFIED** |
| PDF | 预检后由 Chromium 打印管线生成；依赖当前主题与已渲染正文 | 页眉页脚、字体嵌入、分页与打印边距因 OS/驱动而异；集合与单篇路径差异同 HTML | Adobe Acrobat、Edge 内置、macOS 预览、Evince | **UNVERIFIED** |
| DOCX | 预检后由内置 OOXML 路径生成；本地图优先内嵌，失败时占位文本并在 UI 说明 | 复杂公式、Mermaid、高级样式与 Word 版本特性不一一映射；不依赖本机安装 Word 即可写出 | Microsoft Word、LibreOffice Writer、WPS | **UNVERIFIED** |
| Pandoc（EPUB / LaTeX 等） | 预检后调用用户环境 Pandoc；未安装则明确失败，不伪造成功 | 模板、宏包、中文字体与引擎由用户 Pandoc/TeX 栈决定 | Calibre、TeX Live、用户 CI | **UNVERIFIED** |

## 自动门禁（已有，非接收方验收）

| 门禁 | 覆盖 | 未覆盖 |
| --- | --- | --- |
| `export-preflight.test.ts` | 空图、危险 URL、缺附件确认、相对路径解析 | 真实 Pandoc/Word 打开 |
| `review-export.test.ts` | 读盘/编辑器源、预检分支、提醒文案 | 二进制 PDF/DOCX 字节级对照 |
| `delivery-report.test.ts` / `export-handlers.test.ts` | 报告白名单、1 MiB 上限、拒绝 `../` 文件名 | 接收方是否理解 JSON 报告 |
| `runCoreTaskSmoke` / `npm run smoke` | 当前文档 HTML 资源包写出与浏览器可读路径（合成任务） | 全格式矩阵与字体组合 |

## 记录模板（人工补全时使用）

```text
format: PDF
fixtureId: delivery-fixed-01
paperinVersion: 0.7.0
commit: <hash>
exportPath: <相对仓库或脱敏描述>
recipient: Adobe Acrobat Reader 24.x / Windows 11
result: pass | fail | partial
notes: （可见文本、图片数、链接、已知降级项）
```

完成真实打开后，在本表对应行把 **UNVERIFIED** 改为 `pass/fail/partial` 并链接到脱敏记录；不得用合成 smoke 结果替代表格中的接收方结论。
