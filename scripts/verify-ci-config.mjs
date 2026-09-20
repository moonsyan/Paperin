#!/usr/bin/env node
// 校验 CI workflow 的质量门禁（实现见 ci-config-gates.mjs）。

import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import { BUILD_REQUIRED_STEPS, verifyCiConfig } from './ci-config-gates.mjs'

function main() {
  const { ok, errors } = verifyCiConfig()
  if (!ok) {
    for (const line of errors) {
      console.error(line)
    }
    console.error('\nCI 配置未满足 release/build 门禁要求。')
    console.error(`build: 每个平台 job 必须按序包含: ${BUILD_REQUIRED_STEPS.join(' → ')}`)
    console.error('release: 候选验收(smoke) + draft 候选 + publish-formal 显式门禁。')
    process.exit(1)
  }

  console.log('CI 配置校验通过: build.yml 三平台门禁与 release.yml 候选/正式发行门禁均满足要求。')
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])

if (isMain) {
  main()
}
