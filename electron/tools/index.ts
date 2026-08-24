import { createBuiltinTools } from './builtins'
import { ToolRegistry } from './registry'

let sharedRegistry: ToolRegistry | null = null

/** 主进程共享的工具注册表单例：agentLoop 与 list-tools 接口复用 */
export function getToolRegistry(): ToolRegistry {
  if (!sharedRegistry) {
    const registry = new ToolRegistry()
    for (const tool of createBuiltinTools()) registry.register(tool)
    sharedRegistry = registry
  }
  return sharedRegistry
}
