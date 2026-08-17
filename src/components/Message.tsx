import { MODEL_DISPLAY_NAME } from '../../shared/config'
import type { Message } from '../types/chat'

interface MessageItemProps {
  message: Message
}

export function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === 'user'
  return (
    <div className={`message ${isUser ? 'user' : 'assistant'}`}>
      <div className="message-bubble">
        <div className="message-role">{isUser ? '我' : MODEL_DISPLAY_NAME}</div>
        <div className="message-content">{message.content}</div>
      </div>
    </div>
  )
}
