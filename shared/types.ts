export type ApiProtocol = 'openai' | 'anthropic'

export type PermissionMode = 'ask' | 'full'

export interface ApiConfig {
  apiKey: string
  baseUrl: string
  model: string
  protocol: ApiProtocol
}
