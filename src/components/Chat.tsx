import { useState, useRef, useEffect } from 'react'
import { Check, ChevronUp, FolderOpen, Hand, Loader2, Send, ShieldAlert, Square } from 'lucide-react'
import type { Message } from '../types/chat'
import { MessageItem } from './Message'
import { MODEL_DISPLAY_NAME } from '../../shared/config'
import type { PermissionMode } from '../../shared/types'

interface ChatProps {
  messages: Message[]
  isLoading: boolean
  onSend: (content: string) => void
  onAbort: () => void
  projectFolder: string
  onSelectFolder: () => void
  permissionMode: PermissionMode
  onPermissionModeChange: (mode: PermissionMode) => void
  onApproveTool: (approvalId: string, argumentsHash: string) => void
  onRejectTool: (approvalId: string) => void
}

export function Chat({
  messages,
  isLoading,
  onSend,
  onAbort,
  projectFolder,
  onSelectFolder,
  permissionMode,
  onPermissionModeChange,
  onApproveTool,
  onRejectTool,
}: ChatProps) {
  const [input, setInput] = useState('')
  const [thinkingSeconds, setThinkingSeconds] = useState(0)
  const [isPermissionMenuOpen, setIsPermissionMenuOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const permissionSelectorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!isLoading) {
      setThinkingSeconds(0)
      return
    }

    const startedAt = Date.now()
    setThinkingSeconds(0)
    const timer = window.setInterval(() => {
      setThinkingSeconds(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [isLoading])

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
  }, [input])

  useEffect(() => {
    if (!isPermissionMenuOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!permissionSelectorRef.current?.contains(event.target as Node)) {
        setIsPermissionMenuOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsPermissionMenuOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isPermissionMenuOpen])

  const permissionOptions = [
    {
      value: 'ask' as const,
      title: '请求批准',
      description: '始终请求批准编辑外部文件和使用互联网',
      Icon: Hand,
    },
    {
      value: 'full' as const,
      title: '完全访问权限',
      description: '不受限制地访问互联网和计算机上的任何文件',
      Icon: ShieldAlert,
    },
  ]
  const selectedPermission = permissionOptions.find((option) => option.value === permissionMode) ?? permissionOptions[0]

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return
    onSend(input)
    setInput('')
    const textarea = textareaRef.current
    if (textarea) textarea.style.height = 'auto'
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as unknown as React.FormEvent)
    }
  }

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.length === 0 && (
          <div className="welcome">
            <h2>开始与 {MODEL_DISPLAY_NAME} 对话</h2>
            <p>在下方输入问题，按 Enter 发送，Shift + Enter 换行。</p>
          </div>
        )}
        {messages.map((message, index) => (
          <MessageItem key={index} message={message} onApproveTool={onApproveTool} onRejectTool={onRejectTool} />
        ))}
        {isLoading && (
          <div className="thinking-status" role="status" aria-live="polite">
            <Loader2 size={16} className="spin" />
            <span>思考中... {thinkingSeconds}秒</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <form className="input-area" onSubmit={handleSubmit}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isLoading ? '思考中...' : '输入消息...'}
          disabled={isLoading}
          rows={1}
        />
        <button
          type={isLoading ? 'button' : 'submit'}
          onClick={isLoading ? onAbort : undefined}
          className={isLoading ? 'abort' : 'send'}
          aria-label={isLoading ? '停止生成' : '发送'}
          disabled={!isLoading && !input.trim()}
        >
          {isLoading ? <Square size={20} /> : <Send size={20} />}
        </button>
      </form>
      <div className="project-folder-bar">
        <button
          type="button"
          className="folder-button"
          onClick={onSelectFolder}
          title={projectFolder || '关联项目文件夹'}
        >
          <FolderOpen size={16} />
          <span>{projectFolder ? projectFolder : '关联项目文件夹'}</span>
        </button>
        <div className={`permission-selector${isPermissionMenuOpen ? ' open' : ''}`} ref={permissionSelectorRef}>
          <button
            type="button"
            className="permission-trigger"
            onClick={() => !isLoading && setIsPermissionMenuOpen((open) => !open)}
            disabled={isLoading}
            aria-label="选择工具权限模式"
            aria-expanded={isPermissionMenuOpen}
            aria-haspopup="menu"
          >
            <selectedPermission.Icon size={16} aria-hidden="true" />
            <span>{selectedPermission.title}</span>
            <ChevronUp size={14} className="permission-chevron" aria-hidden="true" />
          </button>
          {isPermissionMenuOpen && (
            <div className="permission-menu" role="menu" aria-label="工具权限模式">
              {permissionOptions.map(({ value, title, description, Icon }) => {
                const selected = value === permissionMode
                return (
                  <button
                    type="button"
                    key={value}
                    className={`permission-option${selected ? ' selected' : ''}`}
                    role="menuitemradio"
                    aria-checked={selected}
                    onClick={() => {
                      onPermissionModeChange(value)
                      setIsPermissionMenuOpen(false)
                    }}
                  >
                    <Icon size={19} aria-hidden="true" />
                    <span className="permission-option-copy">
                      <strong>{title}</strong>
                      <small>{description}</small>
                    </span>
                    {selected && <Check size={18} className="permission-check" aria-hidden="true" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
