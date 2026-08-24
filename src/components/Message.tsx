import { CheckCircle2, Loader2, Wrench, XCircle } from 'lucide-react'
import { MODEL_DISPLAY_NAME } from '../../shared/config'
import type { ToolCallRecord } from '../../shared/tools'
import type { Message } from '../types/chat'

interface MessageItemProps {
  message: Message
  onApproveTool: (approvalId: string, argumentsHash: string) => void
  onRejectTool: (approvalId: string) => void
}

function toolStatusText(call: ToolCallRecord): string {
  if (call.status === 'running') return '执行中…'
  if (call.status === 'failed') return '失败'
  const seconds =
    call.durationMs !== undefined ? ` · ${(call.durationMs / 1000).toFixed(1)}s` : ''
  return `成功${seconds}`
}

function ToolCallCard({ call, onApproveTool, onRejectTool }: {
  call: ToolCallRecord
  onApproveTool: MessageItemProps['onApproveTool']
  onRejectTool: MessageItemProps['onRejectTool']
}) {
  const approval = call.approval
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
        {approval && (
          <div className={`approval-card ${approval.status}`}>
            <div className="approval-title">需要确认：{call.name}</div>
            {approval.preview?.targetPath && <div className="approval-row"><span>目标文件</span><code>{approval.preview.targetPath}</code></div>}
            {approval.preview?.overwrite !== undefined && <div className="approval-row"><span>操作</span><span>{approval.preview.overwrite ? '覆盖文件' : '新建文件'}</span></div>}
            {approval.preview?.contentLength !== undefined && <div className="approval-row"><span>内容</span><span>{approval.preview.contentLength} 字符</span></div>}
            {approval.preview?.contentPreview && <pre className="approval-preview">{approval.preview.contentPreview}</pre>}
            {approval.status === 'pending' ? (
              <div className="approval-actions">
                <button type="button" className="approval-reject" onClick={() => onRejectTool(approval.id)}>拒绝</button>
                <button type="button" className="approval-approve" onClick={() => onApproveTool(approval.id, approval.argumentsHash)}>批准</button>
              </div>
            ) : <div className="approval-status">{approval.status === 'approved' ? '已批准' : approval.status === 'rejected' ? '已拒绝' : approval.status === 'expired' ? '已过期' : '已取消'}</div>}
          </div>
        )}
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

export function MessageItem({ message, onApproveTool, onRejectTool }: MessageItemProps) {
  const isUser = message.role === 'user'
  return (
    <div className={`message ${isUser ? 'user' : 'assistant'}`}>
      <div className="message-bubble">
        <div className="message-role">{isUser ? '你' : MODEL_DISPLAY_NAME}</div>
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="tool-calls">
            {message.toolCalls.map((call) => (
              <ToolCallCard key={call.id} call={call} onApproveTool={onApproveTool} onRejectTool={onRejectTool} />
            ))}
          </div>
        )}
        <div className="message-content">{message.content}</div>
      </div>
    </div>
  )
}
