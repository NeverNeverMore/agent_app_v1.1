import type { ApiConfig } from './types'

export const API_BASE_URL = 'https://api.kimi.com/coding/v1'

export const DEFAULT_MODEL = 'kimi-code-plan'

export const MODEL_DISPLAY_NAME = 'LINGQI'

export const APP_NAME = '四方上行科技有限公司'

export const DEFAULT_API_CONFIG: ApiConfig = {
  apiKey: '',
  baseUrl: API_BASE_URL,
  model: DEFAULT_MODEL,
  protocol: 'openai',
}

export const MODEL_SUGGESTIONS = [
  'kimi-code-plan',
  'kimi-k2-0711',
  'moonshot-v1-8k',
  'moonshot-v1-32k',
  'moonshot-v1-128k',
]
