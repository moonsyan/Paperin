/**
 * 代码块语言标识归一化：小写 + 别名，供 Prism/Refractor 匹配。
 * Milkdown Prism 使用 listLanguages().includes(language) 且区分大小写。
 */

/** 用户常填标识 → refractor 已注册名 */
export const CODE_LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
  yml: 'yaml',
  jsonc: 'json5',
  dockerfile: 'docker',
  ps1: 'powershell',
  pwsh: 'powershell',
  proto: 'protobuf',
  tf: 'hcl',
  terraform: 'hcl',
  text: 'plain',
  txt: 'plain',
  plaintext: 'plain',
}

/**
 * 将用户输入的语言标识规范为 refractor 可识别的小写名。
 * 空串保持为空（表示无语言）。
 */
export const normalizeCodeLanguage = (raw: string): string => {
  const key = raw.trim().toLowerCase()
  if (!key) return ''
  return CODE_LANGUAGE_ALIASES[key] ?? key
}
