import { useEffect, useRef, useState } from 'react'
import { Archive, ChevronDown, ChevronRight, Ellipsis, ExternalLink, Folder, MessageSquarePlus, Pencil, Pin, Plug, Sparkles, Trash2, Wrench } from 'lucide-react'
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
  onToggleProjectPinned: (id: string) => void
  onEditProject: (project: Project) => void
  onOpenProjectFolder: (folder: string) => void
  onDeleteProject: (project: Project) => void
  onSectionChange: (section: MainSection) => void
}

const sectionItems = [
  { section: 'tools', label: '工具', icon: <Wrench size={18} /> },
  { section: 'skills', label: 'Skills', icon: <Sparkles size={18} /> },
  { section: 'mcp', label: 'MCP', icon: <Plug size={18} /> },
  { section: 'archive', label: '会话归档', icon: <Archive size={18} /> },
] as const

function formatUpdatedAt(timestamp: number) {
  const date = new Date(timestamp)
  const today = new Date()
  return date.toDateString() === today.toDateString() ? date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

export function Sidebar({ conversations, activeConversationId, activeSection, projects, onNewConversation, onSelectConversation, onRenameConversation, onDeleteConversation, onToggleProjectPinned, onEditProject, onOpenProjectFolder, onDeleteProject, onSectionChange }: SidebarProps) {
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({})
  const [openProjectMenuId, setOpenProjectMenuId] = useState<string | null>(null)
  const [projectMenuPosition, setProjectMenuPosition] = useState<{ left: number; top: number } | null>(null)
  const projectMenuRef = useRef<HTMLDivElement>(null)
  const finishEditing = () => { if (editingConversationId && editingTitle.trim()) onRenameConversation(editingConversationId, editingTitle.trim()); setEditingConversationId(null); setEditingTitle('') }

  useEffect(() => {
    if (!openProjectMenuId) return
    const onPointer = (event: MouseEvent) => { if (!projectMenuRef.current?.contains(event.target as Node)) setOpenProjectMenuId(null) }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpenProjectMenuId(null) }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onPointer); document.removeEventListener('keydown', onKey) }
  }, [openProjectMenuId])

  useEffect(() => {
    if (!openProjectMenuId || !projectMenuRef.current) {
      setProjectMenuPosition(null)
      return
    }
    const updatePosition = () => {
      const rect = projectMenuRef.current?.getBoundingClientRect()
      if (rect) setProjectMenuPosition({ left: rect.right + 6, top: rect.top })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [openProjectMenuId])

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
            <div className="project-header"><button type="button" className="project-toggle" onClick={() => setExpandedProjects((value) => ({ ...value, [project.id]: !expanded }))}><span>{expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span><Folder size={15} /><span className="project-name" title={project.folder || project.name}>{project.name}</span></button><div className="project-menu-anchor" ref={openProjectMenuId === project.id ? projectMenuRef : undefined}>
                <button type="button" className="project-rename" title="项目操作" aria-label={`项目操作 ${project.name}`} aria-haspopup="menu" aria-expanded={openProjectMenuId === project.id} onClick={() => setOpenProjectMenuId((current) => current === project.id ? null : project.id)}><Ellipsis size={17} /></button>
                {openProjectMenuId === project.id && <div className="project-context-menu" role="menu" style={projectMenuPosition ? { left: projectMenuPosition.left, top: projectMenuPosition.top } : undefined}>
                  <button type="button" role="menuitem" onClick={() => { onNewConversation(project.id); setOpenProjectMenuId(null) }}><MessageSquarePlus size={15} />新对话</button>
                  <button type="button" role="menuitem" onClick={() => { onToggleProjectPinned(project.id); setOpenProjectMenuId(null) }}><Pin size={15} />{project.pinned ? '取消置顶' : '置顶'}</button>
                  <button type="button" role="menuitem" onClick={() => { onEditProject(project); setOpenProjectMenuId(null) }}><Pencil size={15} />编辑</button>
                  <button type="button" role="menuitem" disabled={!project.folder} onClick={() => { onOpenProjectFolder(project.folder); setOpenProjectMenuId(null) }}><ExternalLink size={15} />打开所在文件夹</button>
                  <button type="button" role="menuitem" disabled className="project-archive-disabled"><Archive size={15} />会话归档（暂未开放）</button>
                  <div className="project-menu-separator" />
                  <button type="button" role="menuitem" className="project-menu-danger" onClick={() => { onDeleteProject(project); setOpenProjectMenuId(null) }}><Trash2 size={15} />删除项目</button>
                </div>}
              </div>
            </div>
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
