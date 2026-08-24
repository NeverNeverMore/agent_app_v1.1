import type { OpenAIToolDefinition, ToolDefinition } from './types'

import type { ToolMeta } from '../../shared/tools'

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>()

  register(tool: ToolDefinition): void {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(tool.name)) {
      throw new Error(`Invalid tool name: ${tool.name}`)
    }
    if (this.tools.has(tool.name)) {
      throw new Error(`Duplicate tool: ${tool.name}`)
    }
    this.tools.set(tool.name, tool)
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name)
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()]
  }

  /** 生成工具列表页所需的元数据（不含 execute） */
  listMeta(): ToolMeta[] {
    return this.list().map((tool) => ({
      name: tool.name,
      displayName: tool.displayName,
      description: tool.description,
      permission: tool.permission,
      source: tool.source,
      category: tool.category,
      ...(tool.requirements ? { requirements: tool.requirements } : {}),
    }))
  }

  /** read/write 工具暴露给模型；write 由 agentLoop 走用户确认流程，dangerous 不暴露 */
  listExecutable(): ToolDefinition[] {
    return this.list().filter((tool) => tool.permission !== 'dangerous')
  }

  toOpenAITools(): OpenAIToolDefinition[] {
    return this.listExecutable().map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }))
  }
}
