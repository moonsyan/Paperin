export type ImageHostProvider = 'local' | 'smms'
export type ImageHostCredentialState = 'ok' | 'missing' | 'unavailable' | 'migrate-failed'

export interface ImageHostStatus {
  provider: ImageHostProvider
  configured: boolean
  credentialState: ImageHostCredentialState
}
