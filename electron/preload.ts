import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type { ApiConfig } from '../shared/types'

export interface ElectronAPI {
  sendMessage: (payload: {
    id: number
    config: ApiConfig
    messages: Array<{ role: string; content: string }>
  }) => void
  abortMessage: (payload: { id: number }) => void
  testApi: (config: ApiConfig) => Promise<{
    ok: boolean
    error?: string
    models?: number
  }>
  onStreamChunk: (
    callback: (event: IpcRendererEvent, data: { id: number; content: string }) => void
  ) => () => void
  onStreamDone: (
    callback: (event: IpcRendererEvent, data: { id: number }) => void
  ) => () => void
  onStreamError: (
    callback: (event: IpcRendererEvent, data: { id: number; error: string }) => void
  ) => () => void
}

const api: ElectronAPI = {
  sendMessage: (payload) => ipcRenderer.send('send-message', payload),
  abortMessage: (payload) => ipcRenderer.send('abort-message', payload),
  testApi: (config) => ipcRenderer.invoke('test-api', config),
  onStreamChunk: (callback) => {
    const handler = (_event: IpcRendererEvent, data: { id: number; content: string }) =>
      callback(_event, data)
    ipcRenderer.on('stream-chunk', handler)
    return () => ipcRenderer.removeListener('stream-chunk', handler)
  },
  onStreamDone: (callback) => {
    const handler = (_event: IpcRendererEvent, data: { id: number }) => callback(_event, data)
    ipcRenderer.on('stream-done', handler)
    return () => ipcRenderer.removeListener('stream-done', handler)
  },
  onStreamError: (callback) => {
    const handler = (
      _event: IpcRendererEvent,
      data: { id: number; error: string }
    ) => callback(_event, data)
    ipcRenderer.on('stream-error', handler)
    return () => ipcRenderer.removeListener('stream-error', handler)
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
