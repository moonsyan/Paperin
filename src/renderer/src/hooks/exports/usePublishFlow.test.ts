// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MutableRefObject } from 'react'
import type { EditorHandle } from '../../components/Editor'
import { createExportSession } from '../../lib/export-session'
import * as exportBundle from '../../lib/export-bundle'
import { usePublishFlow } from './usePublishFlow'

const makeEditorRef = (): MutableRefObject<EditorHandle | null> => ({
  current: {
    isReady: () => true,
    getMarkdown: () => '# doc',
    ensureRichContent: vi.fn(async () => {}),
    restoreExportViewport: vi.fn(),
  } as unknown as EditorHandle,
})

describe('usePublishFlow（R04 缺图与写入一致）', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'desktopAPI', { configurable: true, value: undefined })
  })

  it('内联图片 failed>0 时不调用 exportBundle、不显示成功、不写目录', async () => {
    const pickExportDirectory = vi.fn(async () => ({ ok: true, data: { path: 'D:/out' } }))
    const exportBundleIpc = vi.fn(async () => ({
      ok: true,
      data: { path: 'D:/out/pkg', assetCount: 0, bytes: 1 },
    }))
    Object.defineProperty(window, 'desktopAPI', {
      configurable: true,
      value: { document: { pickExportDirectory, exportBundle: exportBundleIpc } },
    })

    const buildExportBundleSpy = vi.spyOn(exportBundle, 'buildExportBundle')
    const setToast = vi.fn()
    const exportSessionRef = { current: createExportSession() }
    const activeFileIdRef: MutableRefObject<string> = { current: 'file-a' }

    const { result } = renderHook(() =>
      usePublishFlow({
        editorRef: makeEditorRef(),
        activeFileIdRef,
        setToast,
        exportSessionRef,
        buildPublishedHtml: vi.fn(async () => '<img src="mdimg://missing">'),
        inlineImagesInHtml: vi.fn(async () => ({
          html: '<img src="mdimg://missing">',
          failed: 1,
        })),
      }),
    )

    await act(async () => {
      await result.current.handlePublishBundle({ template: 'blog', includeToc: true, inlineImages: true, cleanWikiLinks: true })
    })

    expect(buildExportBundleSpy).not.toHaveBeenCalled()
    expect(pickExportDirectory).not.toHaveBeenCalled()
    expect(exportBundleIpc).not.toHaveBeenCalled()
    expect(setToast).not.toHaveBeenCalledWith(expect.stringMatching(/资源包已导出/))
    expect(setToast).toHaveBeenCalledWith(expect.stringMatching(/无法读取|已取消/))

    buildExportBundleSpy.mockRestore()
  })

  it('用户取消选目录时不写入', async () => {
    const pickExportDirectory = vi.fn(async () => ({ ok: false }))
    const exportBundleIpc = vi.fn()
    Object.defineProperty(window, 'desktopAPI', {
      configurable: true,
      value: {
        document: {
          pickExportDirectory,
          exportBundle: exportBundleIpc,
          readImageInline: vi.fn(async () => ({ ok: true, data: { dataUrl: 'data:image/png;base64,AA==' } })),
        },
      },
    })

    const setToast = vi.fn()
    const exportSessionRef = { current: createExportSession() }
    const activeFileIdRef: MutableRefObject<string> = { current: 'file-a' }

    const { result } = renderHook(() =>
      usePublishFlow({
        editorRef: makeEditorRef(),
        activeFileIdRef,
        setToast,
        exportSessionRef,
        buildPublishedHtml: vi.fn(async () => '<p>ok</p>'),
        inlineImagesInHtml: vi.fn(async () => ({ html: '<p>ok</p>', failed: 0 })),
      }),
    )

    await act(async () => {
      await result.current.handlePublishBundle({
        template: 'blog',
        includeToc: false,
        inlineImages: false,
        cleanWikiLinks: true,
      })
    })

    expect(pickExportDirectory).toHaveBeenCalled()
    expect(exportBundleIpc).not.toHaveBeenCalled()
    expect(setToast).not.toHaveBeenCalledWith(expect.stringMatching(/资源包已导出/))
  })

  it('导出期间切换文档则取消且不选目录', async () => {
    const pickExportDirectory = vi.fn()
    Object.defineProperty(window, 'desktopAPI', {
      configurable: true,
      value: { document: { pickExportDirectory } },
    })

    const activeFileIdRef: MutableRefObject<string> = { current: 'file-a' }
    const editorRef = makeEditorRef()
    editorRef.current!.ensureRichContent = vi.fn(async () => {
      activeFileIdRef.current = 'file-b'
    })

    const setToast = vi.fn()
    const exportSessionRef = { current: createExportSession() }

    const { result } = renderHook(() =>
      usePublishFlow({
        editorRef,
        activeFileIdRef,
        setToast,
        exportSessionRef,
        buildPublishedHtml: vi.fn(async () => '<p>x</p>'),
        inlineImagesInHtml: vi.fn(async () => ({ html: '<p>x</p>', failed: 0 })),
      }),
    )

    await act(async () => {
      await result.current.handlePublishBundle({
        template: 'blog',
        includeToc: true,
        inlineImages: true,
        cleanWikiLinks: true,
      })
    })

    expect(pickExportDirectory).not.toHaveBeenCalled()
    expect(setToast).toHaveBeenCalledWith(expect.stringMatching(/切换了文档/))
  })

  it('重复导出时会话占用时不二次选目录', async () => {
    const pickExportDirectory = vi.fn(async () => ({ ok: true, data: { path: 'D:/out' } }))
    Object.defineProperty(window, 'desktopAPI', {
      configurable: true,
      value: {
        document: {
          pickExportDirectory,
          exportBundle: vi.fn(async () => ({ ok: true, data: { path: 'D:/out/p', assetCount: 0, bytes: 1 } })),
          readImageInline: vi.fn(async () => ({ ok: true, data: { dataUrl: 'data:image/png;base64,AA==' } })),
        },
      },
    })

    const session = createExportSession()
    session.begin()
    const setToast = vi.fn()
    const exportSessionRef = { current: session }
    const activeFileIdRef: MutableRefObject<string> = { current: 'a' }

    const { result } = renderHook(() =>
      usePublishFlow({
        editorRef: makeEditorRef(),
        activeFileIdRef,
        setToast,
        exportSessionRef,
        buildPublishedHtml: vi.fn(async () => '<p>x</p>'),
        inlineImagesInHtml: vi.fn(async () => ({ html: '<p>x</p>', failed: 0 })),
      }),
    )

    await act(async () => {
      await result.current.handlePublishBundle({
        template: 'blog',
        includeToc: true,
        inlineImages: false,
        cleanWikiLinks: true,
      })
    })

    expect(pickExportDirectory).not.toHaveBeenCalled()
    expect(setToast).toHaveBeenCalledWith('已有导出任务正在进行')
    session.finish()
  })

  it('写出资源包时附带脱敏交付报告', async () => {
    const pickExportDirectory = vi.fn(async () => ({ ok: true, data: { path: 'D:/out' } }))
    const exportBundleIpc = vi.fn(async () => ({
      ok: true,
      data: { path: 'D:/out/pkg', assetCount: 0, bytes: 1 },
    }))
    Object.defineProperty(window, 'desktopAPI', {
      configurable: true,
      value: { document: { pickExportDirectory, exportBundle: exportBundleIpc } },
    })
    const buildExportBundleSpy = vi.spyOn(exportBundle, 'buildExportBundle')
    const report = {
      schemaVersion: 1 as const,
      generatedAt: '2026-09-21T00:00:00.000Z',
      documentCount: 1,
      diagnosticsByCode: { BROKEN_LINK: 1 },
      missingTargets: ['资料/a.md'],
      indexComplete: true,
    }
    const { result } = renderHook(() =>
      usePublishFlow({
        editorRef: makeEditorRef(),
        activeFileIdRef: { current: 'file-a' },
        setToast: vi.fn(),
        exportSessionRef: { current: createExportSession() },
        buildPublishedHtml: vi.fn(async () => '<title>t</title>'),
        inlineImagesInHtml: vi.fn(async () => ({ html: '<title>t</title>', failed: 0 })),
        getDeliveryReport: () => report,
      }),
    )
    await act(async () => {
      await result.current.handlePublishBundle({
        template: 'blog',
        includeToc: true,
        inlineImages: true,
        cleanWikiLinks: true,
      })
    })
    expect(buildExportBundleSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      'D:/out',
      expect.objectContaining({
        report: expect.objectContaining({
          fileName: 'paperin-delivery-report.json',
          json: expect.stringContaining('"schemaVersion":1'),
        }),
      }),
    )
    expect(buildExportBundleSpy.mock.calls[0]?.[3]?.report?.json).not.toMatch(/D:\\\\|content|query/)
    buildExportBundleSpy.mockRestore()
  })
})
