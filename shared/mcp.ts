export interface McpServerConfig {
  id: string
  name: string
  command: string
  args: string[]
  env: Record<string, string>
  enabled: boolean
}

export type McpServerStatus = 'disabled' | 'connecting' | 'connected' | 'disconnected' | 'error'

export interface McpServerInfo extends McpServerConfig {
  status: McpServerStatus
  error?: string
  toolCount: number
}

export type McpServerEvent =
  | { type: 'updated'; server: McpServerInfo }
  | { type: 'removed'; serverId: string }
