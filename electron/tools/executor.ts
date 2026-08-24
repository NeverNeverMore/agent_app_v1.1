import type { ToolRegistry } from './registry'
import { validateArguments } from './schema'
import type { ToolContext, ToolDefinition } from './types'

const TOOL_TIMEOUT_MS = 30_000
const MAX_RESULT_CHARS = 20_000
const MAX_SUMMARY_CHARS = 400

export interface ExecutedToolCall {
  success: boolean
  /** 回传给模型的 tool 消息内容 */
  resultMessage: string
  /** 前端展示的简短摘要 */
  summary: string
  durationMs: number
}

function truncate(text: string, max: number): string {
  return text.length > max
    ? `${text.slice(0, max)}…(已截断，共 ${text.length} 字符)`
    : text
}

function failure(code: string, message: string, durationMs: number): ExecutedToolCall {
  return {
    success: false,
    resultMessage: JSON.stringify({ error: { code, message } }),
    summary: `${code}: ${message}`,
    durationMs,
  }
}

export async function executeToolCall(
  registry: ToolRegistry,
  name: string,
  rawArguments: string,
  context: ToolContext
): Promise<ExecutedToolCall> {
  const startedAt = Date.now()
  const elapsed = () => Date.now() - startedAt

  let args: Record<string, unknown>
  try {
    const parsed: unknown = rawArguments.trim() ? JSON.parse(rawArguments) : {}
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return failure('INVALID_ARGUMENTS', '工具参数必须是 JSON 对象', elapsed())
    }
    args = parsed as Record<string, unknown>
  } catch {
    return failure(
      'INVALID_ARGUMENTS',
      `工具参数不是合法 JSON: ${truncate(rawArguments, 200)}`,
      elapsed()
    )
  }

  const tool: ToolDefinition | undefined = registry.get(name)
  if (!tool) {
    return failure('TOOL_NOT_FOUND', `未注册的工具: ${name}`, elapsed())
  }

  // 安全边界：dangerous 直接拒绝；write 的批准校验由 agentLoop 审批流程完成后才调用到这里
  if (tool.permission === 'dangerous') {
    return failure(
      'PERMISSION_DENIED',
      `工具 ${name} 属于高危工具，当前版本不允许执行`,
      elapsed()
    )
  }

  const validationError = validateArguments(args, tool.inputSchema)
  if (validationError) {
    return failure('INVALID_ARGUMENTS', validationError, elapsed())
  }

  let timedOut = false
  try {
    const result = await Promise.race([
      tool.execute(args, context),
      new Promise<never>((_, reject) => {
        const timer = setTimeout(() => {
          timedOut = true
          reject(new Error('TOOL_TIMEOUT'))
        }, TOOL_TIMEOUT_MS)
        const onAbort = () => {
          clearTimeout(timer)
          reject(new Error('TOOL_ABORTED'))
        }
        if (context.signal.aborted) {
          clearTimeout(timer)
          reject(new Error('TOOL_ABORTED'))
        } else {
          context.signal.addEventListener('abort', onAbort, { once: true })
        }
      }),
    ])

    if (!result.success) {
      return failure(
        result.error?.code ?? 'TOOL_ERROR',
        result.error?.message ?? '工具执行失败',
        elapsed()
      )
    }

    const serialized = JSON.stringify(result.output ?? null)
    return {
      success: true,
      resultMessage: truncate(serialized, MAX_RESULT_CHARS),
      summary: truncate(serialized, MAX_SUMMARY_CHARS),
      durationMs: elapsed(),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message === 'TOOL_ABORTED' || context.signal.aborted) {
      return failure('TOOL_ABORTED', '工具执行已被用户停止', elapsed())
    }
    if (timedOut) {
      return failure('TOOL_TIMEOUT', `工具执行超过 ${TOOL_TIMEOUT_MS / 1000} 秒`, elapsed())
    }
    return failure('TOOL_EXECUTION_ERROR', message, elapsed())
  }
}
