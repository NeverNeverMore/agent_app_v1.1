import { CheckCircle2, Loader2, Wrench, XCircle } from 'lucide-react'
import { File, FileSpreadsheet, FileText, Image as ImageIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { MODEL_DISPLAY_NAME } from '../../shared/config'
import type { ToolCallRecord } from '../../shared/tools'
import type { Message } from '../types/chat'

interface MessageItemProps {
  message: Message
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function attachmentIcon(kind: string) {
  if (kind === 'image') return ImageIcon
  if (kind === 'pdf' || kind === 'docx' || kind === 'text') return FileText
  if (kind === 'xlsx' || kind === 'xls') return FileSpreadsheet
  return File
}

function AttachmentItem({ attachment }: { attachment: NonNullable<Message['attachments']>[number] }) {
  const [preview, setPreview] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    if (attachment.dataUrl) {
      setPreview(attachment.dataUrl)
      return () => { active = false }
    }
    if (attachment.kind === 'image' && attachment.previewId) {
      void window.electronAPI?.readImagePreview(attachment.previewId).then((value) => { if (active) setPreview(value) })
    }
    return () => { active = false }
  }, [attachment.kind, attachment.previewId])
  if (preview) return <div className="message-attachment image-attachment" title={attachment.name}><img src={preview} alt={attachment.name} /></div>
  const Icon = attachmentIcon(attachment.kind)
  return <div className="message-attachment file-attachment" title={attachment.name}><Icon size={22} /><span className="message-attachment-copy"><strong>{attachment.name}</strong><small>{formatSize(attachment.size)}</small></span></div>
}

function toolStatusText(call: ToolCallRecord): string {
  if (call.status === 'running') return '执行中…'
  if (call.status === 'failed') return '失败'
  const seconds =
    call.durationMs !== undefined ? ` · ${(call.durationMs / 1000).toFixed(1)}s` : ''
  return `成功${seconds}`
}

function ToolCallCard({ call }: { call: ToolCallRecord }) {
  return (
    <details className={`tool-call ${call.status}`}>
      <summary>
        <Wrench size={14} />
        <span className="tool-call-name">{call.name}</span>
        <span className="tool-call-state">
          {call.status === 'running' && <Loader2 size={14} className="spin" />}
          {call.status === 'success' && <CheckCircle2 size={14} />}
          {call.status === 'failed' && <XCircle size={14} />}
          {toolStatusText(call)}
        </span>
      </summary>
      <div className="tool-call-detail">
        <div className="tool-call-label">参数</div>
        <pre>{call.arguments}</pre>
        {call.summary && (
          <>
            <div className="tool-call-label">结果</div>
            <pre>{call.summary}</pre>
          </>
        )}
      </div>
    </details>
  )
}

export function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === 'user'
  return (
    <div className={`message ${isUser ? 'user' : 'assistant'}`}>
      {message.attachments && message.attachments.length > 0 && (
        <div className="message-attachments" aria-label="消息附件">
          {message.attachments.map((attachment) => <AttachmentItem key={attachment.id} attachment={attachment} />)}
        </div>
      )}
      <div className="message-bubble">
        <div className="message-role">{isUser ? '你' : MODEL_DISPLAY_NAME}</div>
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="tool-calls">
            {message.toolCalls.map((call) => (
              <ToolCallCard key={call.id} call={call} />
            ))}
          </div>
        )}
        <div className="message-content">{message.content}</div>
      </div>
    </div>
  )
}
