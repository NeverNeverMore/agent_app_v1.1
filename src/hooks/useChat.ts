import { useState, useEffect, useRef, useCallback } from 'react'
import type { ApiConfig } from '../../shared/types'
import type { Conversation, Message } from '../types/chat'

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

  useEffect(() => {
    if (!window.electronAPI) return
    const removeChunk = window.electronAPI.onStreamChunk(handleChunk)
    const removeDone = window.electronAPI.onStreamDone(handleDone)
    const removeError = window.electronAPI.onStreamError(handleError)
    return () => {
      removeChunk()
      removeDone()
      removeError()
    }
  }, [handleChunk, handleDone, handleError])

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

      window.electronAPI.sendMessage({ id, config, messages: nextMessages })
    },
    [activeConversation, config, updateConversation]
  )

  const abortMessage = useCallback(() => {
    const currentRequest = currentRequestRef.current
    if (!currentRequest) return
    window.electronAPI.abortMessage({ id: currentRequest.id })
    setIsLoading(false)
    currentRequestRef.current = null
  }, [])

  return {
    isLoading,
    sendMessage,
    abortMessage,
  }
}