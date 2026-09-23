# 候选包与发行门禁验证记录

更新时间：2026-09-23（Asia/Shanghai）
当前执行分支：`master`
用途：记录候选包先验收、再进入正式发行的工程门禁和安装证据。

本轮全量文档同步不创建 tag、推送、上传安装器或触发发布。P0-07/P1-06/07/08 与搜索语料能力已落地；当前阻塞为 A01–A10（含安装脚本骨架、默认测试装配失败、性能红灯）。自动门禁通过不能代替安装循环与真人验收。新鲜结果见 [PROJECT-STATUS](../PROJECT-STATUS.md) 与[审查证据](reviews/2026-09-23-product-state-audit.md)。

> 当前状态不是“已发布”：`0.7.0` 候选 tag 只应生成 GitHub Draft Release。工作区路径授权、核心任务冒烟、许可/隐私/安全材料已落地。GitHub 公开 [v0.6.0](https://github.com/moonsyan/Paperin/releases/tag/v0.6.0) 可核验；当前 0.7.0 Draft/安装循环仍为 **UNVERIFIED**。`origin` 仍可为 Gitee 镜像，另有 `github` 远端；`package.json` 发布目标对齐 `moonsyan/Paperin`。`release.yml` 中安装验收 job 仍为 `if: false`，正式发布不以安装证据为必要条件（A05）。

## 本任务已验证（工程门禁）

| 项 | 证据 | 结论 |
| --- | --- | --- |
| `build.yml` 三平台质量门禁结构 | `scripts/ci-config-gates.mjs` + `scripts/verify-ci-config.test.mjs`；`node scripts/verify-ci-config.mjs` exit 0 | **已配置**（不证明远端 Actions 已跑通） |
| `release.yml` 候选链 | `gate` → `candidate-acceptance`（`npm run smoke`）→ 三平台 `electron-builder --publish never` → `candidate-release`（`draft: true` + `candidate-record.txt`） | **已配置** |
| 正式发行显式门禁 | 仅 `workflow_dispatch` + `action=publish-formal` + `confirm_publish=PUBLISH` + `candidate_sha` 与 Draft Release commit 一致 → `gh release edit --draft=false` | **已配置** |
| tag 推送自动正式发布 | 已移除：`push tags v*` 只走候选 draft，不 `draft: false` | **已阻断** |
| 配置回归测试 | `release.yml` 缺 smoke 或 `draft: true` 被改成无条件正式发布时，`validateReleaseWorkflowGates` 失败（见单测） | **已通过** |
| Windows 安装态脚本 | `scripts/verify-windows-install.mjs` + `scripts/verify-windows-install.test.mjs`；无 `--confirm-isolated-environment` 时仅 dry-run；`release.yml` 中 `installed-acceptance-win` 暂 `if: false` | **UNVERIFIED**（两隔离环境安装循环未实测；默认全量 `npm run test` 因 A10 shebang/Vite SSR 收集失败，不能用「安装单测绿」概括） |
| 生产依赖审计 | 2026-09-22 `npm audit --omit=dev --audit-level=moderate` 为 0；`electron-updater` 间接依赖 `js-yaml` 由 4.3.1 升至 4.3.2。`validateProductionJsYaml` 拒绝生产树回退到 4.3.2 以下。dev 依赖漏洞未纳入本门禁 | **已处理生产 high** |
| 仓库与发布身份 | 本地元数据与 `build.publish` 已对齐 GitHub `moonsyan/Paperin`；`origin` 仍为 Gitee + `github` 远端；旧 Gitee Release 同步脚本已移除 | **部分完成（P0-04 本地）**：Draft/Release 可达性 **UNVERIFIED**；未推送 tag、不触发正式发布 |

未在本任务执行：`git push`、打 tag、`gh release publish`、上传安装包二进制到仓库。

## 本地 Windows 安装包构建（`npm run build:win`）

| 项 | 记录 |
| --- | --- |
| 命令 | **未执行** |
| 产物路径 | — |
| 是否安装到本机 | **否**（未产包故未安装） |

## 安装 / 升级 / 卸载循环

| 项 | 状态 |
| --- | --- |
| 两个独立环境 × 每环境 3 次「安装 → 启动 → 文件关联 → 保存 → 卸载」 | **UNVERIFIED**（验收脚本骨架已建立；默认全量测试收集该单测时因 A10 失败；通过也不等于已安装） |
| 安装成功宣称 | **禁止** — 自动化仅覆盖 NSIS 参数、候选 exe 发现、超时/退出码与证据脱敏；真实循环须 `--confirm-isolated-environment` + 隔离环境 |

## 更新与数据保留场景

以下均无本任务内的真实运行证据，一律 **UNVERIFIED**：

- 下载失败、完整性校验失败
- 应用内重启 / 更新后重启
- 配置与草稿迁移（draft → 正式安装路径）
- 旧版本回退（rollback）
- 用户 Markdown / 知识库文件在升级后保留

## 平台与签名

| 平台 | 本任务证据 | 说明 |
| --- | --- | --- |
| Windows | 工作流含 `build-win` + 冒烟验收 job；**本地未跑** `build:win` | **当前产品支持范围：Windows 候选链可配置**；不等于已安装验证 |
| macOS | CI 配置 `build-mac`（未签名 DMG） | 签名 / 公证：**UNVERIFIED** |
| Linux | CI 配置 `build-linux`（AppImage） | MIME / 字体 / 桌面集成：**UNVERIFIED** |

三平台「正式对外承诺」仍需要三平台各自候选验收与安装证据；本任务只完成 **发行流程门禁 + 配置测试**。

## 许可、隐私与安全响应

| 材料 | 当前状态 | 外部 Alpha 前门槛 |
| --- | --- | --- |
| 根许可证与第三方声明 | **已提供** | `LICENSE`（MIT，Copyright 2026 ming）与 `THIRD-PARTY-NOTICES.md`（含 Electron/Chromium、生产依赖、打包进渲染进程的库；`resources/icons/` 产品图标来源未单独核证） |
| 独立隐私说明 | **已提供** | `PRIVACY.md`：默认更新全流程、可选 SM.MS、可选拼写词典；写明发送内容、关闭方式和第三方责任 |
| 安全响应渠道 | **已提供** | `SECURITY.md`：GitHub 私密安全公告；不要求公开用户文件、路径或 token。无另行公布的安全邮箱 |
| 更新日志与贡献说明 | **0.7.0 已写入** | `CHANGELOG.md`、`CONTRIBUTING.md` 记录候选版本事实和当前贡献方式。安装循环仍为 UNVERIFIED，因此这不是正式公开发布 |

当前代码事实：生产环境默认检查更新、自动下载并在退出时安装；`autoDownload` 与 `autoInstallOnAppQuit` 由 `shouldCheckForUpdates` / `shouldInstallUpdateOnQuit` 显式赋值，开发环境恒为 `false`。设置「自动检查更新」关闭后下次启动不调用更新服务器，也不在退出时安装已下载包。默认图片模式为本地附件；SM.MS token 经主进程 `safeStorage` 加密，渲染进程拿不到明文。拼写检查开关默认关闭；打开后正文启用拼写检查（代码块除外），所选语言可能下载词典且不上传正文。正式隐私说明见仓库根目录 `PRIVACY.md`。

## Windows 候选记录

```text
候选 commit: 本地 `v0.7.0` 当前指向 `d15bdd1`；发布前必须以完成 P0 门禁后的新候选 commit 重建
支持平台: Windows 候选链可配置；macOS 签名/公证 UNVERIFIED；Linux 桌面集成 UNVERIFIED
smoke 结果: 2026-09-22 `npm run smoke` 退出 0（打开工作区、新建、保存、冲突、重命名、搜索、关闭、系统文件关联）
安装/升级/卸载环境: UNVERIFIED（未执行 `npm run build:win` 后的两套隔离安装循环）
用户文件保留: UNVERIFIED
未验证项: 安装器签名、.md 文件关联、升级回退、卸载后知识库文件夹是否仍在
```

`scripts/verify-ci-config` 中的 `validateReleaseMaterials` 检查根许可、第三方声明、隐私、安全与四类 Issue 模板是否存在；不把 `package.json` 的 `license` 字段当作完整授权。

## 与核心任务入口的关系

外部 Alpha 是 P1-05 的 6–8 人发现轮，进入前须 P0 退出、种子最大阻塞解决及补充正确性任务通过；成功后才退出 P1。公开 Beta 还需 P2-05 的 12 人 U01/U02、P2-01 长期稳定及 P2-03 接收方验证。Draft 工作流配置、实际 Draft 产物、安装成功和正式公开发布是四项独立证据。

候选链在 `release.yml` 的 `candidate-acceptance` 跑 `npm run smoke`，核心任务入口或协议变更必须与候选 artifact 使用同一 commit；**UI/协议变更后须重新跑候选**，不得复用旧 commit 的安装记录。

## 操作备忘（维护者）

1. **发布元数据**：P0-04 本地部分已完成（`package.json` + CI 门禁）；推送与 Draft 验证仍须在 GitHub 权限可用时单独执行，且不得在本记录未更新证据前宣称 Draft 可达。
2. **产候选**：推送新的 `v*` tag，或 Actions → release → `action=candidate`（可选 tag）。不得复用当前未完成 P0 门禁的 `v0.7.0` 本地 tag 作为正式候选。
3. **验候选**：在 Draft Release 核对 `candidate-record.txt` 与 commit；人工安装试用（本记录未做）。
4. **正式发行**：Actions → release → `action=publish-formal`，填写 tag、`candidate_sha`（与 draft 相同 commit）、`confirm_publish=PUBLISH`。
