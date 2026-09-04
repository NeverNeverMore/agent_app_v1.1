import { useState, useEffect, useRef, useCallback } from 'react'
import type { ApiConfig } from '../../shared/types'
import type { Conversation, Message } from '../types/chat'
import type { ToolStreamEvent } from '../../shared/tools'
import type { ApprovalStreamEvent } from '../../shared/approvals'
import type { TaskStatus, TaskStatusEvent } from '../../shared/task'
import type { ChatAttachment } from '../../shared/attachments'

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
  taskStatus: TaskStatus
  sendMessage: (content: string, attachments?: ChatAttachment[]) => void
  retryLastMessage: () => void
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
  const [taskStatus, setTaskStatus] = useState<TaskStatus>('completed')
  const currentRequestRef = useRef<ActiveRequest | null>(null)
  const lastAttachmentsRef = useRef<ChatAttachment[]>([])

  const handleTaskStatus = useCallback(
    (_event: unknown, data: { id: number; event: TaskStatusEvent }) => {
      if (data.id !== currentRequestRef.current?.id) return
      setTaskStatus(data.event.status)
    },
    []
  )

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
    setTaskStatus('completed')
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
      setTaskStatus('failed')
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
    let cancelled = false
    void window.electronAPI?.listPendingApprovals().then((pending) => {
      if (cancelled) return
      const approval = pending.find((item) => item.conversationId === activeConversation.id)
      if (!approval) return
      currentRequestRef.current = { id: approval.requestId, conversationId: approval.conversationId }
      setIsLoading(true)
      setTaskStatus('waiting_approval')
      updateConversation(approval.conversationId, (conversation) => {
        const lastMessage = conversation.messages[conversation.messages.length - 1]
        if (!lastMessage || lastMessage.role !== 'assistant' || !lastMessage.toolCalls) return conversation
        const index = lastMessage.toolCalls.findIndex((call) => call.id === approval.toolCallId)
        if (index < 0) return conversation
        const toolCalls = [...lastMessage.toolCalls]
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
        const messages = [...conversation.messages]
        messages[messages.length - 1] = { ...lastMessage, toolCalls }
        return { ...conversation, messages }
      })
    })
    return () => { cancelled = true }
  }, [activeConversation.id, updateConversation])

  useEffect(() => {
    if (!window.electronAPI) return
    const removeChunk = window.electronAPI.onStreamChunk(handleChunk)
    const removeDone = window.electronAPI.onStreamDone(handleDone)
    const removeError = window.electronAPI.onStreamError(handleError)
    const removeToolEvent = window.electronAPI.onToolEvent(handleToolEvent)
    const removeApprovalEvent = window.electronAPI.onApprovalEvent(handleApprovalEvent)
    const removeTaskStatus = window.electronAPI.onTaskStatus(handleTaskStatus)
    return () => {
      removeChunk()
      removeDone()
      removeError()
      removeToolEvent()
      removeApprovalEvent()
      removeTaskStatus()
    }
  }, [handleChunk, handleDone, handleError, handleToolEvent, handleApprovalEvent, handleTaskStatus])

  const sendMessage = useCallback(
    (content: string, attachments: ChatAttachment[] = [], replaceFailed = false) => {
      const trimmed = content.trim()
      if (!trimmed && attachments.length === 0) return
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
      lastAttachmentsRef.current = attachments
      const baseMessages = replaceFailed && activeConversation.messages.at(-1)?.role === 'assistant' && activeConversation.messages.at(-1)?.content.startsWith('[Error:')
        ? activeConversation.messages.slice(0, -1)
        : activeConversation.messages
      const nextMessages: Message[] = [
        ...baseMessages,
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
      setTaskStatus('queued')

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
        attachments,
        enabledSkillIds: activeConversation.enabledSkillIds,
      })
    },
    [activeConversation, config, updateConversation]
  )

  const retryLastMessage = useCallback(() => {
    if (isLoading) return
    const lastUser = [...activeConversation.messages].reverse().find((message) => message.role === 'user')
    if (!lastUser) return
    updateConversation(activeConversation.id, (conversation) => {
      const last = conversation.messages[conversation.messages.length - 1]
      if (last?.role === 'assistant' && last.content.startsWith('[Error:')) {
        return { ...conversation, messages: conversation.messages.slice(0, -1) }
      }
      return conversation
    })
    sendMessage(lastUser.content, lastAttachmentsRef.current, true)
  }, [activeConversation, isLoading, sendMessage, updateConversation])

  const abortMessage = useCallback(() => {
    const currentRequest = currentRequestRef.current
    if (!currentRequest) return
    window.electronAPI.abortMessage({ id: currentRequest.id })
    // 停止后若还有 pending 审批，先将其标为 cancelled；approval-event 到达时会再次匹配并忽略
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
    setTaskStatus('cancelled')
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
    taskStatus,
    sendMessage,
    retryLastMessage,
    abortMessage,
    approveToolCall,
    rejectToolCall,
  }
}
