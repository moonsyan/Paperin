import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('packaged file associations', () => {
  it('registers Markdown documents for the desktop installer', async () => {
    const pkg = JSON.parse(await readFile(join(process.cwd(), 'package.json'), 'utf-8'))
    const associations = pkg.build?.fileAssociations ?? []
    const extensions = associations.flatMap((entry) =>
      Array.isArray(entry.ext) ? entry.ext : [entry.ext],
    )

    expect(extensions).toContain('md')
    expect(extensions).toContain('markdown')
  })
})
