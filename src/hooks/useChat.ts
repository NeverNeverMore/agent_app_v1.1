import { useState, useEffect, useRef, useCallback } from 'react'
import type { ApiConfig } from '../../shared/types'
import type { Conversation, Message } from '../types/chat'
import type { ToolStreamEvent } from '../../shared/tools'
import type { ApprovalStreamEvent } from '../../shared/approvals'

interface UseChatOptions {
  config: ApiConfig
  activeConversation: Conversation
  updateConversation: (
    conversationId: string,
    updater: (conversation: Conversation) => Conversation
  ) => void
}

interface UseChatReturn {
  isLoading: boolean
  sendMessage: (content: string) => void
  abortMessage: () => void
  approveToolCall: (approvalId: string, argumentsHash: string) => void
  rejectToolCall: (approvalId: string) => void
}

interface ActiveRequest {
  id: number
  conversationId: string
}

let requestId = 0

function conversationTitle(content: string) {
  const title = content.replace(/\s+/g, ' ').trim()
  return title.length > 24 ? `${title.slice(0, 24)}…` : title
}

export function useChat({
  config,
  activeConversation,
  updateConversation,
}: UseChatOptions): UseChatReturn {
  const [isLoading, setIsLoading] = useState(false)
  const currentRequestRef = useRef<ActiveRequest | null>(null)

  const handleChunk = useCallback(
    (_event: unknown, data: { id: number; content: string }) => {
      const request = currentRequestRef.current
      if (!request || data.id !== request.id) return

      updateConversation(request.conversationId, (conversation) => {
        const lastMessage = conversation.messages[conversation.messages.length - 1]
        if (!lastMessage || lastMessage.role !== 'assistant') return conversation

        const messages = [...conversation.messages]
        messages[messages.length - 1] = {
          ...lastMessage,
          content: lastMessage.content + data.content,
        }
        return { ...conversation, messages }
      })
    },
    [updateConversation]
  )

  const handleDone = useCallback((_event: unknown, data: { id: number }) => {
    if (data.id !== currentRequestRef.current?.id) return
    setIsLoading(false)
    currentRequestRef.current = null
  }, [])

  const handleError = useCallback(
    (_event: unknown, data: { id: number; error: string }) => {
      const request = currentRequestRef.current
      if (!request || data.id !== request.id) return

      updateConversation(request.conversationId, (conversation) => {
        const errorMessage: Message = {
          role: 'assistant',
          content: `[Error: ${data.error}]`,
        }
        const lastMessage = conversation.messages[conversation.messages.length - 1]
        const messages =
          lastMessage?.role === 'assistant'
            ? [...conversation.messages.slice(0, -1), errorMessage]
            : [...conversation.messages, errorMessage]
        return { ...conversation, messages }
      })
      setIsLoading(false)
      currentRequestRef.current = null
    },
    [updateConversation]
  )

  const handleToolEvent = useCallback(
    (_event: unknown, data: { id: number; event: ToolStreamEvent }) => {
      const request = currentRequestRef.current
      if (!request || data.id !== request.id) return

      updateConversation(request.conversationId, (conversation) => {
        const lastMessage = conversation.messages[conversation.messages.length - 1]
        if (!lastMessage || lastMessage.role !== 'assistant') return conversation

        const toolCalls = [...(lastMessage.toolCalls ?? [])]
        if (data.event.type === 'start') {
          toolCalls.push({
            id: data.event.callId,
            name: data.event.name,
            arguments: data.event.arguments,
            status: 'running',
          })
        } else {
          const index = toolCalls.findIndex((call) => call.id === data.event.callId)
          if (index >= 0) {
            toolCalls[index] = {
              ...toolCalls[index],
              status: data.event.status,
              summary: data.event.summary,
              durationMs: data.event.durationMs,
            }
          }
        }

        const messages = [...conversation.messages]
        messages[messages.length - 1] = { ...lastMessage, toolCalls }
        return { ...conversation, messages }
      })
    },
    [updateConversation]
  )

  const handleApprovalEvent = useCallback(
    (_event: unknown, data: { id: number; event: ApprovalStreamEvent }) => {
      const request = currentRequestRef.current
      if (!request || data.id !== request.id) return
      const approvalEvent = data.event

      updateConversation(request.conversationId, (conversation) => {
        const lastMessage = conversation.messages[conversation.messages.length - 1]
        if (!lastMessage || lastMessage.role !== 'assistant') return conversation

        const toolCalls = [...(lastMessage.toolCalls ?? [])]
        if (approvalEvent.type === 'request') {
          const { request: approval } = approvalEvent
          const index = toolCalls.findIndex((call) => call.id === approval.toolCallId)
          if (index < 0) return conversation
          toolCalls[index] = {
            ...toolCalls[index],
            approval: {
              id: approval.id,
              permission: approval.permission,
              status: 'pending',
              argumentsHash: approval.argumentsHash,
              ...(approval.preview ? { preview: approval.preview } : {}),
            },
          }
        } else if (approvalEvent.type === 'update') {
          const index = toolCalls.findIndex(
            (call) => call.approval?.id === approvalEvent.approvalId
          )
          if (index < 0) return conversation
          const approval = toolCalls[index].approval
          if (!approval || approval.status !== 'pending') return conversation
          toolCalls[index] = {
            ...toolCalls[index],
            approval: { ...approval, status: approvalEvent.status },
          }
        }

        const messages = [...conversation.messages]
        messages[messages.length - 1] = { ...lastMessage, toolCalls }
        return { ...conversation, messages }
      })
    },
    [updateConversation]
  )

  useEffect(() => {
    if (!window.electronAPI) return
    const removeChunk = window.electronAPI.onStreamChunk(handleChunk)
    const removeDone = window.electronAPI.onStreamDone(handleDone)
    const removeError = window.electronAPI.onStreamError(handleError)
    const removeToolEvent = window.electronAPI.onToolEvent(handleToolEvent)
    const removeApprovalEvent = window.electronAPI.onApprovalEvent(handleApprovalEvent)
    return () => {
      removeChunk()
      removeDone()
      removeError()
      removeToolEvent()
      removeApprovalEvent()
    }
  }, [handleChunk, handleDone, handleError, handleToolEvent, handleApprovalEvent])

  const sendMessage = useCallback(
    (content: string) => {
      const trimmed = content.trim()
      if (!trimmed) return
      if (!config.apiKey.trim() || !config.baseUrl.trim() || !config.model.trim()) {
        return
      }

      const currentRequest = currentRequestRef.current
      if (currentRequest) {
        window.electronAPI.abortMessage({ id: currentRequest.id })
        currentRequestRef.current = null
        setIsLoading(false)
      }

      const conversationId = activeConversation.id
      const nextMessages: Message[] = [
        ...activeConversation.messages,
        { role: 'user', content: trimmed },
      ]

      updateConversation(conversationId, (conversation) => ({
        ...conversation,
        title:
          conversation.title === '新对话'
            ? conversationTitle(trimmed)
            : conversation.title,
        messages: [...nextMessages, { role: 'assistant', content: '' }],
      }))
      setIsLoading(true)

      requestId += 1
      const id = requestId
      currentRequestRef.current = { id, conversationId }

      window.electronAPI.sendMessage({
        id,
        config,
        messages: nextMessages,
        projectFolder: activeConversation.projectFolder,
        permissionMode: activeConversation.permissionMode,
        conversationId,
      })
    },
    [activeConversation, config, updateConversation]
  )

  const abortMessage = useCallback(() => {
    const currentRequest = currentRequestRef.current
    if (!currentRequest) return
    window.electronAPI.abortMessage({ id: currentRequest.id })
    // 本地同步把 pending 审批标记为已取消（主进程侧的 approval-event 可能因请求已清理而不再匹配）
    updateConversation(currentRequest.conversationId, (conversation) => {
      const lastMessage = conversation.messages[conversation.messages.length - 1]
      if (!lastMessage || lastMessage.role !== 'assistant' || !lastMessage.toolCalls) {
        return conversation
      }
      let changed = false
      const toolCalls = lastMessage.toolCalls.map((call) => {
        if (call.approval?.status !== 'pending') return call
        changed = true
        return { ...call, approval: { ...call.approval, status: 'cancelled' as const } }
      })
      if (!changed) return conversation
      const messages = [...conversation.messages]
      messages[messages.length - 1] = { ...lastMessage, toolCalls }
      return { ...conversation, messages }
    })
    setIsLoading(false)
    currentRequestRef.current = null
  }, [updateConversation])

  const approveToolCall = useCallback((approvalId: string, argumentsHash: string) => {
    void window.electronAPI.approveTool({ approvalId, argumentsHash })
  }, [])

  const rejectToolCall = useCallback((approvalId: string) => {
    void window.electronAPI.rejectTool({ approvalId })
  }, [])

  return {
    isLoading,
    sendMessage,
    abortMessage,
    approveToolCall,
    rejectToolCall,
  }
}
