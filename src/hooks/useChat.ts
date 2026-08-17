import { useState, useEffect, useRef, useCallback } from 'react'
import type { ApiConfig } from '../../shared/types'
import type { Message } from '../types/chat'

interface UseChatOptions {
  config: ApiConfig
}

interface UseChatReturn {
  messages: Message[]
  isLoading: boolean
  sendMessage: (content: string) => void
  abortMessage: () => void
  clearMessages: () => void
}

let requestId = 0

export function useChat({ config }: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const currentRequestIdRef = useRef<number | null>(null)

  const handleChunk = useCallback(
    (_event: unknown, data: { id: number; content: string }) => {
      if (data.id !== currentRequestIdRef.current) return
      setMessages((prev) => {
        if (prev.length === 0) return prev
        const lastMessage = prev[prev.length - 1]
        if (lastMessage.role !== 'assistant') return prev
        const updated = [...prev]
        updated[updated.length - 1] = {
          ...lastMessage,
          content: lastMessage.content + data.content,
        }
        return updated
      })
    },
    []
  )

  const handleDone = useCallback(
    (_event: unknown, data: { id: number }) => {
      if (data.id !== currentRequestIdRef.current) return
      setIsLoading(false)
      currentRequestIdRef.current = null
    },
    []
  )

  const handleError = useCallback(
    (_event: unknown, data: { id: number; error: string }) => {
      if (data.id !== currentRequestIdRef.current) return
      setMessages((prev) => {
        if (prev.length === 0) {
          return [{ role: 'assistant', content: `[Error: ${data.error}]` }]
        }
        const lastMessage = prev[prev.length - 1]
        if (lastMessage.role !== 'assistant') {
          return [...prev, { role: 'assistant', content: `[Error: ${data.error}]` }]
        }
        const updated = [...prev]
        updated[updated.length - 1] = {
          ...lastMessage,
          content: `[Error: ${data.error}]`,
        }
        return updated
      })
      setIsLoading(false)
      currentRequestIdRef.current = null
    },
    []
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
      if (isLoading) {
        window.electronAPI.abortMessage({ id: currentRequestIdRef.current! })
        setIsLoading(false)
        currentRequestIdRef.current = null
      }

      const nextMessages: Message[] = [...messages, { role: 'user', content: trimmed }]
      setMessages([...nextMessages, { role: 'assistant', content: '' }])
      setIsLoading(true)

      requestId += 1
      const id = requestId
      currentRequestIdRef.current = id

      window.electronAPI.sendMessage({ id, config, messages: nextMessages })
    },
    [config, isLoading, messages]
  )

  const abortMessage = useCallback(() => {
    if (currentRequestIdRef.current === null) return
    window.electronAPI.abortMessage({ id: currentRequestIdRef.current })
    setIsLoading(false)
    currentRequestIdRef.current = null
  }, [])

  const clearMessages = useCallback(() => {
    setMessages([])
    currentRequestIdRef.current = null
    setIsLoading(false)
  }, [])

  return {
    messages,
    isLoading,
    sendMessage,
    abortMessage,
    clearMessages,
  }
}
