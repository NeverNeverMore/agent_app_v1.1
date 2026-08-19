import { useState } from 'react'
import {
  Folder,
  MessageSquarePlus,
  Pencil,
  Plug,
  Sparkles,
  Trash2,
  Wrench,
} from 'lucide-react'
import { APP_NAME } from '../../shared/config'
import type { Conversation, MainSection } from '../types/chat'

interface SidebarProps {
  conversations: Conversation[]
  activeConversationId: string
  activeSection: MainSection
  onNewConversation: () => void
  onSelectConversation: (conversationId: string) => void
  onRenameConversation: (conversationId: string, title: string) => void
  onDeleteConversation: (conversationId: string) => void
  onSectionChange: (section: MainSection) => void
}

const sectionItems = [
  { section: 'tools', label: '工具', icon: <Wrench size={18} /> },
  { section: 'skills', label: 'Skills', icon: <Sparkles size={18} /> },
  { section: 'mcp', label: 'MCP', icon: <Plug size={18} /> },
] as const

function getFolderName(path: string) {
  const normalized = path.replace(/[\\/]+$/, '')
  return normalized.split(/[\\/]/).pop() || path
}

function formatUpdatedAt(timestamp: number) {
  const date = new Date(timestamp)
  const today = new Date()
  const isToday = date.toDateString() === today.toDateString()
  return isToday
    ? date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

export function Sidebar({
  conversations,
  activeConversationId,
  activeSection,
  onNewConversation,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation,
  onSectionChange,
}: SidebarProps) {
  const [editingConversationId, setEditingConversationId] = useState<string | null>(
    null
  )
  const [editingTitle, setEditingTitle] = useState('')

  const startEditing = (conversation: Conversation) => {
    setEditingConversationId(conversation.id)
    setEditingTitle(conversation.title)
  }

  const finishEditing = () => {
    if (!editingConversationId) return
    const title = editingTitle.trim()
    if (title) onRenameConversation(editingConversationId, title)
    setEditingConversationId(null)
    setEditingTitle('')
  }

  const cancelEditing = () => {
    setEditingConversationId(null)
    setEditingTitle('')
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">{APP_NAME}</div>

      <nav className="sidebar-nav" aria-label="主菜单">
        <button type="button" className="nav-item" onClick={onNewConversation}>
          <MessageSquarePlus size={18} />
          <span>新对话</span>
        </button>
        {sectionItems.map((item) => (
          <button
            key={item.section}
            type="button"
            className={`nav-item ${activeSection === item.section ? 'active' : ''}`}
            onClick={() => onSectionChange(item.section)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <section className="sidebar-history" aria-label="会话历史">
        <div className="history-header">
          <span>会话历史</span>
          <span className="history-count">{conversations.length}</span>
        </div>
        <div className="conversation-list">
          {conversations.map((conversation) => {
            const isActive =
              activeSection === 'chat' && conversation.id === activeConversationId
            const isEditing = editingConversationId === conversation.id

            return (
              <div
                key={conversation.id}
                className={`conversation-item ${isActive ? 'active' : ''}`}
              >
                {isEditing ? (
                  <form
                    className="conversation-edit-form"
                    onSubmit={(event) => {
                      event.preventDefault()
                      finishEditing()
                    }}
                  >
                    <input
                      className="conversation-edit-input"
                      value={editingTitle}
                      onChange={(event) => setEditingTitle(event.target.value)}
                      onBlur={finishEditing}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') cancelEditing()
                      }}
                      aria-label="会话名称"
                      autoFocus
                    />
                  </form>
                ) : (
                  <button
                    type="button"
                    className="conversation-main"
                    onClick={() => onSelectConversation(conversation.id)}
                    onDoubleClick={() => startEditing(conversation)}
                    title={conversation.title}
                  >
                    <span className="conversation-title">{conversation.title}</span>
                    <span className="conversation-meta">
                      {formatUpdatedAt(conversation.updatedAt)}
                    </span>
                    {conversation.projectFolder && (
                      <span className="conversation-folder">
                        <Folder size={12} />
                        {getFolderName(conversation.projectFolder)}
                      </span>
                    )}
                  </button>
                )}
                {!isEditing && (
                  <div className="conversation-actions">
                    <button
                      type="button"
                      className="edit-button"
                      aria-label={`修改会话名称 ${conversation.title}`}
                      title="修改名称"
                      onClick={() => startEditing(conversation)}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      className="delete-button"
                      aria-label={`删除会话 ${conversation.title}`}
                      title="删除会话"
                      onClick={() => onDeleteConversation(conversation.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </aside>
  )
}