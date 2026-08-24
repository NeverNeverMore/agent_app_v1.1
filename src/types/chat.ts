import type { ToolCallRecord } from '../../shared/tools'

import type { PermissionMode } from '../../shared/types'

export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
  toolCalls?: ToolCallRecord[]
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  projectFolder: string
  permissionMode: PermissionMode
  createdAt: number
  updatedAt: number
}

export type MainSection = 'chat' | 'tools' | 'skills' | 'mcp'
