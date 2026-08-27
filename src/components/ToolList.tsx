import { useEffect, useState } from 'react'
import { Wrench } from 'lucide-react'
import type { ToolMeta, ToolPermission, ToolSource } from '../../shared/tools'

const sourceLabels: Record<ToolSource, string> = { builtin: '内置工具', mcp: 'MCP 工具' }
const permissionLabels: Record<ToolPermission, string> = { read: '只读', write: '写入', dangerous: '高危' }

function ToolCard({ tool }: { tool: ToolMeta }) {
  return <div className="tool-meta-card">
    <div className="tool-meta-header">
      <span className="tool-meta-display-name">{tool.displayName}</span>
      <span className="tool-meta-name">{tool.name}</span>
      <span className={`tool-meta-permission ${tool.permission}`}>{permissionLabels[tool.permission]}</span>
    </div>
    <p className="tool-meta-description">{tool.description}</p>
    <div className="tool-meta-footer">
      <span className="tool-meta-category">{tool.category}</span>
      {tool.requirements && <span className="tool-meta-requirements">{tool.requirements}</span>}
    </div>
  </div>
}

export function ToolList() {
  const [tools, setTools] = useState<ToolMeta[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.electronAPI.listTools().then((list) => {
      if (!cancelled) setTools(list)
    }).catch((err: unknown) => {
      if (!cancelled) setError(err instanceof Error ? err.message : String(err))
    })
    return () => { cancelled = true }
  }, [])

  if (error) return <div className="placeholder-panel"><h2>工具</h2><p>加载工具列表失败：{error}</p></div>
  if (!tools) return <div className="placeholder-panel"><h2>工具</h2><p>加载中…</p></div>

  const groups = new Map<ToolSource, ToolMeta[]>()
  for (const tool of tools) groups.set(tool.source, [...(groups.get(tool.source) ?? []), tool])
  return <div className="tools-panel">
    {[...groups.entries()].map(([source, groupTools]) => <section key={source} className="tools-group">
      <h2 className="tools-group-title"><Wrench size={16} />{sourceLabels[source]}<span className="tools-group-count">{groupTools.length}</span></h2>
      <div className="tools-grid">{groupTools.map((tool) => <ToolCard key={tool.name} tool={tool} />)}</div>
    </section>)}
  </div>
}
