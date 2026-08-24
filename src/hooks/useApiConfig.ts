import { useState, useCallback } from 'react'
import type { ApiConfig } from '../../shared/types'
import { DEFAULT_API_CONFIG } from '../../shared/config'

const STORAGE_KEY = 'api-config'

function loadConfig(): ApiConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<ApiConfig>
      return {
        ...DEFAULT_API_CONFIG,
        ...parsed,
        protocol: parsed.protocol === 'anthropic' ? 'anthropic' : 'openai',
      }
    }
  } catch {}
  return DEFAULT_API_CONFIG
}

function saveConfig(config: ApiConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {}
}

export function useApiConfig() {
  const [config, setConfig] = useState<ApiConfig>(loadConfig)

  const updateConfig = useCallback((patch: Partial<ApiConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch }
      saveConfig(next)
      return next
    })
  }, [])

  return { config, updateConfig }
}
