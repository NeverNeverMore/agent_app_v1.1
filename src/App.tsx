import { useEffect, useRef, useState } from 'react'
import { Settings } from 'lucide-react'
import { Chat } from './components/Chat'
import { ConfirmDialog } from './components/ConfirmDialog'
import { SettingsDrawer } from './components/Settings'
import { Sidebar } from './components/Sidebar'
import { ToolList } from './components/ToolList'
import { McpManager } from './components/McpManager'
import { SkillManager } from './components/SkillManager'
import { ProjectEditor } from './components/ProjectEditor'
import { useChat } from './hooks/useChat'
import { useApiConfig } from './hooks/useApiConfig'
import { useConversations } from './hooks/useConversations'
import type { Conversation, MainSection, Project } from './types/chat'
import { MODEL_DISPLAY_NAME } from '../shared/config'

const sectionCopy: Record<
  Exclude<MainSection, 'chat' | 'tools'>,
  { title: string; description: string }
> = {
  skills: {
    title: 'Skills',
    description: 'Skills 能力入口已预留，后续可在这里管理可用技能。',
  },
  archive: {
    title: '会话归档',
    description: '功能暂未开放',
  },
  mcp: {
    title: 'MCP',
    description: 'MCP 服务入口已预留，后续可在这里配置和管理服务。',
  },
}

function PlaceholderPanel({
  section,
}: {
  section: Exclude<MainSection, 'chat' | 'tools'>
}) {
  const copy = sectionCopy[section]
  return (
    <div className="placeholder-panel">
      <h2>{copy.title}</h2>
      <p>{copy.description}</p>
    </div>
  )
}

