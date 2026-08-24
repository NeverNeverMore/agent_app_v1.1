import type { ToolStreamEvent } from '../../shared/tools'
import type { ToolMeta } from '../../shared/tools'
import type { ApprovalStreamEvent } from '../../shared/approvals'
import type { ApiConfig } from '../../shared/types'

export interface ElectronAPI {
  sendMessage: (payload: {
    id: number
    config: ApiConfig
    messages: Array<{ role: string; content: string }>
    projectFolder: string
    conversationId: string
  }) => void
  abortMessage: (payload: { id: number }) => void
  selectFolder: () => Promise<string | null>
  listTools: () => Promise<ToolMeta[]>
  approveTool: (payload: {
    approvalId: string
    argumentsHash: string
  }) => Promise<{ ok: boolean; error?: string }>
  rejectTool: (payload: {
    approvalId: string
  }) => Promise<{ ok: boolean; error?: string }>
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
  onToolEvent: (
    callback: (event: unknown, data: { id: number; event: ToolStreamEvent }) => void
  ) => () => void
  onApprovalEvent: (
    callback: (
      event: unknown,
      data: { id: number; event: ApprovalStreamEvent }
    ) => void
  ) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
