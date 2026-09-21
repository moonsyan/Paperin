import type {
  ImageHostCredentialState,
  ImageHostProvider,
  ImageHostStatus,
} from '../../shared/image-host'

export type { ImageHostProvider, ImageHostStatus }
export type CredentialState = ImageHostCredentialState

export interface ImageHostRecord {
  provider?: ImageHostProvider | string
  token?: string
  tokenCipher?: string
}

export interface SecureTokenDependencies {
  isEncryptionAvailable(): boolean
  encryptString(plain: string): Buffer
  decryptString(cipher: Buffer): string
  getRecord(): Promise<ImageHostRecord | undefined>
  setRecord(record: ImageHostRecord): Promise<void>
}

const asProvider = (value: unknown): ImageHostProvider =>
  value === 'smms' ? 'smms' : 'local'

const hasCipher = (record: ImageHostRecord | undefined): boolean =>
  typeof record?.tokenCipher === 'string' && record.tokenCipher.length > 0

const hasPlaintext = (record: ImageHostRecord | undefined): boolean =>
  typeof record?.token === 'string' && record.token.length > 0

export const createSecureTokenStore = (deps: SecureTokenDependencies) => {
  const unavailableStatus = (): ImageHostStatus => ({
    provider: 'local',
    configured: false,
    credentialState: 'unavailable',
  })

  const persistCipher = async (provider: ImageHostProvider, token: string): Promise<ImageHostStatus> => {
    const cipher = deps.encryptString(token).toString('base64')
    await deps.setRecord({ provider, tokenCipher: cipher })
    return { provider, configured: true, credentialState: 'ok' }
  }

  const migratePlaintextIfNeeded = async (): Promise<ImageHostStatus> => {
    const record = await deps.getRecord()
    if (!deps.isEncryptionAvailable()) return unavailableStatus()
    if (!hasPlaintext(record)) return getStatusFromRecord(record)
    try {
      return await persistCipher(asProvider(record?.provider), record?.token as string)
    } catch {
      return { provider: asProvider(record?.provider), configured: false, credentialState: 'migrate-failed' }
    }
  }

  const getStatusFromRecord = (record: ImageHostRecord | undefined): ImageHostStatus => {
    if (!deps.isEncryptionAvailable()) return unavailableStatus()
    const provider = asProvider(record?.provider)
    if (hasCipher(record)) {
      return { provider, configured: provider === 'smms', credentialState: provider === 'smms' ? 'ok' : 'missing' }
    }
    if (hasPlaintext(record)) {
      return { provider, configured: false, credentialState: 'migrate-failed' }
    }
    return { provider, configured: false, credentialState: 'missing' }
  }

  const getStatus = async (): Promise<ImageHostStatus> => {
    if (!deps.isEncryptionAvailable()) return unavailableStatus()
    return getStatusFromRecord(await deps.getRecord())
  }

  const saveToken = async (provider: ImageHostProvider, token?: string): Promise<ImageHostStatus> => {
    if (!deps.isEncryptionAvailable()) return unavailableStatus()
    const record = await deps.getRecord()
    if (provider === 'local') {
      await deps.setRecord({
        provider: 'local',
        tokenCipher: hasCipher(record) ? record?.tokenCipher : undefined,
      })
      return { provider: 'local', configured: false, credentialState: 'missing' }
    }
    const nextToken = token ?? (hasCipher(record) ? await decryptCipher(record?.tokenCipher) : undefined)
    if (!nextToken) {
      await deps.setRecord({ provider: 'smms', tokenCipher: record?.tokenCipher })
      return getStatusFromRecord({ provider: 'smms', tokenCipher: record?.tokenCipher })
    }
    try {
      return await persistCipher('smms', nextToken)
    } catch {
      return { provider: 'smms', configured: false, credentialState: 'migrate-failed' }
    }
  }

  const decryptCipher = async (tokenCipher: string | undefined): Promise<string | undefined> => {
    if (!tokenCipher) return undefined
    try {
      return deps.decryptString(Buffer.from(tokenCipher, 'base64'))
    } catch {
      return undefined
    }
  }

  const getPlaintextToken = async (): Promise<string | null> => {
    if (!deps.isEncryptionAvailable()) return null
    const record = await deps.getRecord()
    if (asProvider(record?.provider) !== 'smms') return null
    if (hasPlaintext(record) && !hasCipher(record)) return null
    const token = await decryptCipher(record?.tokenCipher)
    return token && token.length > 0 ? token : null
  }

  return {
    migratePlaintextIfNeeded,
    getStatus,
    saveToken,
    getPlaintextToken,
  }
}

export type SecureTokenStore = ReturnType<typeof createSecureTokenStore>
