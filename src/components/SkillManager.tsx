import { useEffect, useState } from 'react'
import { RefreshCw, Sparkles } from 'lucide-react'
import type { SkillInfo, SkillSource } from '../../shared/skills'

interface SkillManagerProps {
  projectFolder: string
  enabledSkillIds: string[]
  onEnabledSkillIdsChange: (ids: string[]) => void
}

type Filter = 'all' | SkillSource

export function SkillManager({ projectFolder, enabledSkillIds, onEnabledSkillIdsChange }: SkillManagerProps) {
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [directories, setDirectories] = useState({ global: '', project: '' })
  const [filter, setFilter] = useState<Filter>('all')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const load = async (reload = false) => {
    setLoading(true)
    try {
      const [items, paths] = await Promise.all([
        reload ? window.electronAPI.reloadSkills(projectFolder) : window.electronAPI.listSkills(projectFolder),
        window.electronAPI.getSkillDirectories(projectFolder),
      ])
      setSkills(items)
      setDirectories(paths)
      const valid = new Set(items.filter((skill) => !skill.error).map((skill) => skill.id))
      const next = enabledSkillIds.filter((id) => valid.has(id))
      if (next.length !== enabledSkillIds.length) onEnabledSkillIdsChange(next)
      setError('')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [projectFolder])

  const toggle = (skill: SkillInfo) => {
    if (skill.error) return
    onEnabledSkillIdsChange(enabledSkillIds.includes(skill.id)
      ? enabledSkillIds.filter((id) => id !== skill.id)
      : [...enabledSkillIds, skill.id])
  }

  const visible = skills.filter((skill) => filter === 'all' || skill.source === filter)

  return (
    <div className="skills-panel">
      <div className="skills-panel-header">
        <div><h2>Skills</h2><p>启用后，Skill 的提示词规范会应用到当前会话。</p></div>
        <button type="button" className="secondary-button" onClick={() => void load(true)} disabled={loading} title="刷新 Skill"><RefreshCw className={loading ? 'spin' : ''} size={16} />刷新</button>
      </div>
      <div className="skills-paths"><p>全局目录：<code>{directories.global}</code></p>{projectFolder && <p>项目目录：<code>{directories.project}</code></p>}</div>
      <div className="skills-filters" role="group" aria-label="Skill 来源筛选">
        {([['all', '全部'], ['global', '全局'], ['project', '项目']] as const).map(([value, label]) => <button key={value} type="button" className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>)}
      </div>
      {error && <div className="mcp-error">{error}</div>}
      {!loading && visible.length === 0 && <div className="placeholder-panel"><Sparkles size={28} /><h3>还没有可用 Skill</h3><p>在上方目录创建 Skill 文件后点击刷新。</p></div>}
      <div className="skills-list">
        {visible.map((skill) => <article className={`skill-card ${skill.error ? 'skill-card-error' : ''}`} key={skill.id}>
          <div className="skill-card-header"><div><strong>{skill.name}</strong><span className={`skill-source ${skill.source}`}>{skill.source === 'global' ? '全局' : '项目'}</span></div><label className="skill-toggle"><input type="checkbox" checked={enabledSkillIds.includes(skill.id)} disabled={Boolean(skill.error)} onChange={() => toggle(skill)} /><span>启用</span></label></div>
          {skill.description && <p>{skill.description}</p>}
          {skill.error ? <small className="skill-error">{skill.error}</small> : <div className="skill-meta">{skill.version && <span>v{skill.version}</span>}{skill.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
        </article>)}
      </div>
    </div>
  )
}
