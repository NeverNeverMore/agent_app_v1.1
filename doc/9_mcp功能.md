# 9_MCP 功能

> 版本：MCP V1  
> 状态：已完成第一版

## 一、功能概述

项目现在可以作为 MCP Client，通过本地 `stdio` 方式连接外部 MCP Server。MCP Server 提供工具，客户端负责启动服务、发现工具、接收模型调用并返回结果。

```text
MCP 页面配置
    ↓
Electron 主进程启动本地 MCP Server
    ↓ stdio / JSON-RPC
发现 MCP tools
    ↓
注册到 Agent 工具列表
    ↓
模型调用 MCP 工具
    ↓
MCP Server 执行并返回结果
```

第一版只接入 MCP Tools，不包含 Resources、Prompts 和 Sampling。

## 二、服务配置

服务配置由 MCP 页面维护，也可以理解为一组 JSON 配置：

```json
{
  "id": "filesystem",
  "name": "文件服务",
  "command": "npx",
  "args": [
    "-y",
    "@modelcontextprotocol/server-filesystem",
    "D:\\Workspaces\\demo"
  ],
  "env": {
    "API_KEY": "your-key"
  },
  "enabled": true
}
```

字段说明：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 服务唯一标识，由应用生成 |
| `name` | string | 页面展示名称，也用于生成工具命名空间 |
| `command` | string | 启动 MCP Server 的本地命令，例如 `npx`、`node`、`python` |
| `args` | string[] | 启动命令参数，每行一个 |
| `env` | object | 服务启动时注入的环境变量 |
| `enabled` | boolean | 是否在应用启动时连接 |

配置保存到 Electron 的 `userData/mcp-servers.json`，不会写入当前项目目录。

页面同时提供“编辑 JSON”入口。可以直接修改完整的 `mcp-servers.json` 内容，保存时会校验 JSON 数组、服务名称、启动命令、参数、环境变量和启用状态。校验成功后立即保存并重载全部 MCP 服务；格式错误或字段类型错误时不会覆盖原配置。

直接编辑时建议保留以下结构：

```json
[
  {
    "id": "filesystem",
    "name": "文件服务",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "D:\\Workspaces\\demo"],
    "env": {},
    "enabled": true
  }
]
```

## 三、服务生命周期

- 应用启动时自动连接所有 `enabled: true` 的服务；
- 新增或编辑服务后立即保存并连接；
- 停用服务会关闭对应 MCP 进程并移除其工具；
- 删除服务会关闭进程、移除工具并删除配置；
- 服务启动失败或运行中断时标记为离线/错误，不影响其他服务和内置工具；
- MCP 页面提供手动重连；
- 页面显示连接状态、错误信息和工具数量。

## 四、工具注册

MCP 工具会转换为项目现有的 `ToolDefinition`，并使用命名空间避免名称冲突：

```text
mcp__服务名__工具名
```

例如服务 `filesystem` 提供 `read_file`，Agent 中的工具名为：

```text
mcp__filesystem__read_file
```

MCP 工具会自动出现在工具列表页，并显示来源为 `MCP 工具`。

## 五、权限映射

MCP 工具的权限依据 MCP annotations 映射到项目现有权限模型：

| MCP annotation | 项目权限 | 行为 |
|---|---|---|
| `readOnlyHint: true` | `read` | 自动执行 |
| `destructiveHint: true` | `dangerous` | 当前版本拒绝执行 |
| 未标注或其他情况 | `write` | `ask` 模式弹出审批卡片，`full` 模式直接执行 |

MCP write 工具复用现有审批流程，包括批准、拒绝、取消和参数 hash 校验。

## 六、工具调用流程

1. Agent 将已连接的 MCP 工具 schema 发送给模型；
2. 模型返回命名空间工具调用；
3. Agent 根据权限检查是否需要审批；
4. 通过 MCP `tools/call` 调用原始服务工具；
5. 将 MCP 返回的结构化内容或文本结果回填模型上下文；
6. 前端沿用现有工具卡片展示执行状态和结果摘要。

MCP 调用复用现有工具执行器的 30 秒超时、用户停止、结果截断和错误处理机制。

## 七、相关代码

- `electron/mcp.ts`：MCP 服务配置、stdio 连接、工具发现、工具转换和生命周期管理；
- `electron/tools/registry.ts`：动态注册和移除 MCP 工具；
- `electron/main.ts`：MCP 管理 IPC 和应用启动初始化；
- `electron/preload.ts`：安全暴露 MCP 管理接口；
- `src/components/McpManager.tsx`：MCP 服务管理页面；
- `shared/mcp.ts`：共享配置、状态和事件类型。

底层协议使用官方 `@modelcontextprotocol/sdk`，不手写 MCP JSON-RPC 实现。

## 八、安全边界与限制

- 第一版只支持本地 `stdio` MCP Server；
- 不支持远程 HTTP MCP 服务；
- MCP Server 以当前用户权限启动，配置外部命令和环境变量时应谨慎；
- 当前不提供 URL 或命令白名单；
- MCP 工具名称经过命名空间处理，避免覆盖内置工具；
- `dangerous` 工具默认拒绝；
- MCP Server 输出会进入模型上下文，仍受工具结果截断限制；
- 当前不支持服务工作目录配置，进程继承应用工作目录。

## 九、测试与验证

已验证：

- `npx tsc --noEmit` 通过；
- `npm test` 通过，包含现有 7 个测试和 UTF-8 编码检查；
- `npm run build` 通过，前端、主进程和 preload 均可构建。

人工验证建议：

1. 添加一个可用的本地 MCP Server，确认状态变为在线；
2. 在工具列表页确认 MCP 工具出现；
3. 在聊天中触发只读 MCP 工具；
4. 触发 write 工具，确认出现审批卡片；
5. 停用或删除服务，确认工具从 Agent 列表移除；
6. 使用错误 command，确认页面显示连接错误且内置工具仍可用。
