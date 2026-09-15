import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { flushPersistedSettings } from '../hooks/usePersistedSetting'
import { setConfirmDialogListener } from '../lib/confirm-dialog'
import type { ActiveConfirmRequest } from '../components/ConfirmDialog'
import { TITLEBAR_COLORS } from './constants'

interface AppWindowEffectsOptions {
  effectiveTheme: string
  fontSize: number
  contentWidth: number
  lineHeight: number
  contentFont: string
  saved: boolean
  docTitle: string
  documents: Record<string, { dirty: boolean }>
  setConfirmRequest: Dispatch<SetStateAction<ActiveConfirmRequest | null>>
  toast: string
  setToast: Dispatch<SetStateAction<string>>
}

/** DOM/窗口状态由根组件统一装配，监听只随这一个 hook 生命周期存在。 */
export function useAppWindowEffects({
  effectiveTheme, fontSize, contentWidth, lineHeight, contentFont,
  saved, docTitle, documents, setConfirmRequest, toast, setToast,
}: AppWindowEffectsOptions): void {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', effectiveTheme)
    const colors = TITLEBAR_COLORS[effectiveTheme] ?? TITLEBAR_COLORS.default
    window.desktopAPI?.window.setTitlebarColor(colors.bg, colors.symbol).catch(() => {})
  }, [effectiveTheme])
  useEffect(() => { document.documentElement.style.setProperty('--efs', `${fontSize}px`) }, [fontSize])
  useEffect(() => { document.documentElement.style.setProperty('--ecw', `${contentWidth}px`) }, [contentWidth])
  useEffect(() => { document.documentElement.style.setProperty('--elh', String(lineHeight)) }, [lineHeight])
  useEffect(() => { document.documentElement.setAttribute('data-contentfont', contentFont) }, [contentFont])
  useEffect(() => { document.title = `${saved ? '' : '● '}${docTitle} — Paperin` }, [docTitle, saved])
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (Object.values(documents).some((record) => record.dirty)) {
        event.preventDefault()
        event.returnValue = ''
      }
      flushPersistedSettings()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [documents])
  useEffect(() => {
    setConfirmDialogListener((request, resolve) => setConfirmRequest({ ...request, resolve }))
    return () => setConfirmDialogListener(null)
  }, [setConfirmRequest])
  useEffect(() => {
    const bridge = window as unknown as { __paperin_notify?: (message: string) => void }
    bridge.__paperin_notify = (message) => setToast(message)
    return () => { delete bridge.__paperin_notify }
  }, [setToast])
  useEffect(() => {
    if (!toast) return
    const timeout = setTimeout(() => setToast(''), 3500)
    return () => clearTimeout(timeout)
  }, [toast, setToast])
}
