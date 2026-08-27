export type ToolPermission = 'read' | 'write' | 'dangerous'

import type { ApprovalPreview, ApprovalStatus } from './approvals'

export type ToolSource = 'builtin' | 'mcp'

/** 工具列表页展示的元数据（由主进程注册表动态生成） */
export interface ToolMeta {
  name: string
  displayName: string
  description: string
  permission: ToolPermission
  source: ToolSource
  category: string
  /** 使用条件说明，例如「需要关联项目文件夹」 */
  requirements?: string
}

export type ToolCallStatus = 'running' | 'success' | 'failed' | 'cancelled'

/** 写权限工具的用户确认记录，随 toolCalls 一起持久化 */
export interface ToolCallApproval {
  id: string
  permission: ToolPermission
  status: ApprovalStatus
  argumentsHash: string
  preview?: ApprovalPreview
}

export interface ToolCallRecord {
  id: string
  name: string
  arguments: string
  status: ToolCallStatus
  summary?: string
  durationMs?: number
  approval?: ToolCallApproval
}

export type ToolStreamEvent =
  | { type: 'start'; callId: string; name: string; arguments: string }
  | {
      type: 'result'
      callId: string
      status: 'success' | 'failed'
      summary: string
      durationMs: number
    }
