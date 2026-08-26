import type { ToolStreamEvent } from '../../shared/tools'
import type { ToolMeta } from '../../shared/tools'
import type { ApprovalRequest, ApprovalStreamEvent } from '../../shared/approvals'
import type { ApiConfig, PermissionMode } from '../../shared/types'
import type { TaskStatusEvent } from '../../shared/task'
import type { ChatAttachment } from '../../shared/attachments'

export interface ElectronAPI {
  sendMessage: (payload: {
    id: number
    config: ApiConfig
    messages: Array<{ role: string; content: string }>
    projectFolder: string
    permissionMode: PermissionMode
    conversationId: string
    attachments?: ChatAttachment[]
  }) => void
  abortMessage: (payload: { id: number }) => void
  selectFolder: () => Promise<string | null>
  selectAttachments: () => Promise<ChatAttachment[]>
  importAttachments: (filePaths: string[]) => Promise<ChatAttachment[]>
  getFilePath: (file: File) => string
  cleanupAttachments: (attachments: ChatAttachment[]) => Promise<{ ok: boolean }>
  listTools: () => Promise<ToolMeta[]>
  approveTool: (payload: {
    approvalId: string
    argumentsHash: string
  }) => Promise<{ ok: boolean; error?: string }>
  rejectTool: (payload: {
    approvalId: string
  }) => Promise<{ ok: boolean; error?: string }>
  listPendingApprovals: () => Promise<ApprovalRequest[]>
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
  onTaskStatus: (callback: (event: unknown, data: { id: number; event: TaskStatusEvent }) => void) => () => void
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
