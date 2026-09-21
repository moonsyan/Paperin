import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  createSecureTokenStore,
  type ImageHostRecord,
  type SecureTokenDependencies,
} from './secure-token-store'

const rawToken = 'smms-secret-token-value'

const createMemoryStore = (
  initial: ImageHostRecord | undefined,
  options?: { encryptionAvailable?: boolean; encryptFails?: boolean },
): SecureTokenDependencies & { record: ImageHostRecord | undefined } => {
  const state = { record: initial }
  const available = options?.encryptionAvailable !== false
  return {
    get record() {
      return state.record
    },
    isEncryptionAvailable: () => available,
    encryptString: (plain) => {
      if (options?.encryptFails) throw new Error('encrypt failed')
      return Buffer.from(`enc:${plain}`, 'utf8')
    },
    decryptString: (cipher) => Buffer.from(cipher).toString('utf8').replace(/^enc:/, ''),
    getRecord: async () => state.record,
    setRecord: async (record) => {
      state.record = record
    },
  }
}

describe('SecureTokenStore', () => {
  it('写入后 settings 内容不含原 token', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'paperin-token-'))
    const settingsPath = join(dir, 'settings.json')
    await writeFile(settingsPath, '{"theme":"light"}', 'utf8')
    const deps = createMemoryStore({ provider: 'local' })
    const store = createSecureTokenStore(deps)
    await store.saveToken('smms', rawToken)
    await writeFile(settingsPath, JSON.stringify({ imageHost: deps.record, theme: 'light' }), 'utf8')
    expect(await readFile(settingsPath, 'utf8')).not.toContain(rawToken)
    const status = await store.getStatus()
    expect(status).toEqual({ provider: 'smms', configured: true, credentialState: 'ok' })
  })

  it('旧明文 token 只有在加密写入成功后才删除', async () => {
    const deps = createMemoryStore({ provider: 'smms', token: rawToken })
    const store = createSecureTokenStore(deps)
    const status = await store.migratePlaintextIfNeeded()
    expect(status).toEqual({ provider: 'smms', configured: true, credentialState: 'ok' })
    expect(deps.record?.token).toBeUndefined()
    expect(deps.record?.tokenCipher).toBeTruthy()
    expect(await store.getPlaintextToken()).toBe(rawToken)
  })

  it('加密失败时保留明文、禁用上传且不误报已配置', async () => {
    const deps = createMemoryStore({ provider: 'smms', token: rawToken }, { encryptFails: true })
    const store = createSecureTokenStore(deps)
    const status = await store.migratePlaintextIfNeeded()
    expect(status).toEqual({ provider: 'smms', configured: false, credentialState: 'migrate-failed' })
    expect(deps.record?.token).toBe(rawToken)
    expect(await store.getPlaintextToken()).toBeNull()
  })

  it('安全存储不可用时不能误报已配置', async () => {
    const deps = createMemoryStore({ provider: 'smms', token: rawToken }, { encryptionAvailable: false })
    const store = createSecureTokenStore(deps)
    const status = await store.getStatus()
    expect(status).toEqual({ provider: 'local', configured: false, credentialState: 'unavailable' })
    expect(await store.getPlaintextToken()).toBeNull()
  })
})
