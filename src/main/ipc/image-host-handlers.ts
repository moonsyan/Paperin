import { safeStorage } from 'electron'
import { ipcMain } from 'electron'
import { CHANNELS } from '../../shared/ipc/channels'
import type { ImageHostProvider } from '../../shared/image-host'
import { getSetting, setSetting } from '../settings/settings-store'
import { createSecureTokenStore, type ImageHostRecord } from '../settings/secure-token-store'
import { isValidBase64Payload, MAX_IMAGE_BASE64_LENGTH, MAX_IMAGE_SIZE } from './image-payload'

const MAX_IMAGE_HOST_TOKEN_LENGTH = 2048

const createAppTokenStore = () =>
  createSecureTokenStore({
    isEncryptionAvailable: () => {
      try {
        return safeStorage.isEncryptionAvailable()
      } catch {
        return false
      }
    },
    encryptString: (plain) => safeStorage.encryptString(plain),
    decryptString: (cipher) => safeStorage.decryptString(cipher),
    getRecord: async () => (await getSetting('imageHost')) as ImageHostRecord | undefined,
    setRecord: async (record) => {
      await setSetting('imageHost', record)
    },
  })

export const registerImageHostHandlers = (): void => {
  const tokenStore = createAppTokenStore()

  ipcMain.handle(
    CHANNELS.IMAGE_UPLOAD,
    async (_event, args: { dataUrl: string }) => {
      if (!args || typeof args !== 'object' || typeof args.dataUrl !== 'string') {
        return { ok: false, error: { code: 'INVALID_ARGUMENT' } }
      }
      try {
        const match = args.dataUrl.match(
          /^data:(image\/(png|jpe?g|gif|webp|bmp));base64,(.+)$/i,
        )
        if (!match) return { ok: false, error: { code: 'UNSUPPORTED' } }
        if (match[3].length > MAX_IMAGE_BASE64_LENGTH) {
          return {
            ok: false,
            error: { code: 'TOO_LARGE', message: '图片超过 20MB，无法上传图床' },
          }
        }
        if (!isValidBase64Payload(match[3])) {
          return { ok: false, error: { code: 'INVALID_DATA', message: '图片数据损坏，无法上传' } }
        }
        await tokenStore.migratePlaintextIfNeeded()
        const token = await tokenStore.getPlaintextToken()
        if (!token) {
          return { ok: false, error: { code: 'NOT_CONFIGURED' } }
        }
        const ext = match[2].toLowerCase().replace('jpeg', 'jpg')
        const buffer = Buffer.from(match[3], 'base64')
        if (buffer.length > MAX_IMAGE_SIZE) {
          return { ok: false, error: { code: 'TOO_LARGE', message: '图片超过 20MB，无法上传图床' } }
        }
        const form = new FormData()
        form.append(
          'smfile',
          new Blob([buffer], { type: match[1] }),
          `image-${Date.now()}.${ext}`,
        )
        const controller = new AbortController()
        const timeoutTimer = setTimeout(() => controller.abort(), 30_000)
        let resp: Response
        try {
          resp = await fetch('https://sm.ms/api/v2/upload', {
            method: 'POST',
            headers: { Authorization: token },
            body: form,
            signal: controller.signal,
          })
        } finally {
          clearTimeout(timeoutTimer)
        }
        if (!resp.ok) {
          return {
            ok: false,
            error: {
              code: 'UPLOAD_FAILED',
              message: `图床服务暂不可用（HTTP ${resp.status}），请稍后重试`,
            },
          }
        }
        const json = (await resp.json()) as {
          success?: boolean
          data?: { url?: string }
          message?: string
          images?: string
        }
        if (json.success && json.data?.url) {
          return { ok: true, data: { url: json.data.url } }
        }
        const dup = json.message?.match(/https?:\/\/\S+\.(png|jpe?g|gif|webp|bmp)/i)
        if (dup) return { ok: true, data: { url: dup[0] } }
        return {
          ok: false,
          error: { code: 'UPLOAD_FAILED', message: json.message ?? '上传失败' },
        }
      } catch {
        return { ok: false, error: { code: 'UPLOAD_FAILED', message: '图床上传失败' } }
      }
    },
  )

  ipcMain.handle(CHANNELS.IMAGE_HOST_GET_STATUS, async () => {
    try {
      const status = await tokenStore.migratePlaintextIfNeeded()
      return { ok: true, data: status }
    } catch {
      return { ok: false, error: { code: 'IO_ERROR', message: '图床状态无法读取' } }
    }
  })

  ipcMain.handle(
    CHANNELS.IMAGE_HOST_SET_CONFIG,
    async (_event, args: { provider: ImageHostProvider; token?: string }) => {
      try {
        const provider = args?.provider
        if (provider !== 'local' && provider !== 'smms') {
          return { ok: false, error: { code: 'INVALID_ARGUMENT' } }
        }
        const token = typeof args?.token === 'string' ? args.token : undefined
        if (token && token.length > MAX_IMAGE_HOST_TOKEN_LENGTH) {
          return {
            ok: false,
            error: { code: 'INVALID_ARGUMENT', message: '图床 token 过长' },
          }
        }
        const status = await tokenStore.saveToken(provider, token)
        return { ok: true, data: status }
      } catch {
        return { ok: false, error: { code: 'IO_ERROR', message: '图床配置无法保存' } }
      }
    },
  )
}
