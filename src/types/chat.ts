export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
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