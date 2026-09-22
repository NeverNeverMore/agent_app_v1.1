import { useState } from 'react'
import { ChevronDown, ChevronRight, Folder, MessageSquarePlus, Pencil, Plug, Sparkles, Trash2, Wrench } from 'lucide-react'
import { APP_NAME } from '../../shared/config'
import type { Conversation, MainSection, Project } from '../types/chat'

interface SidebarProps {
  conversations: Conversation[]
  activeConversationId: string
  activeSection: MainSection
  projects: Project[]
  onNewConversation: (projectId?: string) => void
  onSelectConversation: (id: string) => void
  onRenameConversation: (id: string, title: string) => void
  onDeleteConversation: (id: string) => void
  onRenameProject: (id: string, name: string) => void
  onSectionChange: (section: MainSection) => void
}

const sectionItems = [
  { section: 'tools', label: '工具', icon: <Wrench size={18} /> },
  { section: 'skills', label: 'Skills', icon: <Sparkles size={18} /> },
  { section: 'mcp', label: 'MCP', icon: <Plug size={18} /> },
] as const

function formatUpdatedAt(timestamp: number) {
  const date = new Date(timestamp)
  const today = new Date()
  return date.toDateString() === today.toDateString() ? date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

export function Sidebar({ conversations, activeConversationId, activeSection, projects, onNewConversation, onSelectConversation, onRenameConversation, onDeleteConversation, onRenameProject, onSectionChange }: SidebarProps) {
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({})
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [editingProjectName, setEditingProjectName] = useState('')
  const finishEditing = () => { if (editingConversationId && editingTitle.trim()) onRenameConversation(editingConversationId, editingTitle.trim()); setEditingConversationId(null); setEditingTitle('') }
  const finishProjectEditing = () => {
    if (editingProjectId && editingProjectName.trim()) onRenameProject(editingProjectId, editingProjectName.trim())
    setEditingProjectId(null)
    setEditingProjectName('')
  }

  return <aside className="sidebar">
    <div className="sidebar-brand">{APP_NAME}</div>
    <nav className="sidebar-nav" aria-label="主菜单">
      <button type="button" className="nav-item" onClick={() => onNewConversation()}><MessageSquarePlus size={18} /><span>新对话</span></button>
      {sectionItems.map((item) => <button key={item.section} type="button" className={`nav-item ${activeSection === item.section ? 'active' : ''}`} onClick={() => onSectionChange(item.section)}>{item.icon}<span>{item.label}</span></button>)}
    </nav>
    <section className="sidebar-history" aria-label="会话历史">
      <div className="history-header"><span>会话历史</span></div>
      <div className="conversation-list">
        {projects.map((project) => {
          const items = conversations.filter((conversation) => conversation.projectId === project.id)
          const expanded = expandedProjects[project.id] !== false
          return <div className="project-group" key={project.id}>
            <div className="project-header">{editingProjectId === project.id ? <div className="project-toggle project-editing"><ChevronDown size={15} /><Folder size={15} /><input className="project-name-input" autoFocus value={editingProjectName} onChange={(event) => setEditingProjectName(event.target.value)} onBlur={finishProjectEditing} onKeyDown={(event) => { if (event.key === 'Enter') finishProjectEditing(); if (event.key === 'Escape') { setEditingProjectId(null); setEditingProjectName('') } }} /></div> : <button type="button" className="project-toggle" onClick={() => setExpandedProjects((value) => ({ ...value, [project.id]: !expanded }))}><span>{expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span><Folder size={15} /><span className="project-name" title={project.folder || project.name}>{project.name}</span></button>}{editingProjectId !== project.id && <button type="button" className="project-rename" title="重命名项目" onClick={() => { setEditingProjectId(project.id); setEditingProjectName(project.name) }}><Pencil size={13} /></button>}</div>
            {expanded && items.map((conversation) => {
              const isActive = activeSection === 'chat' && conversation.id === activeConversationId
              const editing = editingConversationId === conversation.id
              return <div key={conversation.id} className={`conversation-item ${isActive ? 'active' : ''}`}>
                {editing ? <form className="conversation-edit-form" onSubmit={(event) => { event.preventDefault(); finishEditing() }}><input className="conversation-edit-input" autoFocus value={editingTitle} onChange={(event) => setEditingTitle(event.target.value)} onBlur={finishEditing} onKeyDown={(event) => { if (event.key === 'Escape') { setEditingConversationId(null); setEditingTitle('') } }} /></form> : <button type="button" className="conversation-main" onClick={() => onSelectConversation(conversation.id)} onDoubleClick={() => { setEditingConversationId(conversation.id); setEditingTitle(conversation.title) }} title={conversation.title}><span className="conversation-title">{conversation.title}</span><span className="conversation-meta">{formatUpdatedAt(conversation.updatedAt)}</span></button>}
                {!editing && <div className="conversation-actions"><button type="button" className="edit-button" title="修改名称" onClick={() => { setEditingConversationId(conversation.id); setEditingTitle(conversation.title) }}><Pencil size={14} /></button><button type="button" className="delete-button" title="删除会话" onClick={() => onDeleteConversation(conversation.id)}><Trash2 size={15} /></button></div>}
              </div>
            })}
          </div>
        })}
      </div>
    </section>
  </aside>
}
