import { useState } from 'react'
import { MessageSquarePlus, Settings } from 'lucide-react'
import { Chat } from './components/Chat'
import { SettingsModal } from './components/Settings'
import { useChat } from './hooks/useChat'
import { useApiConfig } from './hooks/useApiConfig'
import { APP_NAME, MODEL_DISPLAY_NAME } from '../shared/config'

function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const { config, updateConfig } = useApiConfig()
  const { messages, isLoading, sendMessage, abortMessage, clearMessages } =
    useChat({ config })

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <button
            onClick={clearMessages}
            className="icon-button"
            title="新对话"
            aria-label="新对话"
          >
            <MessageSquarePlus size={20} />
          </button>
          <h1>{APP_NAME}</h1>
        </div>
        <div className="header-right">
          <span className="model-name">{MODEL_DISPLAY_NAME}</span>
          <button
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
        <Chat
          messages={messages}
          isLoading={isLoading}
          onSend={sendMessage}
          onAbort={abortMessage}
        />
      </main>
      <SettingsModal
        isOpen={isSettingsOpen}
        config={config}
        onSave={updateConfig}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  )
}

export default App
