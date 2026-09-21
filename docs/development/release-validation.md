# 候选包与发行门禁验证记录

更新时间：2026-09-21（Asia/Shanghai）
当前执行分支：`master`
用途：记录候选包先验收、再进入正式发行的工程门禁和安装证据。

> 当前状态不是“已发布”：2026-09-21 新鲜 `npm run smoke` 在新建文档步骤返回 `INVALID_TARGET`，`build:win` 和真实安装/升级/卸载循环仍未完成。当前执行任务见 [产品战略实施计划](../superpowers/plans/2026-09-21-product-strategy-implementation.md) 的 P0。

## 本任务已验证（工程门禁）

| 项 | 证据 | 结论 |
| --- | --- | --- |
| `build.yml` 三平台质量门禁结构 | `scripts/ci-config-gates.mjs` + `scripts/verify-ci-config.test.mjs`；`node scripts/verify-ci-config.mjs` exit 0 | **已配置**（不证明远端 Actions 已跑通） |
| `release.yml` 候选链 | `gate` → `candidate-acceptance`（`npm run smoke`）→ 三平台 `electron-builder --publish never` → `candidate-release`（`draft: true` + `candidate-record.txt`） | **已配置** |
| 正式发行显式门禁 | 仅 `workflow_dispatch` + `action=publish-formal` + `confirm_publish=PUBLISH` + `candidate_sha` 与 Draft Release commit 一致 → `gh release edit --draft=false` | **已配置** |
| tag 推送自动正式发布 | 已移除：`push tags v*` 只走候选 draft，不 `draft: false` | **已阻断** |
| 配置回归测试 | `release.yml` 缺 smoke 或 `draft: true` 被改成无条件正式发布时，`validateReleaseWorkflowGates` 失败（见单测） | **已通过** |

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
| 两个独立环境 × 每环境 3 次「安装 → 启动 → 文件关联 → 保存 → 卸载」 | **UNVERIFIED**（无第二台机器；不在唯一真实配置上破坏性升级） |
| 安装成功宣称 | **禁止** — 本任务仅工作流与配置测试 |

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
| 根许可证与第三方声明 | **缺失** | 确认版权和资源来源后补 `LICENSE`、`THIRD-PARTY-NOTICES.md` |
| 独立隐私说明 | **缺失** | 说明三类联网：默认更新检查、自动下载和退出时安装；可选 SM.MS 图片上传及其 token 安全存储；用户打开拼写检查后可能下载的词典。写明发送内容、关闭能力和第三方责任 |
| 安全响应渠道 | **缺失** | 提供不要求公开用户文件、绝对路径或 token 的私密报告方式，并写明支持版本 |
| 更新日志与贡献说明 | **不是 P0** | `CHANGELOG.md`、`CONTRIBUTING.md` 在 GitHub 外部 Alpha 发布时按真实版本和贡献方式编写，不提前提交空文件 |

当前代码事实：生产版启动会调用 `electron-updater` 检查更新。`src/main/index.ts` 把 `autoDownload` 设为 `true`，且没有设置 `autoInstallOnAppQuit`；`electron-updater` 将该字段默认为 `true`，所以已下载的更新会在退出时安装。这三步都没有用户可见开关。默认图片模式为本地附件，只有用户主动配置并选择 SM.MS 后才上传图片，但 token 当前明文写入 `userData/settings.json`。拼写检查在窗口创建后默认关闭，用户打开后 Electron 可能下载词典，不上传正文。外部 Alpha 前必须先完成更新全流程的关闭能力、凭据安全迁移，并按上述三类路径编写隐私说明；不能直接把本记录当作正式隐私政策。

## 与核心任务入口的关系

候选链在 `release.yml` 的 `candidate-acceptance` 跑 `npm run smoke`，核心任务入口或协议变更必须与候选 artifact 使用同一 commit；**UI/协议变更后须重新跑候选**，不得复用旧 commit 的安装记录。

## 操作备忘（维护者）

1. **产候选**：推送 `v*` tag，或 Actions → release → `action=candidate`（可选 tag）。
2. **验候选**：在 Draft Release 核对 `candidate-record.txt` 与 commit；人工安装试用（本记录未做）。
3. **正式发行**：Actions → release → `action=publish-formal`，填写 tag、`candidate_sha`（与 draft 相同 commit）、`confirm_publish=PUBLISH`。
