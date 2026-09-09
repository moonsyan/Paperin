import { describe, expect, it } from 'vitest'
import { collectAttachmentBaseNames, extractLinksFromMarkdown } from './workspace-link-index'

describe('extractLinksFromMarkdown', () => {
  it('提取基础 wiki 链接与别名', () => {
    const links = extractLinksFromMarkdown('参见 [[笔记一]] 与 [[笔记二|显示名]]')
    expect(links).toHaveLength(2)
    expect(links[0]).toMatchObject({ target: '笔记一', kind: 'wiki', line: 1 })
    expect(links[1]).toMatchObject({ target: '笔记二', alias: '显示名', kind: 'wiki' })
  })

  it('提取指向 md 文件的相对链接并剥离锚点', () => {
    const links = extractLinksFromMarkdown('[标题](./dir/note.md#章节) 和 [外链](https://a.com/x.md)')
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({ target: './dir/note.md', kind: 'md', line: 1 })
  })

  it('排除外部协议与非 md 目标', () => {
    const links = extractLinksFromMarkdown('[a](mailto:x@y.z) [b](#anchor) [c](img.png) [d](folder/readme)')
    expect(links).toHaveLength(0)
  })

  it('跳过 frontmatter 与围栏代码块', () => {
    const md = [
      '---',
      'title: [[不该提取]]',
      '---',
      '# 标题',
      '',
      '```md',
      '[[代码块内]]不该算链接',
      '```',
      '',
      '~~~',
      '[x](a.md)',
      '~~~',
      '',
      '正文 [[有效链接]]',
    ].join('\n')
    const links = extractLinksFromMarkdown(md)
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({ target: '有效链接', line: 14 })
  })

  it('跳过行内代码中的 wiki 链接', () => {
    const links = extractLinksFromMarkdown('反引号 `[[字面量]]` 不算，[[真链接]] 算')
    expect(links).toHaveLength(1)
    expect(links[0]?.target).toBe('真链接')
  })

  it('不成对的反引号按字面文本处理（其后的链接仍提取）', () => {
    const links = extractLinksFromMarkdown("it`s a [[链接]] here")
    expect(links).toHaveLength(1)
    expect(links[0]?.target).toBe('链接')
  })

  it('图片/媒体嵌入（![[x.png]]）不进索引——只保留笔记间链接', () => {
    const md = [
      '![[截图 2024.png]]',
      '![[图表.svg|600]]',
      '![[video.mp4]]',
      '正文引用 ![[笔记一]] 与 [[笔记二]]',
    ].join('\n')
    const links = extractLinksFromMarkdown(md)
    expect(links.map((l) => l.target)).toEqual(['笔记一', '笔记二'])
  })

  it('不带扩展名的图片嵌入（![[截图 2024]]）按附件基名排除', () => {
    const md = [
      '![[Pasted image 20240101123456]]',
      '![[截图 2024|800]]',
      '正文 [[未创建的笔记]] 保留',
    ].join('\n')
    const attachments = new Set(['pasted image 20240101123456', '截图 2024'])
    const links = extractLinksFromMarkdown(md, attachments)
    expect(links.map((l) => l.target)).toEqual(['未创建的笔记'])
  })

  it('无扩展名目标不在附件集合中时保留（可能是指向未创建笔记的链接）', () => {
    const links = extractLinksFromMarkdown('[[Pasted image 20240101123456]]', new Set())
    expect(links).toHaveLength(1)
  })

  it('纯锚点引用（[[#标题]]）不指向文件，不进索引', () => {
    const links = extractLinksFromMarkdown('跳到 [[#下一节]] 与 [[#^block-id]]')
    expect(links).toHaveLength(0)
  })

  it('锚点式 wiki 链接保留原文（含 #heading）', () => {
    const links = extractLinksFromMarkdown('[[note#heading]]')
    expect(links).toHaveLength(1)
    expect(links[0]?.target).toBe('note#heading')
  })

  it('预览文本截断到 120 字符', () => {
    const long = 'x'.repeat(200)
    const links = extractLinksFromMarkdown(`${long} [[a]]`)
    expect(links[0]?.preview.length).toBeLessThanOrEqual(120)
  })

  it('同一行多个链接全部提取', () => {
    const links = extractLinksFromMarkdown('[[a]] 中间 [[b]] 结尾 [t](c.md)')
    expect(links.map((l) => l.target)).toEqual(['a', 'b', 'c.md'])
  })
})

describe('collectAttachmentBaseNames', () => {
  it('收集工作区媒体附件的无扩展名基名（小写，跳过 md 与点目录）', async () => {
    const { mkdtemp, mkdir, writeFile, rm } = await import('fs/promises')
    const { tmpdir } = await import('os')
    const { join } = await import('path')
    const dir = await mkdtemp(join(tmpdir(), 'mkedit-attach-'))
    try {
      await writeFile(join(dir, 'IMG.PNG'), 'x')
      await writeFile(join(dir, 'note.md'), 'x')
      await mkdir(join(dir, 'sub'))
      await writeFile(join(dir, 'sub', '截图 2024.png'), 'x')
      await mkdir(join(dir, '.git'))
      await writeFile(join(dir, '.git', 'hidden.jpg'), 'x')
      const names = await collectAttachmentBaseNames(dir)
      expect(names.has('img')).toBe(true)
      expect(names.has('截图 2024')).toBe(true)
      expect(names.has('hidden')).toBe(false)
      expect(names.size).toBe(2)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
