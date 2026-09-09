import { ipcMain } from 'electron'
import { CHANNELS } from '../../shared/ipc/channels'
import { getSetting, setSetting } from '../settings/settings-store'
import { isValidBase64Payload, MAX_IMAGE_BASE64_LENGTH, MAX_IMAGE_SIZE } from './image-payload'

/** 图床配置状态：访问令牌仅由主进程持久化，渲染端只拿到是否已配置 */
const getImageHostStatus = async (): Promise<{
  provider: 'local' | 'smms'
  configured: boolean
}> => {
  const config = (await getSetting('imageHost')) as
    | { provider?: unknown; token?: unknown }
    | undefined
  const provider = config?.provider === 'smms' ? 'smms' : 'local'
  return {
    provider,
    configured: provider === 'smms' && typeof config?.token === 'string' && Boolean(config.token),
  }
}

const MAX_IMAGE_HOST_TOKEN_LENGTH = 2048

export const registerImageHostHandlers = (): void => {
  // 图床上传（基础框架：支持 SM.MS，未配置时返回 NOT_CONFIGURED 由渲染端降级本地）
  ipcMain.handle(
    CHANNELS.IMAGE_UPLOAD,
    async (_event, args: { dataUrl: string }) => {
      // L8：入参形状守卫——dataUrl 必须是字符串，否则解引用抛未分类异常
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
        // L6：解码前校验，损坏数据不再以截断内容上传
        if (!isValidBase64Payload(match[3])) {
          return { ok: false, error: { code: 'INVALID_DATA', message: '图片数据损坏，无法上传' } }
        }
        // 配置存于主进程 settings，避免 token 在渲染进程暴露
        const cfg = (await getSetting('imageHost')) as
          | { provider?: string; token?: string }
          | undefined
        if (cfg?.provider !== 'smms' || !cfg.token) {
          return { ok: false, error: { code: 'NOT_CONFIGURED' } }
        }
        const ext = match[2].toLowerCase().replace('jpeg', 'jpg')
        const buffer = Buffer.from(match[3], 'base64')
        // 体积守卫：超大图片拒绝上传，避免内存峰值与图床拒绝
        if (buffer.length > MAX_IMAGE_SIZE) {
          return { ok: false, error: { code: 'TOO_LARGE', message: '图片超过 20MB，无法上传图床' } }
        }
        const form = new FormData()
        form.append(
          'smfile',
          new Blob([buffer], { type: match[1] }),
          `image-${Date.now()}.${ext}`,
        )
        // 30 秒超时：图床 API 挂起时不能让 IPC 调用无限期阻塞
        const controller = new AbortController()
        const timeoutTimer = setTimeout(() => controller.abort(), 30_000)
        let resp: Response
        try {
          resp = await fetch('https://sm.ms/api/v2/upload', {
            method: 'POST',
            headers: { Authorization: cfg.token },
            body: form,
            signal: controller.signal,
          })
        } finally {
          clearTimeout(timeoutTimer)
        }
        // L5：5xx/429 等错误响应不是 JSON，resp.json() 会抛原始解析文本；
        // 先检查 resp.ok 并给出稳定文案
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
        // 重复图片：SM.MS 会在 message 中返回已有链接
        const dup = json.message?.match(/https?:\/\/\S+\.(png|jpe?g|gif|webp|bmp)/i)
        if (dup) return { ok: true, data: { url: dup[0] } }
        return {
          ok: false,
          error: { code: 'UPLOAD_FAILED', message: json.message ?? '上传失败' },
        }
      } catch (err) {
        return { ok: false, error: { code: 'UPLOAD_FAILED', message: String(err) } }
      }
    },
  )

  // 图床配置读取（渲染端图片设置面板据此显示当前 provider / 是否已配置）
  ipcMain.handle(CHANNELS.IMAGE_HOST_GET_STATUS, async () => {
    try {
      const status = await getImageHostStatus()
      return { ok: true, data: status }
    } catch (err) {
      return { ok: false, error: { code: 'IO_ERROR', message: String(err) } }
    }
  })

  // 图床配置写入（token 只存主进程 settings，绝不落入前端常量/日志/历史）
  ipcMain.handle(
    CHANNELS.IMAGE_HOST_SET_CONFIG,
    async (_event, args: { provider: 'local' | 'smms'; token?: string }) => {
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
        // 仅切换 provider 时（未传 token）保留已存储的 token，
        // 否则切到 local 再切回 sm.ms 会静默丢失已配置的凭据。
        const previous = (await getSetting('imageHost')) as
          | { provider?: string; token?: string }
          | undefined
        const nextToken = token ?? previous?.token
        await setSetting('imageHost', { provider, token: nextToken })
        const status = await getImageHostStatus()
        return { ok: true, data: status }
      } catch (err) {
        return { ok: false, error: { code: 'IO_ERROR', message: String(err) } }
      }
    },
  )
}
