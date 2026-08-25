import type { ApiConfig } from '../shared/types'
import type { ToolStreamEvent } from '../shared/tools'
import type { ApprovalPreview, ApprovalStreamEvent } from '../shared/approvals'
import { createApproval, hashToolArguments } from './approvals'
import { executeToolCall } from './tools/executor'
import type { ExecutedToolCall } from './tools/executor'
import { getToolRegistry } from './tools'
import type { ToolContext } from './tools/types'
import { requestModel as requestProtocolModel } from './protocol'
import type { AgentMessage } from './protocol'

import type { PermissionMode } from '../shared/types'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AgentLoopOptions {
  config: ApiConfig
  messages: ChatMessage[]
  projectFolder: string
  permissionMode: PermissionMode
  requestId: number
  conversationId: string
  signal: AbortSignal
  emitChunk: (content: string) => void
  emitToolEvent: (event: ToolStreamEvent) => void
  emitApproval: (event: ApprovalStreamEvent) => void
}

const MAX_TOOL_STEPS = 8

export async function runAgentLoop(options: AgentLoopOptions): Promise<void> {
  const { config, projectFolder, permissionMode, requestId, conversationId, signal, emitChunk, emitToolEvent, emitApproval } = options

  const registry = getToolRegistry()
  const tools = registry.listExecutable()

  const systemPrompts = options.messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
  if (projectFolder) {
    systemPrompts.unshift(
      `你可以使用提供的工具来回答问题和完成任务。当前项目目录：${projectFolder}。file_list 和 file_read 工具使用相对于项目目录的路径，只能访问该目录内的文件。`
    )
  }
  if (permissionMode === 'full') {
    systemPrompts.unshift(
      '当前权限模式为完全访问权限：需要写入或修改文件时直接调用 file_write 工具，无需在回复中询问用户确认，工具会自动执行。'
    )
  } else {
    systemPrompts.unshift(
      '当前权限模式为请求批准：当需要写入或修改文件时，直接调用 file_write 工具，不要在回复中用自然语言询问用户是否确认，系统会自动弹出确认卡片让用户批准或拒绝。'
    )
  }
  const systemPrompt = systemPrompts.join('\n\n')
  const messages: AgentMessage[] = options.messages
    .filter((message): message is ChatMessage & { role: 'user' | 'assistant' } => message.role !== 'system')
    .map((message) => ({ role: message.role, content: message.content }))

  for (let step = 0; ; step++) {
    if (signal.aborted) return

    // 最后一步不再提供工具，让模型基于已有结果输出最终回答
    const isLastStep = step >= MAX_TOOL_STEPS

    const result = await requestProtocolModel(
      config, systemPrompt, messages, tools, isLastStep, signal, emitChunk
    )

    const calls = result.toolCalls.filter((call) => call.name)
    if (calls.length === 0 || isLastStep) return

    const normalizedCalls = calls.map((call, index) => ({
      ...call,
      id: call.id || `call_${Date.now()}_${step}_${index}`,
    }))

    messages.push({
      role: 'assistant',
      content: result.content || null,
      toolCalls: normalizedCalls,
    })

    for (const call of normalizedCalls) {
      if (signal.aborted) return

      emitToolEvent({
        type: 'start',
        callId: call.id,
        name: call.name,
        arguments: call.arguments || '{}',
      })

      const context: ToolContext = { projectFolder, permissionMode, signal }
      const tool = registry.get(call.name)
      let executed: ExecutedToolCall

      if (tool && tool.permission === 'write' && permissionMode === 'ask') {
        // write 工具：挂起循环，等待用户确认（批准/拒绝/过期/停止取消）
        const args = call.arguments || '{}'
        let preview: ApprovalPreview | undefined
        if (tool.describeApproval) {
          try {
            preview = await tool.describeApproval(
              JSON.parse(args) as Record<string, unknown>,
              context
            )
          } catch {
            /* 预览失败不阻塞审批流程 */
          }
        }

        const { request, decision } = createApproval({
          requestId,
          conversationId,
          toolCallId: call.id,
          toolName: call.name,
          arguments: args,
          permission: tool.permission,
          ...(preview ? { preview } : {}),
          emitUpdate: (status) =>
            emitApproval({ type: 'update', approvalId: request.id, status }),
        })
        emitApproval({ type: 'request', request })

        const approvalStatus = await decision
        if (signal.aborted) {
          emitToolEvent({
            type: 'result',
            callId: call.id,
            status: 'failed',
            summary: 'TOOL_ABORTED: 工具执行已被用户停止',
            durationMs: 0,
          })
          return
        }

        if (approvalStatus === 'approved') {
          // 执行前重新校验参数哈希，防止批准后参数被篡改
          if (request.argumentsHash !== hashToolArguments(call.name, args)) {
            const message = '参数与批准时不一致，已拒绝执行'
            executed = {
              success: false,
              resultMessage: JSON.stringify({
                error: { code: 'ARGUMENTS_TAMPERED', message },
              }),
              summary: `ARGUMENTS_TAMPERED: ${message}`,
              durationMs: 0,
            }
          } else {
            executed = await executeToolCall(registry, call.name, args, context)
          }
        } else {
          const code =
            approvalStatus === 'rejected'
              ? 'USER_REJECTED'
              : approvalStatus === 'expired'
                ? 'APPROVAL_EXPIRED'
                : 'APPROVAL_CANCELLED'
          const message =
            approvalStatus === 'rejected'
              ? '用户拒绝了该操作'
              : approvalStatus === 'expired'
                ? '等待用户确认超时，操作未执行'
                : '操作已被取消'
          executed = {
            success: false,
            resultMessage: JSON.stringify({ error: { code, message } }),
            summary: `${code}: ${message}`,
            durationMs: 0,
          }
        }
      } else {
        executed = await executeToolCall(registry, call.name, call.arguments, context)
      }

      emitToolEvent({
        type: 'result',
        callId: call.id,
        status: executed.success ? 'success' : 'failed',
        summary: executed.summary,
        durationMs: executed.durationMs,
      })

      messages.push({ role: 'tool', toolCallId: call.id, content: executed.resultMessage })
    }
  }
}
