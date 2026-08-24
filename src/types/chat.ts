import type { ToolCallRecord } from '../../shared/tools'

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
  createdAt: number
  updatedAt: number
}

export type MainSection = 'chat' | 'tools' | 'skills' | 'mcp'
