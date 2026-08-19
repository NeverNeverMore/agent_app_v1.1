import { useState, useRef, useEffect } from 'react'
import { FolderOpen, Loader2, Send, Square } from 'lucide-react'
import type { Message } from '../types/chat'
import { MessageItem } from './Message'
import { MODEL_DISPLAY_NAME } from '../../shared/config'

interface ChatProps {
  messages: Message[]
  isLoading: boolean
  onSend: (content: string) => void
  onAbort: () => void
  projectFolder: string
  onSelectFolder: () => void
}

export function Chat({
  messages,
  isLoading,
  onSend,
  onAbort,
  projectFolder,
  onSelectFolder,
}: ChatProps) {
  const [input, setInput] = useState('')
  const [thinkingSeconds, setThinkingSeconds] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

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
          <MessageItem key={index} message={message} />
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
      </div>
    </div>
  )
}