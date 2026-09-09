import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const directory = dirname(fileURLToPath(import.meta.url))
const sourceFile = join(directory, 'demo.ts')
const options = { strict: true, noEmit: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'], skipLibCheck: true, types: [] }
const program = ts.createProgram([sourceFile], options)
const diagnostics = ts.getPreEmitDiagnostics(program)
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCurrentDirectory: () => directory, getCanonicalFileName: (name) => name, getNewLine: () => '\n' }))
  process.exitCode = 1
} else {
  const [source, template, icons] = await Promise.all([
    readFile(sourceFile, 'utf8'), readFile(join(directory, 'index.template.html'), 'utf8'), readFile(join(directory, 'icons.svg'), 'utf8'),
  ])
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, removeComments: false } })
  const browserGlobals = '/* global document, matchMedia, innerWidth, IntersectionObserver, Node, HTMLElement, getSelection, Element, window, localStorage */'
  await writeFile(join(directory, 'demo.js'), `// 由 build.mjs 从 demo.ts 生成。\n${browserGlobals}\n${output.outputText}`, 'utf8')
  await writeFile(join(directory, 'index.html'), template.replace('<!-- ICON_SPRITE -->', icons), 'utf8')
  console.log('留白 Demo：TypeScript strict 检查通过，已生成 index.html 与 demo.js')
}
