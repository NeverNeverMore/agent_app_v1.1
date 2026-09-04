import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js'
import type { McpServerConfig, McpServerEvent, McpServerInfo, McpServerStatus } from '../shared/mcp'
import type { ToolDefinition, ToolInputSchema } from './tools/types'
import type { ToolRegistry } from './tools/registry'

const CONFIG_FILE = 'mcp-servers.json'
const CLIENT_INFO = { name: 'sifang-chat-client', version: '0.1.0' }

interface Connection {
  config: McpServerConfig
  client: Client
  transport: StdioClientTransport
  info: McpServerInfo
  toolNames: string[]
}

function defaultInfo(config: McpServerConfig, status: McpServerStatus = 'disconnected'): McpServerInfo {
  return { ...config, status, toolCount: 0 }
}

function safeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'server'
}

function toSchema(tool: Tool): ToolInputSchema {
  const input = tool.inputSchema as { type?: string; properties?: Record<string, unknown>; required?: string[] }
  const properties: ToolInputSchema['properties'] = {}
  for (const [key, value] of Object.entries(input.properties ?? {})) {
    const item = value as { type?: string; description?: string; enum?: Array<string | number>; additionalProperties?: unknown }
    const type = item.type === 'number' || item.type === 'integer' || item.type === 'boolean' || item.type === 'object'
      ? item.type
      : 'string'
    properties[key] = {
      type,
      ...(item.description ? { description: item.description } : {}),
      ...(item.enum ? { enum: item.enum } : {}),
      ...(item.additionalProperties && typeof item.additionalProperties === 'object'
        ? { additionalProperties: { type: 'string' } }
        : {}),
    }
  }
  return { type: 'object', properties, ...(input.required ? { required: input.required } : {}) }
}

function resultToOutput(result: CallToolResult): unknown {
  if (result.structuredContent !== undefined) return result.structuredContent
  return result.content
    .map((item) => item.type === 'text' ? item.text : `[${item.type}]`)
    .join('\n')
}

function createMcpTool(connection: Connection, tool: Tool): ToolDefinition {
  const prefix = `mcp__${safeName(connection.config.name)}__`
  const name = `${prefix}${safeName(tool.name)}`
  const annotations = tool.annotations as { readOnlyHint?: boolean; destructiveHint?: boolean } | undefined
  const permission = annotations?.destructiveHint ? 'dangerous' : annotations?.readOnlyHint ? 'read' : 'write'
  return {
    name,
    displayName: `${connection.config.name}: ${tool.name}`,
    description: tool.description ?? `MCP 工具 ${tool.name}`,
    inputSchema: toSchema(tool),
    permission,
    source: 'mcp',
    category: 'MCP',
    requirements: `需要 MCP 服务「${connection.config.name}」在线`,
    execute: async (args, context) => {
      try {
        const result = await connection.client.callTool({ name: tool.name, arguments: args }, undefined, { signal: context.signal })
        if (result.isError) return { success: false, error: { code: 'MCP_TOOL_ERROR', message: JSON.stringify(resultToOutput(result)), retryable: true } }
        return { success: true, output: resultToOutput(result) }
      } catch (error) {
        return { success: false, error: { code: 'MCP_CALL_ERROR', message: error instanceof Error ? error.message : String(error), retryable: true } }
      }
    },
  }
}

export class McpManager {
  private readonly connections = new Map<string, Connection>()
  private configs: McpServerConfig[] = []
  private filePath = ''
  private listener: ((event: McpServerEvent) => void) | null = null

  setListener(listener: (event: McpServerEvent) => void): void { this.listener = listener }

  async initialize(userDataPath: string, registry: ToolRegistry): Promise<void> {
    this.filePath = path.join(userDataPath, CONFIG_FILE)
    try {
      const parsed = JSON.parse(await fs.readFile(this.filePath, 'utf8')) as McpServerConfig[]
      this.configs = Array.isArray(parsed) ? parsed.map((item) => ({ ...item, args: item.args ?? [], env: item.env ?? {}, enabled: item.enabled !== false })) : []
    } catch {
      this.configs = []
    }
    for (const config of this.configs) if (config.enabled) void this.connect(config.id, registry)
  }

  list(): McpServerInfo[] {
    return this.configs.map((config) => this.connections.get(config.id)?.info ?? defaultInfo(config, config.enabled ? 'disconnected' : 'disabled'))
  }

