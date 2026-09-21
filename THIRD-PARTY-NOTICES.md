# 第三方声明

本文件列出 Paperin 安装包会带上的主要第三方软件与资源。版权所有者以 `package.json` 的 `author` 字段 `ming` 为准。间接依赖的完整许可证文本随各包发布；Electron 运行时还带有 Chromium 的 `LICENSES.chromium.html`（打包后保留，见 `scripts/afterPack.js`）。

本声明不是法律意见，也不替代各上游许可证原文。

## 运行时与桌面容器

| 组件 | 许可证（包字段） | 说明 |
| --- | --- | --- |
| Electron | MIT | 桌面容器；安装包内含 Chromium 与 Node。Chromium 另有 BSD 及其他声明，见应用目录中的 `LICENSES.chromium.html` |
| electron-updater | MIT | 生产环境检查 GitHub Release、下载更新；退出安装由应用设置控制 |

## 主进程生产依赖（`package.json` `dependencies`）

| 包 | 许可证（包字段） |
| --- | --- |
| iconv-lite | MIT |
| mdast-util-from-markdown | MIT |
| mdast-util-gfm | MIT |
| mdast-util-math | MIT |
| micromark-extension-gfm | MIT |
| micromark-extension-math | MIT |
| yaml | ISC |

## 渲染进程随应用打包的主要库

这些包写在 `devDependencies`，但会被打包进 `out/renderer`，因此随安装包分发：

| 包 | 许可证（包字段） |
| --- | --- |
| React / react-dom | MIT |
| @milkdown/kit、@milkdown/react、相关 Milkdown 插件 | MIT |
| KaTeX | MIT |
| Mermaid | MIT |
| refractor | MIT |

## 应用资源

| 资源 | 来源 | 说明 |
| --- | --- | --- |
| `resources/icon.png` | 仓库自带，随初始基线提交纳入 | 用作窗口与安装器图标。第三方原始作者**未经单独核证**；若后续确认权利限制，将替换该文件 |

## 可选第三方服务（不随安装包分发代码）

用户主动启用 SM.MS 图床时，图片会发往 SM.MS；其服务条款与隐私政策由 SM.MS 自行提供。拼写检查打开后，Chromium 可能下载语言词典，词典版权属于 Chromium/上游词典项目。
