import { CheckCircle2, Loader2, Wrench, XCircle } from 'lucide-react'
import { MODEL_DISPLAY_NAME } from '../../shared/config'
import type { ToolCallRecord } from '../../shared/tools'
import type { Message } from '../types/chat'

interface MessageItemProps {
  message: Message
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
