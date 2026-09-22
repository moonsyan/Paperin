# 可恢复的桌面文件写入

## 目的

Windows、macOS 和 Linux 的桌面环境会把已有文件对象与图标位置、文件管理器状态等关联。直接以临时文件 `rename` 替换目标文件可能被识别为删除后新建；因此 Paperin 对已有桌面文件保留目标文件对象，以覆盖写入完成保存。

覆盖写入不是原子替换。Node 的 `copyFile` 也不保证原子性，失败后目标文件可能不完整或被删除。此处的设计优先保证：只有在写入完成且确认后才清除最后确认版本的恢复材料。

## 保存协议

新文件继续采用临时文件加 `rename`。已有桌面文件按以下顺序处理：

1. 将新内容写到同目录临时文件，并同步该文件。
2. 写入阶段为 `preparing` 的隐藏 journal。
3. 复制旧目标到隐藏 backup，同步后将 journal 更新为 `prepared`，记录旧内容与新内容的 SHA-256。
4. 将临时文件复制到原目标对象并同步；校验目标哈希。
5. 将 journal 更新为 `committed`，再删除临时文件、backup 和 journal。

恢复材料位于目标文件同目录，分别是 `.{文件名}.paperin-save-backup` 与 `.{文件名}.paperin-save-journal`。**backup 含上一个确认版本的正文，临时文件含待保存正文**；journal 只保存阶段、进程标识和哈希，不含绝对路径或正文。正常成功保存后应不存在这些文件；失败时保留的材料属于用户数据，不能上传仓库或当成普通缓存清理。

## 恢复规则

每次读取 Markdown 前检查同路径 journal：

- 活动进程仍持有 journal 时，读取返回“文件正在保存”，不会读取潜在的部分内容。
- `preparing` 表示目标尚未开始覆盖，清理未完成的准备材料。
- `prepared` 表示覆盖可能尚未确认。冷启动读取时，若目标哈希已经等于本次要写入的内容，视为保存已成功，只清理恢复材料；正在进行的保存失败回滚时仍恢复上一确认版本。否则用校验通过的 backup 恢复上一确认版本。部分写出和崩溃后的外部完整改写在哈希上都对不上，协议优先恢复上一确认版本，避免留下损坏正文。
- 恢复会写盘。读取路径传入的授权函数若拒绝该目标，跳过恢复，不把 backup 写到未授权位置。索引和历史读取默认走 `isPathAuthorizedForReadOrSave`。
- `committed` 表示应用已经验证并确认过该保存，直接清理恢复材料；若之后有外部编辑，外部版本必须保留，不能用过期 backup 覆盖它。

恢复失败不会删除 journal 或 backup，应用向用户报告错误，避免把唯一恢复材料当作临时垃圾清理。

## 边界

该机制覆盖应用可注入的写入、复制中断和进程重启场景，不承诺任意硬件掉电或文件系统故障下零数据丢失。保存锁、`expectedMtime`/`expectedContentHash` 与内容哈希冲突检查、编码保护和关闭保护仍独立生效。编码读取失败（含 `UNSUPPORTED_ENCODING`）不会改写磁盘上的原文件；损坏字节不会被宽松解码成带替换符的正文后再进入编辑器。冲突哈希只读普通文件句柄；保存成功后记下的哈希是刚刚写出的字节，不再回读路径。跨进程锁等待期间，若该路径的写入授权已经不在（信任根被淘汰），保存会拒绝，不会把“没有授权函数”当成放行。写入确认的编辑器版本与关闭竞态由各标签自己的 `DocumentFileVersion` 回执处理：晚到回执只确认实际写出的版本。

## 草稿与会话恢复

未保存正文除编辑器内存外，会防抖写入 `settings.json` 的 `drafts` 键作为**崩溃恢复副本**（与 Ctrl+S **落盘保存**不同；状态栏分别显示「草稿已备份」与「已保存」）。

- **fresh 窗口**（`#fresh`）不读写共享 `drafts`，也不恢复主窗口会话，避免多窗口互相覆盖。
- 主窗口每条草稿绑定 `draftSessionId`；其他窗口对同一路径写入会收到 `DRAFT_SESSION_CONFLICT`，编辑与 dirty 仍保留在本窗口，仅提示一次并可重试，**不会**因此自动做破坏性恢复。
- 起草时记录 `baselineSha256`（磁盘版本绑定）；重启后若磁盘正文哈希已与基线不一致，**放弃**该草稿，保留外部新版本。
- 升级前缺少 `draftSessionId` 的遗留草稿条目会保留，直至本会话首次成功备份时认领。

## 本地版本历史（非独立备份）

`src/main/history/version-store.ts` 在每次**保存成功**后尝试读盘快照：源文件 **> 2 MiB** 跳过；每文件最多 **20** 份、合计 **5 MiB**，超出淘汰最旧。删除或移动正文时清理对应快照目录。这不构成完整离线备份；扩容策略需单独设计与测试。

## 验证

可控注入单测、开发态 smoke 与 **P0-06 真进程中断门禁**共同构成当前自动证据；磁盘满/权限矩阵与安装态恢复仍待 P0-05 等任务。文档中的协议是实现边界，不是任意掉电下零丢失承诺。新近来源/索引/缓存改进不替代保存冲突与恢复门禁，详见[当前状态](PROJECT-STATUS.md)。

`src/main/ipc/file-write-recovery.test.ts` 专门覆盖复制中断、备份复制失败和目标同步失败后的恢复，以及遗留 `prepared`/`committed` journal 的读取恢复与外部修改保留。`src/main/testing/write-recovery-process.test.ts` 通过 `write-recovery-child.ts` 子进程走生产 `writeFileAtomicallyWithIo`（不 mock `copyFile`/`rename`），在 `preparing`、`prepared`、`target-copy`、`target-synced`、`committed` 五阶段等待 marker 后 `SIGKILL`，再调用 `recoverInterruptedFileWrite`；每阶段 20 次重复，断言最后确认版本或已校验新版本的契约，且第二次恢复无副作用。`target-copy` 若在复制完成前被终止则回滚到确认版本；若目标哈希已等于待写内容则保留新版本（与冷启动读取规则一致）。`src/main/ipc/file-io.test.ts` 与 `text-decoding.test.ts` 覆盖严格编码解码、读失败不 mutate 原文件，以及目录 I/O 测试。草稿/会话边界见 `src/shared/draft-storage.test.ts`、`src/main/settings/settings-store.draft.test.ts`、`src/renderer/src/hooks/useDraftPersistence.test.ts` 与 `useDocumentRestore.test.ts`。工作区授权对不存在目标会规范化最近存在父目录的真实路径，再与钉住的信任根比较，因此 Windows 短路径、junction 别名和新建文件不会因字面路径形态不同被拒绝；链接换靶到根外仍拒绝。真实双窗口连续重启与跨平台文件身份仍未完成。完整故障矩阵按 [战略验收协议](development/strategy-validation.md) 的 Q01 执行。
