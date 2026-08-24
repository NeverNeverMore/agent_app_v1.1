import type { ApiConfig } from '../shared/types'
import type { ToolInputSchema, ToolDefinition } from './tools/types'

export interface AgentToolCall {
  id: string
  name: string
  arguments: string
}

export type AgentMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; toolCalls?: AgentToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string }

export interface ProtocolResult {
  content: string
  toolCalls: AgentToolCall[]
}

export function protocolEndpoint(baseUrl: string, suffix: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '')
  return base.endsWith(suffix) ? base : `${base}${suffix}`
}

function anthropicSchema(schema: ToolInputSchema): Record<string, unknown> {
  return schema as unknown as Record<string, unknown>
}

function toAnthropicTools(tools: ToolDefinition[]) {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: anthropicSchema(tool.inputSchema),
  }))
}

function toOpenAIMessages(system: string, messages: AgentMessage[]) {
  return [
    ...(system ? [{ role: 'system', content: system }] : []),
    ...messages.map((message) => {
      if (message.role === 'tool') {
        return {
          role: 'tool',
          tool_call_id: message.toolCallId,
          content: message.content,
        }
      }
      if (message.role === 'assistant' && message.toolCalls?.length) {
        return {
          role: 'assistant',
          content: message.content,
          tool_calls: message.toolCalls.map((call) => ({
            id: call.id,
            type: 'function',
            function: { name: call.name, arguments: call.arguments || '{}' },
          })),
        }
      }
      return { role: message.role, content: message.content }
    }),
  ]
}

function toAnthropicMessages(messages: AgentMessage[]) {
  return messages.map((message) => {
    if (message.role === 'tool') {
      return {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: message.toolCallId, content: message.content }],
      }
    }
    if (message.role === 'assistant' && message.toolCalls?.length) {
      return {
        role: 'assistant',
        content: [
          ...(message.content ? [{ type: 'text', text: message.content }] : []),
          ...message.toolCalls.map((call) => ({
            type: 'tool_use',
            id: call.id,
            name: call.name,
            input: parseJsonObject(call.arguments),
          })),
        ],
      }
    }
    return { role: message.role, content: message.content }
  })
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

async function readSse(
  response: Response,
  onEvent: (event: Record<string, unknown>) => void,
  signal: AbortSignal
) {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body')
  const decoder = new TextDecoder()
  let buffer = ''
  let finished = false
  while (!finished) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') {
        finished = true
        break
      }
      try {
        onEvent(JSON.parse(data) as Record<string, unknown>)
      } catch {
        /* Ignore malformed SSE frames. */
      }
    }
    if (signal.aborted) return
  }
}

async function requestOpenAI(
  config: ApiConfig,
  system: string,
  messages: AgentMessage[],
  tools: ToolDefinition[],
  isLastStep: boolean,
  signal: AbortSignal,
  emitChunk: (content: string) => void
): Promise<ProtocolResult> {
  const response = await fetch(protocolEndpoint(config.baseUrl, '/chat/completions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      messages: toOpenAIMessages(system, messages),
      stream: true,
      ...(!isLastStep && tools.length ? { tools: toolsToOpenAI(tools) } : {}),
    }),
    signal,
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`)

  let content = ''
  const calls = new Map<number, AgentToolCall>()
  await readSse(response, (event) => {
    const choices = event.choices as Array<{ delta?: { content?: string; tool_calls?: Array<Record<string, unknown>> } }> | undefined
    const delta = choices?.[0]?.delta
    if (delta?.content) {
      content += delta.content
      emitChunk(delta.content)
    }
    for (const raw of delta?.tool_calls ?? []) {
      const index = Number(raw.index ?? 0)
      const current = calls.get(index) ?? { id: '', name: '', arguments: '' }
      if (raw.id) current.id = String(raw.id)
      const fn = raw.function as { name?: string; arguments?: string } | undefined
      if (fn?.name) current.name += fn.name
      if (fn?.arguments) current.arguments += fn.arguments
      calls.set(index, current)
    }
  }, signal)
  return { content, toolCalls: [...calls.entries()].sort(([a], [b]) => a - b).map(([, call]) => call) }
}

function toolsToOpenAI(tools: ToolDefinition[]) {
  return tools.map((tool) => ({
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
  }))
}

async function requestAnthropic(
  config: ApiConfig,
  system: string,
  messages: AgentMessage[],
  tools: ToolDefinition[],
  isLastStep: boolean,
  signal: AbortSignal,
  emitChunk: (content: string) => void
): Promise<ProtocolResult> {
  const response = await fetch(protocolEndpoint(config.baseUrl, '/v1/messages'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 4096,
      ...(system ? { system } : {}),
      messages: toAnthropicMessages(messages),
      stream: true,
      ...(!isLastStep && tools.length ? { tools: toAnthropicTools(tools) } : {}),
    }),
    signal,
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`)

  let content = ''
  const calls = new Map<number, AgentToolCall>()
  await readSse(response, (event) => {
    const type = String(event.type ?? '')
    if (type === 'content_block_start') {
      const index = Number(event.index ?? 0)
      const block = event.content_block as { type?: string; id?: string; name?: string } | undefined
      if (block?.type === 'tool_use') {
        calls.set(index, { id: block.id ?? '', name: block.name ?? '', arguments: '' })
      }
    } else if (type === 'content_block_delta') {
      const delta = event.delta as { type?: string; text?: string; partial_json?: string } | undefined
      if (delta?.type === 'text_delta' && delta.text) {
        content += delta.text
        emitChunk(delta.text)
      } else if (delta?.type === 'input_json_delta') {
        const call = calls.get(Number(event.index ?? 0))
        if (call) call.arguments += delta.partial_json ?? ''
      }
    }
  }, signal)
  return { content, toolCalls: [...calls.entries()].sort(([a], [b]) => a - b).map(([, call]) => call) }
}

export function requestModel(
  config: ApiConfig,
  system: string,
  messages: AgentMessage[],
  tools: ToolDefinition[],
  isLastStep: boolean,
  signal: AbortSignal,
  emitChunk: (content: string) => void
): Promise<ProtocolResult> {
  return config.protocol === 'anthropic'
    ? requestAnthropic(config, system, messages, tools, isLastStep, signal, emitChunk)
    : requestOpenAI(config, system, messages, tools, isLastStep, signal, emitChunk)
}
