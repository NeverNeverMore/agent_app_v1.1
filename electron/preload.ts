import { contextBridge, ipcRenderer, IpcRendererEvent, webUtils } from 'electron'
import type { ToolMeta, ToolStreamEvent } from '../shared/tools'
import type { ApprovalRequest, ApprovalStreamEvent } from '../shared/approvals'
import type { ApiConfig, PermissionMode } from '../shared/types'
import type { TaskStatusEvent } from '../shared/task'
import type { ChatAttachment } from '../shared/attachments'
import type { McpServerConfig, McpServerEvent, McpServerInfo } from '../shared/mcp'
import type { SkillInfo } from '../shared/skills'

export interface ElectronAPI {
  sendMessage: (payload: {
    id: number
    config: ApiConfig
    messages: Array<{ role: string; content: string }>
    projectFolder: string
    permissionMode: PermissionMode
    conversationId: string
    attachments?: ChatAttachment[]
    enabledSkillIds?: string[]
  }) => void
  abortMessage: (payload: { id: number }) => void
  selectFolder: () => Promise<string | null>
  selectAttachments: () => Promise<ChatAttachment[]>
  importAttachments: (filePaths: string[]) => Promise<ChatAttachment[]>
  getFilePath: (file: File) => string
  cleanupAttachments: (attachments: ChatAttachment[]) => Promise<{ ok: boolean }>
  listTools: () => Promise<ToolMeta[]>
  listMcpServers: () => Promise<McpServerInfo[]>
  getMcpConfigJson: () => Promise<string>
  getMcpConfigPath: () => Promise<string>
  saveMcpConfigJson: (raw: string) => Promise<McpServerInfo[]>
  saveMcpServer: (input: Omit<McpServerConfig, 'id'> & { id?: string }) => Promise<McpServerInfo>
  deleteMcpServer: (id: string) => Promise<{ ok: boolean }>
  setMcpServerEnabled: (payload: { id: string; enabled: boolean }) => Promise<McpServerInfo>
  reconnectMcpServer: (id: string) => Promise<McpServerInfo>
  listSkills: (projectFolder: string) => Promise<SkillInfo[]>
  reloadSkills: (projectFolder: string) => Promise<SkillInfo[]>
  getSkillDirectories: (projectFolder: string) => Promise<{ global: string; project: string }>
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
    callback: (event: IpcRendererEvent, data: { id: number; content: string }) => void
  ) => () => void
  onStreamDone: (
    callback: (event: IpcRendererEvent, data: { id: number }) => void
  ) => () => void
  onStreamError: (
    callback: (event: IpcRendererEvent, data: { id: number; error: string }) => void
  ) => () => void
  onToolEvent: (
    callback: (
      event: IpcRendererEvent,
      data: { id: number; event: ToolStreamEvent }
    ) => void
  ) => () => void
  onTaskStatus: (callback: (event: IpcRendererEvent, data: { id: number; event: TaskStatusEvent }) => void) => () => void
  onApprovalEvent: (
    callback: (
      event: IpcRendererEvent,
      data: { id: number; event: ApprovalStreamEvent }
    ) => void
  ) => () => void
  onMcpServerEvent: (callback: (event: IpcRendererEvent, data: McpServerEvent) => void) => () => void
}

const api: ElectronAPI = {
  sendMessage: (payload) => ipcRenderer.send('send-message', payload),
  abortMessage: (payload) => ipcRenderer.send('abort-message', payload),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  selectAttachments: () => ipcRenderer.invoke('select-attachments'),
  importAttachments: (filePaths) => ipcRenderer.invoke('import-attachments', filePaths),
  getFilePath: (file) => webUtils.getPathForFile(file),
  cleanupAttachments: (attachments) => ipcRenderer.invoke('cleanup-attachments', attachments),
  listTools: () => ipcRenderer.invoke('list-tools'),
  listMcpServers: () => ipcRenderer.invoke('list-mcp-servers'),
  getMcpConfigJson: () => ipcRenderer.invoke('get-mcp-config-json'),
  getMcpConfigPath: () => ipcRenderer.invoke('get-mcp-config-path'),
  saveMcpConfigJson: (raw) => ipcRenderer.invoke('save-mcp-config-json', raw),
  saveMcpServer: (input) => ipcRenderer.invoke('save-mcp-server', input),
  deleteMcpServer: (id) => ipcRenderer.invoke('delete-mcp-server', id),
  setMcpServerEnabled: (payload) => ipcRenderer.invoke('set-mcp-server-enabled', payload),
  reconnectMcpServer: (id) => ipcRenderer.invoke('reconnect-mcp-server', id),
  listSkills: (projectFolder) => ipcRenderer.invoke('list-skills', projectFolder),
  reloadSkills: (projectFolder) => ipcRenderer.invoke('reload-skills', projectFolder),
  getSkillDirectories: (projectFolder) => ipcRenderer.invoke('get-skill-directories', projectFolder),
  approveTool: (payload) => ipcRenderer.invoke('approve-tool', payload),
  rejectTool: (payload) => ipcRenderer.invoke('reject-tool', payload),
  listPendingApprovals: () => ipcRenderer.invoke('list-pending-approvals'),
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
  onToolEvent: (callback) => {
    const handler = (
      _event: IpcRendererEvent,
      data: { id: number; event: ToolStreamEvent }
    ) => callback(_event, data)
    ipcRenderer.on('tool-event', handler)
    return () => ipcRenderer.removeListener('tool-event', handler)
  },
  onTaskStatus: (callback) => {
    const handler = (_event: IpcRendererEvent, data: { id: number; event: TaskStatusEvent }) => callback(_event, data)
    ipcRenderer.on('task-status', handler)
    return () => ipcRenderer.removeListener('task-status', handler)
  },
  onApprovalEvent: (callback) => {
    const handler = (
      _event: IpcRendererEvent,
      data: { id: number; event: ApprovalStreamEvent }
    ) => callback(_event, data)
    ipcRenderer.on('approval-event', handler)
    return () => ipcRenderer.removeListener('approval-event', handler)
  },
  onMcpServerEvent: (callback) => {
    const handler = (_event: IpcRendererEvent, data: McpServerEvent) => callback(_event, data)
    ipcRenderer.on('mcp-server-event', handler)
    return () => ipcRenderer.removeListener('mcp-server-event', handler)
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
