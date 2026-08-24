import { useState } from 'react'
import { Settings } from 'lucide-react'
import { Chat } from './components/Chat'
import { ConfirmDialog } from './components/ConfirmDialog'
import { SettingsDrawer } from './components/Settings'
import { Sidebar } from './components/Sidebar'
import { ToolList } from './components/ToolList'
import { useChat } from './hooks/useChat'
import { useApiConfig } from './hooks/useApiConfig'
import { useConversations } from './hooks/useConversations'
import type { Conversation, MainSection } from './types/chat'
import { MODEL_DISPLAY_NAME } from '../shared/config'

const sectionCopy: Record<
  Exclude<MainSection, 'chat' | 'tools'>,
  { title: string; description: string }
> = {
  skills: {
    title: 'Skills',
    description: 'Skills 能力入口已预留，后续可在这里管理可用技能。',
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
  } = useConversations()
  const { isLoading, sendMessage, abortMessage, approveToolCall, rejectToolCall } = useChat({
    config,
    activeConversation,
    updateConversation,
  })

  const handleNewConversation = () => {
    abortMessage()
    createConversation()
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

        <main className="app-main">
          {activeSection === 'chat' ? (
            <Chat
              messages={activeConversation.messages}
              isLoading={isLoading}
              onSend={sendMessage}
              onAbort={abortMessage}
              projectFolder={activeConversation.projectFolder}
              onSelectFolder={handleSelectFolder}
              onApproveTool={approveToolCall}
              onRejectTool={rejectToolCall}
            />
          ) : activeSection === 'tools' ? (
            <ToolList />
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
    </div>
  )
}

export default App
