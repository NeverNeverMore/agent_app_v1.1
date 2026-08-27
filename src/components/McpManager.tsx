import { useEffect, useState } from 'react'
import { Code2, Pencil, Plug, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import type { McpServerConfig, McpServerInfo } from '../../shared/mcp'

type FormState = Omit<McpServerConfig, 'id'> & { id?: string }

const emptyForm: FormState = { name: '', command: '', args: [], env: {}, enabled: true }

function parseLines(value: string): string[] {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
}

function parseEnv(value: string): Record<string, string> {
  return Object.fromEntries(parseLines(value).map((line) => {
    const index = line.indexOf('=')
    return index > 0 ? [line.slice(0, index).trim(), line.slice(index + 1)] : [line, '']
  }))
}

function envText(env: Record<string, string>): string {
  return Object.entries(env).map(([key, value]) => `${key}=${value}`).join('\n')
}

function statusLabel(status: McpServerInfo['status']): string {
  return { disabled: '已停用', connecting: '连接中', connected: '在线', disconnected: '已断开', error: '错误' }[status]
}

export function McpManager() {
  const [servers, setServers] = useState<McpServerInfo[]>([])
  const [form, setForm] = useState<FormState | null>(null)
  const [argsText, setArgsText] = useState('')
  const [envTextValue, setEnvTextValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [jsonMode, setJsonMode] = useState(false)
  const [jsonValue, setJsonValue] = useState('')
  const [jsonLoading, setJsonLoading] = useState(false)
  const [configPath, setConfigPath] = useState('')

  const load = async () => {
    try { setServers(await window.electronAPI.listMcpServers()); setError(null) }
    catch (err) { setError(err instanceof Error ? err.message : String(err)) }
  }

  useEffect(() => {
    void load()
    void window.electronAPI.getMcpConfigPath().then(setConfigPath).catch(() => undefined)
    return window.electronAPI.onMcpServerEvent((_event, event) => {
      if (event.type === 'removed') setServers((items) => items.filter((item) => item.id !== event.serverId))
      else setServers((items) => items.some((item) => item.id === event.server.id)
        ? items.map((item) => item.id === event.server.id ? event.server : item)
        : [...items, event.server])
    })
  }, [])

  const openNew = () => { setForm(emptyForm); setArgsText(''); setEnvTextValue(''); setError(null) }
  const openJson = async () => {
    setJsonMode(true)
    setJsonLoading(true)
    setError(null)
    try { setJsonValue(await window.electronAPI.getMcpConfigJson()) }
    catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    finally { setJsonLoading(false) }
  }
  const saveJson = async () => {
    try { await window.electronAPI.saveMcpConfigJson(jsonValue); setJsonMode(false); await load() }
    catch (err) { setError(err instanceof Error ? err.message : String(err)) }
  }
  const openEdit = (server: McpServerInfo) => {
    setForm(server); setArgsText(server.args.join('\n')); setEnvTextValue(envText(server.env)); setError(null)
  }
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form?.name.trim() || !form.command.trim()) { setError('服务名称和启动命令不能为空'); return }
    try {
      await window.electronAPI.saveMcpServer({ ...form, name: form.name.trim(), command: form.command.trim(), args: parseLines(argsText), env: parseEnv(envTextValue) })
      setForm(null); await load()
    } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
  }
  const remove = async (id: string) => {
    if (!window.confirm('确定删除这个 MCP 服务吗？')) return
    await window.electronAPI.deleteMcpServer(id); await load()
  }
  const toggle = async (server: McpServerInfo) => { await window.electronAPI.setMcpServerEnabled({ id: server.id, enabled: !server.enabled }); await load() }
  const reconnect = async (id: string) => { await window.electronAPI.reconnectMcpServer(id); await load() }

  return (
    <div className="mcp-panel">
      <div className="mcp-panel-header">
        <div><h2>MCP 服务</h2><p>管理本地 stdio MCP Server，启用后工具会自动加入 Agent。</p></div>
        <div className="mcp-panel-actions"><button type="button" className="secondary-button" onClick={() => void openJson}><Code2 size={16} />编辑 JSON</button><button type="button" className="primary-button" onClick={openNew}><Plus size={16} />新增服务</button></div>
      </div>
      {configPath && <p className="mcp-config-path">配置文件：<code>{configPath}</code></p>}
      {error && <div className="mcp-error">{error}</div>}
      {servers.length === 0 && <div className="placeholder-panel"><Plug size={28} /><h3>还没有 MCP 服务</h3><p>添加一个本地 MCP Server 开始使用。</p></div>}
      <div className="mcp-server-list">
        {servers.map((server) => (
          <article className="mcp-server-card" key={server.id}>
            <div className="mcp-server-main"><Plug size={18} /><div><strong>{server.name}</strong><code>{server.command} {server.args.join(' ')}</code></div></div>
            <div className={`mcp-status ${server.status}`}><span />{statusLabel(server.status)} · {server.toolCount} 个工具</div>
            {server.error && <p className="mcp-server-error">{server.error}</p>}
            <div className="mcp-server-actions">
              <button type="button" onClick={() => toggle(server)}>{server.enabled ? '停用' : '启用'}</button>
              <button type="button" onClick={() => openEdit(server)}><Pencil size={14} />编辑</button>
              <button type="button" onClick={() => void reconnect(server.id)}><RefreshCw size={14} />重连</button>
              <button type="button" className="danger-button" onClick={() => void remove(server.id)}><Trash2 size={14} />删除</button>
            </div>
          </article>
        ))}
      </div>
      {form && <div className="mcp-form-overlay"><form className="mcp-form" onSubmit={save}><div className="mcp-form-header"><h3>{form.id ? '编辑 MCP 服务' : '新增 MCP 服务'}</h3><button type="button" className="icon-button" onClick={() => setForm(null)}><X size={18} /></button></div>
        <label>名称<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label>启动命令<input value={form.command} onChange={(e) => setForm({ ...form, command: e.target.value })} placeholder="例如 npx、python 或 node" /></label>
        <label>参数（每行一个）<textarea value={argsText} onChange={(e) => setArgsText(e.target.value)} rows={4} /></label>
        <label>环境变量（每行 KEY=VALUE）<textarea value={envTextValue} onChange={(e) => setEnvTextValue(e.target.value)} rows={4} /></label>
        <label className="mcp-checkbox"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />启用服务</label>
        <div className="mcp-form-actions"><button type="button" onClick={() => setForm(null)}>取消</button><button type="submit" className="primary-button">保存并连接</button></div>
      </form></div>}
      {jsonMode && <div className="mcp-form-overlay"><div className="mcp-form mcp-json-form"><div className="mcp-form-header"><h3>编辑 mcp-servers.json</h3><button type="button" className="icon-button" onClick={() => setJsonMode(false)}><X size={18} /></button></div><p className="mcp-json-help">配置必须是 JSON 数组。每项包含 name、command、args、env、enabled。</p>{jsonLoading ? <p className="mcp-json-help">正在读取配置…</p> : <textarea className="mcp-json-editor" value={jsonValue} onChange={(e) => setJsonValue(e.target.value)} spellCheck={false} />}<div className="mcp-form-actions"><button type="button" onClick={() => setJsonMode(false)}>取消</button><button type="button" className="primary-button" disabled={jsonLoading} onClick={() => void saveJson()}>保存并重载</button></div></div></div>}
    </div>
  )
}
