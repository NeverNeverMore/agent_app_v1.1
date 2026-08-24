export type ApiProtocol = 'openai' | 'anthropic'

export interface ApiConfig {
  apiKey: string
  baseUrl: string
  model: string
  protocol: ApiProtocol
}
