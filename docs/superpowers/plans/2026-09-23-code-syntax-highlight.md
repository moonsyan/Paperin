# 代码块语法高亮 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or implement task-by-task inline. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用语义 `--code-*` 色板统一多主题代码高亮，并注册常用语言 + 标识归一化，使 JSON/YAML 等配置类舒适可读。

**Architecture:** 色板（CSS 变量）与语言包（Refractor register）解耦；`code-syntax.css` 只做 token→变量映射；`configureCodeBlockRefractor` + `normalizeCodeLanguage` 负责语言。

**Tech Stack:** Milkdown plugin-prism、refractor 5、现有主题 CSS、Vitest

**Spec:** [2026-09-23-code-syntax-highlight-design.md](../specs/2026-09-23-code-syntax-highlight-design.md)

## Global Constraints

- 禁止在组件 CSS 写死主题分支 hex；新主题只覆盖 `--code-*`
- 语言包用常用集，不注册全量 ~300
- 标识写入 attrs 前必须 `trim().toLowerCase()` 并过别名表
- mermaid 继续 alias 为 plain
- 提交信息：`<type>: <摘要>` 简体中文；本轮可不推送

---

### Task 1: 语言归一化纯函数与测试

**Files:**
- Create: `src/renderer/src/lib/code-language.ts`
- Create: `src/renderer/src/lib/code-language.test.ts`

**Produces:** `normalizeCodeLanguage(raw: string): string`、`CODE_LANGUAGE_ALIASES`

- [ ] Step 1: 写失败测试（JSON→json、yml→yaml、dockerfile→docker、jsonc→json5）
- [ ] Step 2: 实现 `normalizeCodeLanguage`
- [ ] Step 3: 测试通过并提交 `test/feat: 代码语言标识归一化`

### Task 2: Refractor 常用语言注册

**Files:**
- Modify: `src/renderer/src/components/Editor/plugins/syntaxHighlighting.ts`
- Modify: `src/renderer/src/components/Editor/plugins/syntaxHighlighting.test.ts`

**Produces:** `configureCodeBlockRefractor` 注册 toml/tsx/jsx/graphql/docker/powershell/dart/json5/http/nginx/protobuf/cmake/wasm/hcl/svelte/elixir/haskell/scala/zig 等缺失模块；幂等

- [ ] Step 1: 扩展失败测试（toml/tsx/docker registered）
- [ ] Step 2: `refractor.register(lang)` 实现
- [ ] Step 3: 测试通过并提交

### Task 3: 浮层 applyLanguage 归一化

**Files:**
- Modify: `src/renderer/src/components/Editor/overlays/useEditorOverlays.ts`（applyLanguage）

- [ ] Step 1: 写入 attrs 使用 `normalizeCodeLanguage`
- [ ] Step 2: 相关行为由 Task 1 单测覆盖；提交

### Task 4: 语义色板 CSS

**Files:**
- Create: `src/renderer/src/styles/themes/code-palette-light.css`
- Create: `src/renderer/src/styles/themes/code-palette-dark.css`
- Create: `src/renderer/src/styles/code-syntax.css`
- Modify: `src/renderer/src/main.tsx`（import）
- Modify: `src/renderer/src/styles/components/editor.css`（删除旧 token 色块）
- Modify: 各 `themes/*.css`（引入/覆盖 `--code-keyword` 等）

- [ ] Step 1: light/dark 默认变量 + code-syntax 映射
- [ ] Step 2: 删 editor.css 硬编码与 dark/github/atom 重复选择器
- [ ] Step 3: 浅色主题跟 light、深色跟 dark；ocean/pine 等可覆盖 keyword
- [ ] Step 4: 提交

### Task 5: 文档

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/UI-INTERACTION-SPEC.md`（一句）
- Modify: spec 状态为已确认/已实现

- [ ] Step 1: 同步文档并提交 `docs: …`

---

**执行：** 用户已说「开始」，本会话按 Task 1→5 内联执行。
