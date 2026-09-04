import { useState, useRef, useEffect } from 'react'
import { AlertTriangle, Check, ChevronUp, FolderOpen, Hand, Loader2, Send, ShieldAlert, Square, X } from 'lucide-react'
import type { Message } from '../types/chat'
import { MessageItem } from './Message'
import { MODEL_DISPLAY_NAME } from '../../shared/config'
import type { PermissionMode } from '../../shared/types'
import type { TaskStatus } from '../../shared/task'
import type { ChatAttachment } from '../../shared/attachments'

interface ChatProps {
  messages: Message[]
  isLoading: boolean
  taskStatus: TaskStatus
  onSend: (content: string, attachments?: ChatAttachment[]) => void
  onRetry: () => void
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
  taskStatus,
  onSend,
  onRetry,
  onAbort,
  projectFolder,
  onSelectFolder,
  permissionMode,
  onPermissionModeChange,
  onApproveTool,
  onRejectTool,
}: ChatProps) {
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [attachmentError, setAttachmentError] = useState('')
  const [isDragActive, setIsDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
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

  const addAttachments = async (importer: () => Promise<ChatAttachment[]>) => {
    if (isLoading || !window.electronAPI) return
    setAttachmentError('')
    try {
      const imported = await importer()
      setAttachments((current) => [...current, ...imported].slice(0, 5))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('附件上传失败', error)
      setAttachmentError(message || '附件上传失败，请重试')
    }
  }

  const handleSelectAttachments = () => {
    void addAttachments(() => window.electronAPI!.selectAttachments())
  }

  const importDroppedFiles = (files: File[]) => {
    if (isLoading || !window.electronAPI) return
    const paths = files.map((file) => {
      try {
        return window.electronAPI.getFilePath(file) || (file as File & { path?: string }).path || ''
      } catch {
        return (file as File & { path?: string }).path || ''
      }
    }).filter(Boolean)
    if (!paths.length) {
      setAttachmentError('无法读取拖入文件，请使用本地文件或点击回形针选择')
      return
    }
    void addAttachments(() => window.electronAPI!.importAttachments(paths))
  }

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
    if (!isLoading) setIsDragActive(true)
  }

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault()
    if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsDragActive(false)
  }

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragActive(false)
    importDroppedFiles(Array.from(event.dataTransfer.files))
  }

  useEffect(() => {
    const preventWindowFileDrop = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault()
    }
    const handleWindowDrop = (event: DragEvent) => {
      if (!event.dataTransfer?.files.length || isLoading) return
      event.preventDefault()
      event.stopPropagation()
      setIsDragActive(false)
      importDroppedFiles(Array.from(event.dataTransfer.files))
    }
    window.addEventListener('dragover', preventWindowFileDrop, true)
    window.addEventListener('drop', handleWindowDrop, true)
    return () => {
      window.removeEventListener('dragover', preventWindowFileDrop, true)
      window.removeEventListener('drop', handleWindowDrop, true)
    }
  }, [isLoading])
  const removeAttachment = (attachment: ChatAttachment) => {
    setAttachments((current) => current.filter((item) => item.id !== attachment.id))
    void window.electronAPI?.cleanupAttachments([attachment])
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if ((!input.trim() && attachments.length === 0) || isLoading) return
    onSend(input, attachments)
    setInput('')
    setAttachments([])
    setAttachmentError('')
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
    <div className={`chat-container${isDragActive ? ' drag-over' : ''}`} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
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
            <span>{taskStatus === 'waiting_approval' ? '等待用户确认' : taskStatus === 'running_tool' ? '正在执行工具' : '思考中'}... {thinkingSeconds}秒</span>
          </div>
        )}
        {!isLoading && taskStatus === 'failed' && (
          <div className="task-recovery" role="alert">
            <span>任务执行失败，可以重试。</span>
            <button type="button" onClick={onRetry}>??</button>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      {(() => {
        const lastMsg = messages[messages.length - 1]
        if (!lastMsg || lastMsg.role !== 'assistant' || !lastMsg.toolCalls) return null
        const pendingCalls = lastMsg.toolCalls.filter((c) => c.approval?.status === 'pending')
        if (pendingCalls.length === 0) return null
        const first = pendingCalls[0]
        const preview = first.approval?.preview
        return (
          <div className="approval-banner">
            <div className="approval-banner-icon">
              <AlertTriangle size={20} />
            </div>
            <div className="approval-banner-body">
              <div className="approval-banner-title">
                请求确认：{first.name}
              </div>
              {preview?.targetPath && (
                <div className="approval-banner-meta">
                  <span>文件</span>
                  <code>{preview.targetPath}</code>
                </div>
              )}
              {preview?.overwrite !== undefined && (
                <div className="approval-banner-meta">
                  <span>操作</span>
                  <span>{preview.overwrite ? '覆盖现有文件' : '新建文件'}</span>
                </div>
              )}
              {preview?.contentLength !== undefined && (
                <div className="approval-banner-meta">
                  <span>内容</span>
                  <span>{preview.contentLength} 字符</span>
                </div>
              )}
            </div>
            <div className="approval-banner-actions">
              <button
                type="button"
                className="approval-banner-reject"
                onClick={() => onRejectTool(first.approval!.id)}
              >
                <X size={16} />
                拒绝
              </button>
              <button
                type="button"
                className="approval-banner-approve"
                onClick={() => onApproveTool(first.approval!.id, first.approval!.argumentsHash)}
              >
                <Check size={16} />
                批准
              </button>
            </div>
          </div>
        )
      })()}
      {attachments.length > 0 && (
        <div className="attachment-list" aria-label={'\u5f85\u53d1\u9001\u9644\u4ef6'}>
          {attachments.map((attachment) => (
            <div className="attachment-chip" key={attachment.id}>
              <span className="attachment-chip-name" title={attachment.name}>{attachment.name}</span>
              <span className="attachment-chip-size">{(attachment.size / 1024 / 1024).toFixed(1)}MB</span>
              <button type="button" onClick={() => removeAttachment(attachment)} disabled={isLoading} aria-label={`\u5220\u9664\u9644\u4ef6 ${attachment.name}`}>&times;</button>
            </div>
          ))}
        </div>
      )}
      <form className="input-area" onSubmit={handleSubmit}>
        <input ref={fileInputRef} type="file" multiple hidden />
        <button type="button" className="attachment-button" onClick={handleSelectAttachments} disabled={isLoading} aria-label="添加附件" title="添加附件">📎</button>
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
          disabled={!isLoading && !input.trim() && attachments.length === 0}
        >
          {isLoading ? <Square size={20} /> : <Send size={20} />}
        </button>
      </form>
      {attachmentError && <div className="attachment-error" role="alert">{attachmentError}</div>}
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
