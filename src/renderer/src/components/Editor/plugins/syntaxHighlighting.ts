import type { Refractor } from 'refractor/core'

import cmake from 'refractor/cmake'
import dart from 'refractor/dart'
import docker from 'refractor/docker'
import elixir from 'refractor/elixir'
import graphql from 'refractor/graphql'
import haskell from 'refractor/haskell'
import hcl from 'refractor/hcl'
import http from 'refractor/http'
import json5 from 'refractor/json5'
import jsx from 'refractor/jsx'
import nginx from 'refractor/nginx'
import powershell from 'refractor/powershell'
import protobuf from 'refractor/protobuf'
import scala from 'refractor/scala'
import toml from 'refractor/toml'
import tsx from 'refractor/tsx'
import wasm from 'refractor/wasm'
import zig from 'refractor/zig'

/**
 * 技术文档高频、且 refractor 默认包未包含的语言。
 * 增语言：加 import + 本数组一项 + 单测 registered 断言。
 */
const EXTRA_CODE_LANGUAGES = [
  cmake,
  dart,
  docker,
  elixir,
  graphql,
  haskell,
  hcl,
  http,
  json5,
  jsx,
  nginx,
  powershell,
  protobuf,
  scala,
  toml,
  tsx,
  wasm,
  zig,
] as const

let extrasRegistered = false

/**
 * Mermaid 由独立预览插件渲染，映射为纯文本避免 Prism 误报不支持。
 * 同时注册常用扩展语言（幂等）。
 */
export const configureCodeBlockRefractor = (refractor: Refractor): void => {
  if (!extrasRegistered) {
    for (const language of EXTRA_CODE_LANGUAGES) {
      const name = language.displayName
      if (!refractor.registered(name)) {
        refractor.register(language)
      }
    }
    extrasRegistered = true
  }

  if (!refractor.registered('mermaid')) {
    refractor.alias('plain', 'mermaid')
  }
}
