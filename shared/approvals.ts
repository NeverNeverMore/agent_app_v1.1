import type { ToolPermission } from './tools'

export type ApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'cancelled'

/** 确认卡片展示所需的预览信息（由工具的 describeApproval 生成） */
export interface ApprovalPreview {
  /** 目标文件相对路径 */
  targetPath?: string
  /** 是否为覆盖已有文件 */
  overwrite?: boolean
  /** 写入内容字符数 */
  contentLength?: number
  /** 内容摘要（前几百字符） */
  contentPreview?: string
}

export interface ApprovalRequest {
  id: string
  /** 关联的 send-message 请求 id */
  requestId: number
  conversationId: string
  toolCallId: string
  toolName: string
  arguments: string
  /** sha256(toolName + arguments)，批准与执行前校验，防止篡改参数 */
  argumentsHash: string
  permission: ToolPermission
  status: ApprovalStatus
  createdAt: number
  expiresAt: number
  preview?: ApprovalPreview
}

export type ApprovalStreamEvent =
  | { type: 'request'; request: ApprovalRequest }
  | { type: 'update'; approvalId: string; status: ApprovalStatus }
