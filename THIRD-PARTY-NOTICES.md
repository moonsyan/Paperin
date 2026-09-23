# 第三方声明

本文件列出 Paperin 安装包会带上的主要第三方软件与资源。Paperin 自有代码的版权署名见根 LICENSE；第三方权利人和许可以上游声明为准，不能用项目 author 字段代替。间接依赖的完整许可证文本随各包发布；Electron 运行时还带有 Chromium 的 `LICENSES.chromium.html`（打包后保留，见 `scripts/afterPack.js`）。

本声明不是法律意见，也不替代各上游许可证原文。

文档核对日期：2026-09-22。依赖范围以 `package.json`、锁文件与实际打包产物共同核对；本轮未升级依赖，也未完成安装包许可证逐项审计。图标来源未核证的边界保持不变；发行前检查见 [发行验证](docs/development/release-validation.md)。

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
| `resources/icons/icon.ico` / `icon.png` | 仓库自带产品图标 | 用作窗口、任务栏、安装器与应用内品牌图。第三方原始作者**未经单独核证**；若后续确认权利限制，将替换该目录文件 |

## 可选第三方服务（不随安装包分发代码）

用户主动启用 SM.MS 图床时，图片会发往 SM.MS；其服务条款与隐私政策由 SM.MS 自行提供。拼写检查在设置中打开且正文启用后，Chromium 才可能下载语言词典（不上传正文）；关闭开关则不主动下载。词典版权属于 Chromium/上游词典项目。
