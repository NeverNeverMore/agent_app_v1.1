import type { ToolPermission } from '../../shared/tools'

import type { ApprovalPreview } from '../../shared/approvals'
import type { ToolSource } from '../../shared/tools'

export interface ToolSchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'object'
  description?: string
  enum?: Array<string | number>
  additionalProperties?: ToolSchemaProperty
}

export interface ToolInputSchema {
  type: 'object'
  properties: Record<string, ToolSchemaProperty>
  required?: string[]
}

import type { PermissionMode } from '../../shared/types'

export interface ToolContext {
  projectFolder: string
  sourceFolders: string[]
  permissionMode: PermissionMode
  signal: AbortSignal
}

export interface ToolErrorInfo {
  code: string
  message: string
  retryable: boolean
}

export interface ToolResult {
  success: boolean
  output?: unknown
  error?: ToolErrorInfo
}

export interface ToolDefinition {
  name: string
  /** 展示名，用于工具列表页 */
  displayName: string
  description: string
  inputSchema: ToolInputSchema
  permission: ToolPermission
  source: ToolSource
  /** 分类，用于工具列表页分组展示 */
  category: string
  /** 使用条件说明，例如「需要关联项目文件夹」 */
  requirements?: string
  /** write 工具可选实现：生成确认卡片上的预览信息 */
  describeApproval?: (
    args: Record<string, unknown>,
    context: ToolContext
  ) => Promise<ApprovalPreview>
  execute: (
    args: Record<string, unknown>,
    context: ToolContext
  ) => Promise<ToolResult>
}

export interface OpenAIToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: ToolInputSchema
  }
}