  async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true })
    await fs.writeFile(this.filePath, JSON.stringify(this.configs, null, 2), 'utf8')
  }

  getConfigJson(): string {
    return JSON.stringify(this.configs, null, 2)
  }

  getConfigPath(): string {
    return this.filePath
  }

  async replaceFromJson(raw: string, registry: ToolRegistry): Promise<McpServerInfo[]> {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error('MCP 配置不是合法 JSON')
    }
    if (!Array.isArray(parsed)) throw new Error('MCP 配置必须是 JSON 数组')
    const configs: McpServerConfig[] = parsed.map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`第 ${index + 1} 项必须是对象`)
      const value = item as Record<string, unknown>
      if (typeof value.name !== 'string' || !value.name.trim()) throw new Error(`第 ${index + 1} 项缺少 name`)
      if (typeof value.command !== 'string' || !value.command.trim()) throw new Error(`第 ${index + 1} 项缺少 command`)
      if (value.args !== undefined && (!Array.isArray(value.args) || value.args.some((arg) => typeof arg !== 'string'))) throw new Error(`第 ${index + 1} 项的 args 必须是字符串数组`)
      if (value.env !== undefined && (!value.env || typeof value.env !== 'object' || Array.isArray(value.env) || Object.values(value.env).some((env) => typeof env !== 'string'))) throw new Error(`第 ${index + 1} 项的 env 必须是字符串键值对象`)
      if (value.enabled !== undefined && typeof value.enabled !== 'boolean') throw new Error(`第 ${index + 1} 项的 enabled 必须是布尔值`)
      return {
        id: typeof value.id === 'string' && value.id ? value.id : randomUUID(),
        name: value.name.trim(), command: value.command.trim(),
        args: (value.args as string[] | undefined) ?? [],
        env: (value.env as Record<string, string> | undefined) ?? {},
        enabled: value.enabled !== false,
      }
    })
    if (new Set(configs.map((config) => config.id)).size !== configs.length) throw new Error('MCP 服务 id 不能重复')
    for (const connection of [...this.connections.values()]) await this.disconnect(connection.config.id, registry)
    this.configs = configs
    await this.save()
    for (const config of configs) if (config.enabled) void this.connect(config.id, registry)
    return this.list()
  }

  async upsert(input: Omit<McpServerConfig, 'id'> & { id?: string }, registry: ToolRegistry): Promise<McpServerInfo> {
    const config: McpServerConfig = { ...input, id: input.id || randomUUID(), args: input.args ?? [], env: input.env ?? {}, enabled: input.enabled !== false }
    const index = this.configs.findIndex((item) => item.id === config.id)
    if (index >= 0) this.configs[index] = config
    else this.configs.push(config)
    await this.disconnect(config.id, registry)
    await this.save()
    if (config.enabled) return this.connect(config.id, registry)
    const info = defaultInfo(config, 'disabled')
    this.emit({ type: 'updated', server: info })
    return info
  }

  async remove(id: string, registry: ToolRegistry): Promise<void> {
    await this.disconnect(id, registry)
    this.configs = this.configs.filter((item) => item.id !== id)
    await this.save()
    this.emit({ type: 'removed', serverId: id })
  }

  async setEnabled(id: string, enabled: boolean, registry: ToolRegistry): Promise<McpServerInfo> {
    const config = this.configs.find((item) => item.id === id)
    if (!config) throw new Error('MCP 服务不存在')
    config.enabled = enabled
    await this.disconnect(id, registry)
    await this.save()
    if (enabled) return this.connect(id, registry)
    const info = defaultInfo(config, 'disabled')
    this.emit({ type: 'updated', server: info })
    return info
  }

  async reconnect(id: string, registry: ToolRegistry): Promise<McpServerInfo> {
    await this.disconnect(id, registry)
    return this.connect(id, registry)
  }

  private async connect(id: string, registry: ToolRegistry): Promise<McpServerInfo> {
    const config = this.configs.find((item) => item.id === id)
    if (!config) throw new Error('MCP 服务不存在')
    const info = defaultInfo(config, 'connecting')
    const client = new Client(CLIENT_INFO, { capabilities: {} })
    const inheritedEnv = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
    const transport = new StdioClientTransport({ command: config.command, args: config.args, env: { ...inheritedEnv, ...config.env }, stderr: 'pipe' })
    const connection: Connection = { config, client, transport, info, toolNames: [] }
    this.connections.set(id, connection)
    this.emit({ type: 'updated', server: info })
    try {
      transport.onerror = (error) => this.markError(connection, error.message, registry)
      transport.onclose = () => this.markError(connection, 'MCP 服务已断开', registry)
      await client.connect(transport)
      const result = await client.listTools()
      const tools = result.tools ?? []
      for (const tool of tools) {
        const definition = createMcpTool(connection, tool)
        registry.register(definition)
        connection.toolNames.push(definition.name)
      }
      connection.info = { ...config, status: 'connected', toolCount: tools.length }
    } catch (error) {
      connection.info = { ...config, status: 'error', error: error instanceof Error ? error.message : String(error), toolCount: 0 }
      await transport.close().catch(() => undefined)
    }
    this.emit({ type: 'updated', server: connection.info })
    return connection.info
  }

  private async disconnect(id: string, registry: ToolRegistry): Promise<void> {
    const connection = this.connections.get(id)
    if (!connection) return
    for (const name of connection.toolNames) registry.unregister(name)
    await connection.client.close().catch(() => undefined)
    this.connections.delete(id)
  }

  private markError(connection: Connection, error: string, registry: ToolRegistry): void {
    for (const name of connection.toolNames) registry.unregister(name)
    connection.info = { ...connection.config, status: 'disconnected', error, toolCount: 0 }
    this.emit({ type: 'updated', server: connection.info })
  }

  private emit(event: McpServerEvent): void { this.listener?.(event) }
}
