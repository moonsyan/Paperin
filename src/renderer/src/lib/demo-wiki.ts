/**
 * 无真实知识库时，示例树内的 [[双链]] 按演示文件名解析。
 * path 使用 demo:<id> 前缀，与磁盘路径区分，仅供补全列表展示。
 */

export interface DemoWikiFile {
  id: string
  name: string
}

export interface DemoWikiResolveResult {
  resolved: boolean
  id: string
}

const stripExtension = (name: string): string =>
  name.replace(/\.(md|markdown)$/i, '')

const targetBaseName = (target: string): string => {
  const withoutAnchor = target.replace(/[#^].*$/, '').trim()
  const leaf = withoutAnchor.replace(/\\/g, '/').split('/').pop() ?? withoutAnchor
  return stripExtension(leaf)
}

export const resolveDemoWikiTarget = (
  target: string,
  demos: readonly DemoWikiFile[],
): DemoWikiResolveResult => {
  if (!target.trim()) return { resolved: false, id: '' }
  const needle = targetBaseName(target).toLocaleLowerCase()
  if (!needle) return { resolved: false, id: '' }
  const match = demos.find((demo) => stripExtension(demo.name).toLocaleLowerCase() === needle)
  return match ? { resolved: true, id: match.id } : { resolved: false, id: '' }
}

export const listDemoWikiLinkFiles = (
  demos: readonly DemoWikiFile[],
): Array<{ name: string; path: string }> =>
  demos.map((demo) => ({
    name: stripExtension(demo.name),
    path: `demo:${demo.id}`,
  }))