function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<MainSection>('chat')
  const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null)
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null)
  const [isFileDragActive, setIsFileDragActive] = useState(false)
  const fileDragCounterRef = useRef(0)
  const appMainRef = useRef<HTMLElement>(null)
  const { config, updateConfig } = useApiConfig()
  const {
    conversations,
    activeConversation,
    createConversation,
    selectConversation,
    updateConversation,
    renameConversation,
    deleteConversation,
    setProjectFolder,
    setPermissionMode,
    setEnabledSkillIds,
    projects,
    activeProject,
    updateProject,
    toggleProjectPinned,
    deleteProject,
  } = useConversations()
  const { isLoading, taskStatus, sendMessage, retryLastMessage, abortMessage, approveToolCall, rejectToolCall } = useChat({
    config,
    activeConversation,
    sourceFolders: activeProject?.sourceFolders,
    updateConversation,
  })

  const handleNewConversation = (projectId?: string) => {
    abortMessage()
    createConversation(projectId)
    setActiveSection('chat')
  }

  const handleSelectConversation = (conversationId: string) => {
    selectConversation(conversationId)
    setActiveSection('chat')
  }

  const handleDeleteRequest = (conversationId: string) => {
    const conversation = conversations.find((item) => item.id === conversationId)
    if (conversation) setPendingDelete(conversation)
  }

  const handleConfirmDelete = () => {
    if (!pendingDelete) return
    abortMessage()
    deleteConversation(pendingDelete.id)
    setPendingDelete(null)
  }

  const handleSelectFolder = async () => {
    if (!window.electronAPI) return
    const folder = await window.electronAPI.selectFolder()
    if (folder) setProjectFolder(folder)
  }

  const handleOpenFolder = async () => {
    if (!activeConversation.projectFolder || !window.electronAPI) return
    const result = await window.electronAPI.openFolder(activeConversation.projectFolder)
    if (!result.ok) console.error('打开项目目录失败', result.error)
  }

  const handleOpenProjectFolder = async (folder: string) => {
    if (!folder || !window.electronAPI) return
    const result = await window.electronAPI.openFolder(folder)
    if (!result.ok) console.error('打开项目主目录失败', result.error)
  }

  const handleEditActiveProject = () => {
    if (activeProject) setProjectToEdit(activeProject)
  }

  const handleDeleteProject = (project: Project) => {
    if (!window.confirm(`删除项目“${project.name}”及其所有会话？本地文件夹和文件不会被删除。`)) return
    if (activeConversation.projectId === project.id) abortMessage()
    deleteProject(project.id)
    setProjectToEdit(null)
  }

  useEffect(() => {
    const root = appMainRef.current
    if (!root) return
    const isFileDrag = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files')
    const onEnter = (event: DragEvent) => {
      if (!isFileDrag(event)) return
      event.preventDefault()
      fileDragCounterRef.current += 1
      setIsFileDragActive(true)
      console.debug('[drag] enter', { types: Array.from(event.dataTransfer?.types ?? []) })
    }
    const onOver = (event: DragEvent) => {
      if (!isFileDrag(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
      console.debug('[drag] over', { types: Array.from(event.dataTransfer?.types ?? []) })
    }
    const onLeave = (event: DragEvent) => {
      if (!isFileDrag(event)) return
      if (event.relatedTarget instanceof Node && root.contains(event.relatedTarget)) return
      fileDragCounterRef.current = 0
      setIsFileDragActive(false)
      console.debug('[drag] leave')
    }
    const onDrop = (event: DragEvent) => {
      if (!isFileDrag(event)) return
      event.preventDefault()
      fileDragCounterRef.current = 0
      setIsFileDragActive(false)
      console.debug('[drag] drop', { count: event.dataTransfer?.files.length ?? 0 })
    }
    root.addEventListener('dragenter', onEnter, true)
    root.addEventListener('dragover', onOver, true)
    root.addEventListener('dragleave', onLeave, true)
    root.addEventListener('drop', onDrop, true)
    return () => {
      root.removeEventListener('dragenter', onEnter, true)
      root.removeEventListener('dragover', onOver, true)
      root.removeEventListener('dragleave', onLeave, true)
      root.removeEventListener('drop', onDrop, true)
    }
  }, [activeSection])


  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        activeConversationId={activeConversation.id}
        activeSection={activeSection}
        onNewConversation={handleNewConversation}
        onSelectConversation={handleSelectConversation}
        onRenameConversation={renameConversation}
        onDeleteConversation={handleDeleteRequest}
        onSectionChange={setActiveSection}
        projects={projects}
        onToggleProjectPinned={toggleProjectPinned}
        onEditProject={setProjectToEdit}
        onOpenProjectFolder={handleOpenProjectFolder}
        onDeleteProject={handleDeleteProject}
      />

      <div className="app-content">
        <header className="app-header">
          <div className="header-left">

          </div>
          <div className="header-right">
            <span className="model-name">{MODEL_DISPLAY_NAME}</span>
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="icon-button"
              title="设置"
              aria-label="设置"
            >
              <Settings size={20} />
            </button>
          </div>
        </header>

        <main className="app-main" ref={appMainRef}>
          {isFileDragActive && <div className="main-drop-overlay" role="status" aria-live="polite"><span>释放文件以上传</span></div>}
          {activeSection === 'chat' ? (
            <Chat
              messages={activeConversation.messages}
              isLoading={isLoading}
              taskStatus={taskStatus}
              onSend={sendMessage}
              onRetry={retryLastMessage}
              onAbort={abortMessage}
              projectFolder={activeProject?.folder || activeConversation.projectFolder}
              sourceFolders={activeProject?.sourceFolders ?? (activeConversation.projectFolder ? [activeConversation.projectFolder] : [])}
              onSelectFolder={handleSelectFolder}
              onOpenFolder={handleOpenFolder}
              onEditProject={handleEditActiveProject}
              permissionMode={activeConversation.permissionMode}
              onPermissionModeChange={setPermissionMode}
              onApproveTool={approveToolCall}
              onRejectTool={rejectToolCall}
              modelName={config.model}
              isFileDragActive={isFileDragActive}
            />
          ) : activeSection === 'tools' ? (
            <ToolList />
          ) : activeSection === 'mcp' ? (
            <McpManager />
          ) : activeSection === 'skills' ? (
            <SkillManager
              projectFolder={activeProject?.folder || activeConversation.projectFolder}
              enabledSkillIds={activeConversation.enabledSkillIds}
              onEnabledSkillIdsChange={setEnabledSkillIds}
            />
          ) : (
            <PlaceholderPanel section={activeSection} />
          )}
        </main>
      </div>

      <SettingsDrawer
        isOpen={isSettingsOpen}
        config={config}
        onSave={updateConfig}
        onClose={() => setIsSettingsOpen(false)}
      />

      {pendingDelete && (
        <ConfirmDialog
          conversationTitle={pendingDelete.title}
          onCancel={() => setPendingDelete(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
      {projectToEdit && (
        <ProjectEditor
          project={projectToEdit}
          onCancel={() => setProjectToEdit(null)}
          onSave={(patch) => { if (updateProject(projectToEdit.id, patch)) setProjectToEdit(null) }}
          onDelete={() => handleDeleteProject(projectToEdit)}
        />
      )}
    </div>
  )
}

export default App
