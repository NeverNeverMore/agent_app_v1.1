import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type {
  ApprovalPreview,
  ApprovalRequest,
  ApprovalStatus,
} from '../shared/approvals'
import type { ToolPermission } from '../shared/tools'

const APPROVAL_TTL_MS = 5 * 60 * 1000

interface ApprovalEntry {
  record: ApprovalRequest
  resolve: (status: ApprovalStatus) => void
  timer: NodeJS.Timeout
  emitUpdate: (status: ApprovalStatus) => void
}

/** 内存审批表：审批单消费一次即销毁，不可复用 */
const entries = new Map<string, ApprovalEntry>()
let storePath: string | null = null

function persistPending(): void {
  if (!storePath) return
  const records = [...entries.values()].map((entry) => entry.record)
  try {
    fs.mkdirSync(path.dirname(storePath), { recursive: true })
    fs.writeFileSync(storePath, JSON.stringify(records, null, 2), 'utf8')
  } catch {
    // 审批不能因日志落盘失败而阻塞主流程
  }
}

/** 初始化审批存储。应用重启后旧 Promise 已不存在，因此清理旧 pending。 */
export function configureApprovalStore(filePath: string): void {
  storePath = filePath
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch {
    // 忽略清理失败，后续仍可继续工作
  }
  persistPending()
}

export function listPendingApprovals(): ApprovalRequest[] {
  const now = Date.now()
  for (const entry of [...entries.values()]) {
    if (now > entry.record.expiresAt) settle(entry.record.id, 'expired')
  }
  return [...entries.values()].map((entry) => ({ ...entry.record }))
}

export function hashToolArguments(toolName: string, args: string): string {
  return createHash('sha256').update(`${toolName}\n${args}`).digest('hex')
}

function settle(id: string, status: ApprovalStatus): boolean {
  const entry = entries.get(id)
  if (!entry || entry.record.status !== 'pending') return false
  entry.record.status = status
  clearTimeout(entry.timer)
  entries.delete(id)
  persistPending()
  entry.emitUpdate(status)
  entry.resolve(status)
  return true
}

export interface CreateApprovalOptions {
  requestId: number
  conversationId: string
  toolCallId: string
  toolName: string
  arguments: string
  permission: ToolPermission
  preview?: ApprovalPreview
  emitUpdate: (status: ApprovalStatus) => void
}

/** 创建审批单并返回决策 Promise，agentLoop 挂起等待用户批准/拒绝/过期 */
export function createApproval(options: CreateApprovalOptions): {
  request: ApprovalRequest
  decision: Promise<ApprovalStatus>
} {
  const now = Date.now()
  const record: ApprovalRequest = {
    id: randomUUID(),
    requestId: options.requestId,
    conversationId: options.conversationId,
    toolCallId: options.toolCallId,
    toolName: options.toolName,
    arguments: options.arguments,
    argumentsHash: hashToolArguments(options.toolName, options.arguments),
    permission: options.permission,
    status: 'pending',
    createdAt: now,
    expiresAt: now + APPROVAL_TTL_MS,
    ...(options.preview ? { preview: options.preview } : {}),
  }

  const decision = new Promise<ApprovalStatus>((resolve) => {
    const timer = setTimeout(() => {
      settle(record.id, 'expired')
    }, APPROVAL_TTL_MS)
    entries.set(record.id, {
      record,
      resolve,
      timer,
      emitUpdate: options.emitUpdate,
    })
    persistPending()
  })

  return { request: record, decision }
}

export interface ApprovalDecisionResult {
  ok: boolean
  error?: string
}

export function approveApproval(
  id: string,
  argumentsHash: string
): ApprovalDecisionResult {
  const entry = entries.get(id)
  if (!entry) return { ok: false, error: '审批不存在或已被处理' }
  if (Date.now() > entry.record.expiresAt) {
    settle(id, 'expired')
    return { ok: false, error: '审批已过期' }
  }
  if (entry.record.argumentsHash !== argumentsHash) {
    return { ok: false, error: '参数校验不一致，已拒绝批准' }
  }
  settle(id, 'approved')
  return { ok: true }
}

export function rejectApproval(id: string): ApprovalDecisionResult {
  const entry = entries.get(id)
  if (!entry) return { ok: false, error: '审批不存在或已被处理' }
  settle(id, 'rejected')
  return { ok: true }
}

/** 用户停止 / 请求结束时，取消该请求下所有 pending 审批 */
export function cancelApprovalsForRequest(requestId: number): void {
  for (const entry of [...entries.values()]) {
    if (entry.record.requestId === requestId) {
      settle(entry.record.id, 'cancelled')
    }
  }
}
