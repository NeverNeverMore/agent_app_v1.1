import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Conversation, Project } from '../types/chat'
import type { PermissionMode } from '../../shared/types'

const STORAGE_KEY = 'chat-conversations-state'

interface ConversationsState {
  conversations: Conversation[]
  activeConversationId: string
  projects: Project[]
  lastSelectedProjectId: string
  lastSelectedProjectFolder: string
}

type ConversationUpdater = (conversation: Conversation) => Conversation

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function buildConversation(projectFolder = '', projectId = ''): Conversation {
  const now = Date.now()
  return { id: createId(), title: '新对话', messages: [], projectFolder, permissionMode: 'ask', enabledSkillIds: [], createdAt: now, updatedAt: now, projectId }
}

function buildProject(name: string, folder: string): Project {
  const now = Date.now()
  return { id: createId(), name, folder, sourceFolders: folder ? [folder] : [], pinned: false, createdAt: now, updatedAt: now }
}

function normalizeFolder(folder: string) {
  const value = folder.trim().replace(/\\/g, '/').replace(/\/+$/, '')
  return value.length > 3 ? value.toLowerCase() : value.toLowerCase()
}

function folderName(folder: string) {
  const normalized = folder.replace(/[\\/]+$/, '')
  return normalized.split(/[\\/]/).pop() || '未分类'
}

function hasUserMessage(conversation: Conversation) {
  return conversation.messages.some((message) => message.role === 'user')
}

function isConversation(value: unknown): value is Conversation {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Conversation
  return typeof candidate.id === 'string' && typeof candidate.title === 'string' && Array.isArray(candidate.messages) && typeof candidate.createdAt === 'number' && typeof candidate.updatedAt === 'number'
}

function normalizeMessages(conversation: Conversation) {
  return conversation.messages.map((message) => message.role === 'assistant' && message.toolCalls
    ? { ...message, toolCalls: message.toolCalls.map((call) => call.approval?.status === 'pending' ? { ...call, approval: { ...call.approval, status: 'cancelled' as const } } : call) }
    : message)
}

function loadState(): ConversationsState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<ConversationsState>
      const conversations = Array.isArray(parsed.conversations) ? parsed.conversations.filter(isConversation).map((conversation) => ({
        ...conversation,
        messages: normalizeMessages(conversation),
        projectFolder: typeof conversation.projectFolder === 'string' ? conversation.projectFolder : '',
        projectId: typeof conversation.projectId === 'string' ? conversation.projectId : '',
        permissionMode: (conversation.permissionMode === 'full' ? 'full' : 'ask') as PermissionMode,
        enabledSkillIds: Array.isArray(conversation.enabledSkillIds) ? conversation.enabledSkillIds.filter((id): id is string => typeof id === 'string') : [],
      })) : []
      const projects = Array.isArray(parsed.projects) ? parsed.projects.filter((project): project is Project => Boolean(project && typeof project === 'object' && typeof (project as Project).id === 'string')).map((project) => ({
        ...project,
        name: typeof project.name === 'string' ? project.name : folderName(typeof project.folder === 'string' ? project.folder : ''),
        folder: typeof project.folder === 'string' ? project.folder : '',
        sourceFolders: Array.isArray(project.sourceFolders)
          ? [...new Set(project.sourceFolders.filter((folder): folder is string => typeof folder === 'string' && Boolean(folder.trim())).map((folder) => folder.trim()))]
          : (typeof project.folder === 'string' && project.folder ? [project.folder] : []),
        pinned: Boolean(project.pinned === true),
        createdAt: typeof project.createdAt === 'number' ? project.createdAt : Date.now(),
        updatedAt: typeof project.updatedAt === 'number' ? project.updatedAt : Date.now(),
      })) : []
      const formalConversations = conversations.filter(hasUserMessage)
      const projectByFolder = new Map(projects.filter((project) => project.folder).map((project) => [normalizeFolder(project.folder), project]))
      let nextProjects = projects.filter((project) => project.folder)
      const uncategorized = projects.find((project) => !project.folder) ?? buildProject('未分类', '')
      const normalizedConversations = conversations.map((conversation) => {
        if (!hasUserMessage(conversation)) return { ...conversation, projectId: '' }
        const existing = conversation.projectFolder ? projectByFolder.get(normalizeFolder(conversation.projectFolder)) : undefined
        const project = existing ?? (conversation.projectId ? projects.find((item) => item.id === conversation.projectId) : undefined) ?? uncategorized
        if (!nextProjects.some((item) => item.id === project.id)) nextProjects = [...nextProjects, project]
        return { ...conversation, projectId: project.id }
      })
      if (formalConversations.some((conversation) => !conversation.projectFolder) && !nextProjects.some((project) => project.id === uncategorized.id)) nextProjects = [...nextProjects, uncategorized]
      const activeConversationId = typeof parsed.activeConversationId === 'string' && normalizedConversations.some((conversation) => conversation.id === parsed.activeConversationId) ? parsed.activeConversationId : normalizedConversations[0]?.id
      const active = normalizedConversations.find((conversation) => conversation.id === activeConversationId)
      const lastSelectedProjectId = active?.projectId || (typeof parsed.lastSelectedProjectId === 'string' && nextProjects.some((project) => project.id === parsed.lastSelectedProjectId) ? parsed.lastSelectedProjectId : '')
      return { conversations: normalizedConversations.length ? normalizedConversations : [buildConversation(typeof parsed.lastSelectedProjectFolder === 'string' ? parsed.lastSelectedProjectFolder : '')], activeConversationId: activeConversationId || normalizedConversations[0]?.id || '', projects: nextProjects, lastSelectedProjectId, lastSelectedProjectFolder: typeof parsed.lastSelectedProjectFolder === 'string' ? parsed.lastSelectedProjectFolder : active?.projectFolder || '' }
    }
  } catch {}
  const conversation = buildConversation()
  return { conversations: [conversation], activeConversationId: conversation.id, projects: [], lastSelectedProjectId: '', lastSelectedProjectFolder: '' }
}

