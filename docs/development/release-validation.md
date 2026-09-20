# R10 候选包与发行门禁验证记录

更新时间：2026-09-20（Asia/Shanghai）  
分支：`feat/strategy-execution`  
任务：plan §13 / R10 — 候选包先验收，再进入正式发行。

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

## 安装 / 升级 / 卸载循环（原 S04）

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

## 与 R11 的关系

候选链在 `release.yml` 的 `candidate-acceptance` 跑 `npm run smoke`，与 R11 入口变更同仓库提交一起进入候选 artifact；**UI/协议变更后须重新跑候选**，不得复用旧 commit 的安装记录。

## 操作备忘（维护者）

1. **产候选**：推送 `v*` tag，或 Actions → release → `action=candidate`（可选 tag）。
2. **验候选**：在 Draft Release 核对 `candidate-record.txt` 与 commit；人工安装试用（本记录未做）。
3. **正式发行**：Actions → release → `action=publish-formal`，填写 tag、`candidate_sha`（与 draft 相同 commit）、`confirm_publish=PUBLISH`。
