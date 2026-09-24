import type { ToolCallRecord } from '../../shared/tools'

import type { PermissionMode } from '../../shared/types'
import type { ChatAttachment } from '../../shared/attachments'

export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
  toolCalls?: ToolCallRecord[]
  attachments?: ChatAttachment[]
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  projectFolder: string
  permissionMode: PermissionMode
  enabledSkillIds: string[]
  createdAt: number
  updatedAt: number
  projectId: string
}

export interface Project {
  id: string
  name: string
  folder: string
  sourceFolders: string[]
  pinned: boolean
  createdAt: number
  updatedAt: number
}

export type MainSection = 'chat' | 'tools' | 'skills' | 'mcp' | 'archive'
