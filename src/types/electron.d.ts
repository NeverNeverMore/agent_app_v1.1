import type { ApiConfig } from '../../shared/types'

export interface ElectronAPI {
  sendMessage: (payload: {
    id: number
    config: ApiConfig
    messages: Array<{ role: string; content: string }>
  }) => void
  abortMessage: (payload: { id: number }) => void
  selectFolder: () => Promise<string | null>
  testApi: (config: ApiConfig) => Promise<{
    ok: boolean
    error?: string
    models?: number
  }>
  onStreamChunk: (
    callback: (event: unknown, data: { id: number; content: string }) => void
  ) => () => void
  onStreamDone: (
    callback: (event: unknown, data: { id: number }) => void
  ) => () => void
  onStreamError: (
    callback: (event: unknown, data: { id: number; error: string }) => void
  ) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
