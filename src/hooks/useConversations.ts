import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Conversation } from '../types/chat'

const STORAGE_KEY = 'chat-conversations-state'

interface ConversationsState {
  conversations: Conversation[]
  activeConversationId: string
}

type ConversationUpdater = (conversation: Conversation) => Conversation

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function buildConversation(): Conversation {
  const now = Date.now()
  return {
    id: createId(),
    title: '新对话',
    messages: [],
    projectFolder: '',
    createdAt: now,
    updatedAt: now,
  }
}

function isConversation(value: unknown): value is Conversation {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Conversation
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.title === 'string' &&
    Array.isArray(candidate.messages) &&
    typeof candidate.createdAt === 'number' &&
    typeof candidate.updatedAt === 'number'
  )
}

function loadState(): ConversationsState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<ConversationsState>
      const conversations = Array.isArray(parsed.conversations)
        ? parsed.conversations
            .filter(isConversation)
            .map((conversation) => ({
              ...conversation,
              messages: conversation.messages.map((message) =>
                message.role === 'assistant' && message.toolCalls
                  ? {
                      ...message,
                      toolCalls: message.toolCalls.map((call) =>
                        call.approval?.status === 'pending'
                          ? { ...call, approval: { ...call.approval, status: 'cancelled' as const } }
                          : call
                      ),
                    }
                  : message
              ),
              projectFolder:
                typeof conversation.projectFolder === 'string'
                  ? conversation.projectFolder
                  : '',
            }))
        : []

      if (conversations.length > 0) {
        const activeConversationId =
          typeof parsed.activeConversationId === 'string' &&
          conversations.some(
            (conversation) => conversation.id === parsed.activeConversationId
          )
            ? parsed.activeConversationId
            : conversations[0].id

        return { conversations, activeConversationId }
      }
    }
  } catch {}

  const conversation = buildConversation()
  return { conversations: [conversation], activeConversationId: conversation.id }
}

export function useConversations() {
  const [state, setState] = useState<ConversationsState>(loadState)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {}
  }, [state])

  const conversations = useMemo(
    () => [...state.conversations].sort((a, b) => b.updatedAt - a.updatedAt),
    [state.conversations]
  )

  const activeConversation =
    state.conversations.find(
      (conversation) => conversation.id === state.activeConversationId
    ) ?? state.conversations[0]

  const createConversation = useCallback(() => {
    const conversation = buildConversation()
    setState((prev) => ({
      conversations: [conversation, ...prev.conversations],
      activeConversationId: conversation.id,
    }))
  }, [])

  const selectConversation = useCallback((conversationId: string) => {
    setState((prev) =>
      prev.conversations.some((conversation) => conversation.id === conversationId)
        ? { ...prev, activeConversationId: conversationId }
        : prev
    )
  }, [])

  const updateConversation = useCallback(
    (conversationId: string, updater: ConversationUpdater) => {
      setState((prev) => ({
        ...prev,
        conversations: prev.conversations.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...updater(conversation),
                id: conversation.id,
                updatedAt: Date.now(),
              }
            : conversation
        ),
      }))
    },
    []
  )

  const renameConversation = useCallback(
    (conversationId: string, title: string) => {
      const trimmedTitle = title.trim()
      if (!trimmedTitle) return
      updateConversation(conversationId, (conversation) => ({
        ...conversation,
        title: trimmedTitle,
      }))
    },
    [updateConversation]
  )

  const deleteConversation = useCallback((conversationId: string) => {
    setState((prev) => {
      const removedIndex = prev.conversations.findIndex(
        (conversation) => conversation.id === conversationId
      )
      const remaining = prev.conversations.filter(
        (conversation) => conversation.id !== conversationId
      )

      if (remaining.length === 0) {
        const conversation = buildConversation()
        return {
          conversations: [conversation],
          activeConversationId: conversation.id,
        }
      }

      const activeConversationId =
        prev.activeConversationId === conversationId
          ? remaining[Math.min(Math.max(removedIndex, 0), remaining.length - 1)].id
          : prev.activeConversationId

      return { conversations: remaining, activeConversationId }
    })
  }, [])

  const setProjectFolder = useCallback(
    (projectFolder: string) => {
      updateConversation(activeConversation.id, (conversation) => ({
        ...conversation,
        projectFolder,
      }))
    },
    [activeConversation.id, updateConversation]
  )

  return {
    conversations,
    activeConversation,
    createConversation,
    selectConversation,
    updateConversation,
    renameConversation,
    deleteConversation,
    setProjectFolder,
  }
}