export function useConversations() {
  const [state, setState] = useState<ConversationsState>(loadState)

  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch {} }, [state])

  useEffect(() => {
    const referencedIds = [...new Set(state.conversations.flatMap((conversation) =>
      conversation.messages.flatMap((message) => (message.attachments ?? []).flatMap((attachment) => attachment.previewId ? [attachment.previewId] : []))
    ))]
    void window.electronAPI?.syncImagePreviewReferences(referencedIds).catch(() => undefined)
  }, [state])

  const conversations = useMemo(() => state.conversations.filter(hasUserMessage).sort((a, b) => b.updatedAt - a.updatedAt), [state.conversations])
  const projects = useMemo(() => [...state.projects].filter((project) => state.conversations.some((conversation) => conversation.projectId === project.id && hasUserMessage(conversation))).sort((a, b) => {
    const latest = (project: Project) => Math.max(...state.conversations.filter((item) => item.projectId === project.id).map((item) => item.updatedAt), project.updatedAt)
    return Number(b.pinned) - Number(a.pinned) || latest(b) - latest(a)
  }), [state.projects, state.conversations])
  const activeConversation = state.conversations.find((conversation) => conversation.id === state.activeConversationId) ?? state.conversations[0]
  const activeProject = state.projects.find((project) => project.id === activeConversation.projectId)

  const createConversation = useCallback((projectId?: string) => {
    setState((prev) => {
      const projectFolder = projectId ? prev.projects.find((project) => project.id === projectId)?.folder || '' : prev.lastSelectedProjectFolder
      const conversation = buildConversation(projectFolder, projectId || '')
      return { ...prev, conversations: [...prev.conversations.filter(hasUserMessage), conversation], activeConversationId: conversation.id, lastSelectedProjectId: projectId || '', lastSelectedProjectFolder: projectFolder }
    })
  }, [])

  const selectConversation = useCallback((conversationId: string) => setState((prev) => {
    const conversation = prev.conversations.find((item) => item.id === conversationId)
    return conversation ? { ...prev, activeConversationId: conversationId, lastSelectedProjectId: conversation.projectId, lastSelectedProjectFolder: conversation.projectFolder } : prev
  }), [])

  const updateConversation = useCallback((conversationId: string, updater: ConversationUpdater) => {
    setState((prev) => {
      const current = prev.conversations.find((item) => item.id === conversationId)
      if (!current) return prev
      const updated = { ...updater(current), id: current.id, updatedAt: Date.now() }
      let nextProjects = prev.projects
      if (!hasUserMessage(current) && hasUserMessage(updated)) {
        const existing = updated.projectFolder ? nextProjects.find((project) => normalizeFolder(project.folder) === normalizeFolder(updated.projectFolder)) : undefined
        const project = existing ?? (updated.projectFolder ? buildProject(folderName(updated.projectFolder), updated.projectFolder) : (nextProjects.find((item) => !item.folder) ?? buildProject('未分类', '')))
        if (!nextProjects.some((item) => item.id === project.id)) nextProjects = [...nextProjects, project]
        updated.projectId = project.id
      }
      return { ...prev, conversations: prev.conversations.map((item) => item.id === conversationId ? updated : item), projects: nextProjects, lastSelectedProjectId: updated.projectId || prev.lastSelectedProjectId, lastSelectedProjectFolder: updated.projectFolder || prev.lastSelectedProjectFolder }
    })
  }, [])

  const renameConversation = useCallback((conversationId: string, title: string) => { const trimmed = title.trim(); if (trimmed) updateConversation(conversationId, (conversation) => ({ ...conversation, title: trimmed })) }, [updateConversation])

  const deleteConversation = useCallback((conversationId: string) => setState((prev) => {
    const remaining = prev.conversations.filter((conversation) => conversation.id !== conversationId)
    const draft = buildConversation(prev.lastSelectedProjectFolder)
    const activeConversationId = prev.activeConversationId === conversationId ? draft.id : prev.activeConversationId
    return { ...prev, conversations: [...remaining.filter(hasUserMessage), ...(remaining.some((item) => !hasUserMessage(item)) ? remaining.filter((item) => !hasUserMessage(item)).slice(0, 1) : [draft])], activeConversationId }
  }), [])

  const renameProject = useCallback((projectId: string, name: string) => { const trimmed = name.trim(); if (trimmed) setState((prev) => ({ ...prev, projects: prev.projects.map((project) => project.id === projectId ? { ...project, name: trimmed, updatedAt: Date.now() } : project) })) }, [])
  const updateProject = useCallback((projectId: string, patch: Pick<Project, 'name' | 'folder' | 'sourceFolders'>) => {
    const name = patch.name.trim()
    if (!name || !patch.folder || !patch.sourceFolders.includes(patch.folder)) return false
    const sourceFolders = [...new Set(patch.sourceFolders.map((folder) => folder.trim()).filter(Boolean))]
    if (!sourceFolders.includes(patch.folder)) return false
    setState((prev) => ({
      ...prev,
      projects: prev.projects.map((project) => project.id === projectId ? { ...project, name, folder: patch.folder, sourceFolders, updatedAt: Date.now() } : project),
      conversations: prev.conversations.map((conversation) => conversation.projectId === projectId ? { ...conversation, projectFolder: patch.folder } : conversation),
    }))
    return true
  }, [])
  const toggleProjectPinned = useCallback((projectId: string) => setState((prev) => ({ ...prev, projects: prev.projects.map((project) => project.id === projectId ? { ...project, pinned: !project.pinned, updatedAt: Date.now() } : project) })), [])
  const deleteProject = useCallback((projectId: string) => setState((prev) => {
    const removedConversationIds = new Set(prev.conversations.filter((conversation) => conversation.projectId === projectId).map((conversation) => conversation.id))
    const conversations = prev.conversations.filter((conversation) => !removedConversationIds.has(conversation.id))
    const project = prev.projects.find((item) => item.id === projectId)
    const activeConversation = prev.conversations.find((conversation) => conversation.id === prev.activeConversationId)
    const currentWasRemoved = removedConversationIds.has(prev.activeConversationId) || Boolean(project && activeConversation && !hasUserMessage(activeConversation) && normalizeFolder(activeConversation.projectFolder) === normalizeFolder(project.folder))
    const draft = currentWasRemoved ? buildConversation('') : undefined
    if (draft) conversations.push(draft)
    return { ...prev, conversations, activeConversationId: draft?.id ?? prev.activeConversationId, projects: prev.projects.filter((project) => project.id !== projectId), lastSelectedProjectId: prev.lastSelectedProjectId === projectId ? '' : prev.lastSelectedProjectId, lastSelectedProjectFolder: draft ? '' : prev.lastSelectedProjectFolder }
  }), [])
  const moveConversation = useCallback((conversationId: string, projectId: string) => setState((prev) => ({ ...prev, conversations: prev.conversations.map((item) => item.id === conversationId ? { ...item, projectId, projectFolder: prev.projects.find((project) => project.id === projectId)?.folder || '', updatedAt: Date.now() } : item), lastSelectedProjectId: projectId })), [])
  const setProjectFolder = useCallback((projectFolder: string) => setState((prev) => ({ ...prev, conversations: prev.conversations.map((conversation) => conversation.id === prev.activeConversationId ? { ...conversation, projectFolder, ...(hasUserMessage(conversation) ? {} : { projectId: '' }), updatedAt: Date.now() } : conversation), lastSelectedProjectFolder: projectFolder })), [])
  const setPermissionMode = useCallback((permissionMode: PermissionMode) => updateConversation(activeConversation.id, (conversation) => ({ ...conversation, permissionMode })), [activeConversation.id, updateConversation])
  const setEnabledSkillIds = useCallback((enabledSkillIds: string[]) => updateConversation(activeConversation.id, (conversation) => ({ ...conversation, enabledSkillIds })), [activeConversation.id, updateConversation])

  return { conversations, activeConversation, activeProject, createConversation, selectConversation, updateConversation, renameConversation, deleteConversation, setProjectFolder, projects, renameProject, updateProject, toggleProjectPinned, deleteProject, moveConversation, setPermissionMode, setEnabledSkillIds }
}
