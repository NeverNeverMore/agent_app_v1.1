import { useState } from 'react'
import { Check, Folder, FolderPlus, X } from 'lucide-react'
import type { Project } from '../types/chat'

interface ProjectEditorProps {
  project: Project
  onCancel: () => void
  onSave: (project: Pick<Project, 'name' | 'folder' | 'sourceFolders'>) => void
  onDelete: () => void
}

function folderLabel(folder: string) {
  return folder.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || folder
}

export function ProjectEditor({ project, onCancel, onSave, onDelete }: ProjectEditorProps) {
  const [name, setName] = useState(project.name)
  const [primaryFolder, setPrimaryFolder] = useState(project.folder)
  const [sourceFolders, setSourceFolders] = useState(project.sourceFolders?.length ? project.sourceFolders : (project.folder ? [project.folder] : []))
  const [error, setError] = useState('')

  const addFolder = async () => {
    const folder = await window.electronAPI?.selectFolder()
    if (!folder) return
    setSourceFolders((current) => current.some((item) => item.toLowerCase() === folder.toLowerCase()) ? current : [...current, folder])
    setError('')
  }

  const save = () => {
    const trimmed = name.trim()
    if (!trimmed) { setError('请输入项目名称'); return }
    if (!primaryFolder || !sourceFolders.includes(primaryFolder)) { setError('请设置有效的主要文件夹'); return }
    onSave({ name: trimmed, folder: primaryFolder, sourceFolders: [...new Set(sourceFolders)] })
  }

  return <div className="project-editor-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
    <section className="project-editor" role="dialog" aria-modal="true" aria-labelledby="project-editor-title">
      <header className="project-editor-header"><h2 id="project-editor-title">编辑项目</h2><button type="button" className="icon-button" onClick={onCancel} aria-label="关闭"><X size={20} /></button></header>
      <div className="project-editor-body">
        <label className="project-name-field"><Folder size={19} /><input autoFocus value={name} onChange={(event) => setName(event.target.value)} aria-label="项目名称" /></label>
        <div className="project-source-heading">项目文件夹</div>
        <div className="project-source-list">
          {sourceFolders.map((folder) => <div className="project-source-row" key={folder}>
            <Folder size={19} />
            <span className="project-source-name" title={folder}>{folderLabel(folder)}</span>
            {folder === primaryFolder
              ? <span className="project-primary-badge">主要</span>
              : <button type="button" className="project-set-primary" onClick={() => setPrimaryFolder(folder)}>设为主要</button>}
            <button type="button" className="project-source-remove" aria-label={`移除文件夹 ${folderLabel(folder)}`} title={folder === primaryFolder ? '主要文件夹不可移除' : '移除文件夹'} disabled={folder === primaryFolder} onClick={() => setSourceFolders((current) => current.filter((item) => item !== folder))}><X size={18} /></button>
          </div>)}
          <button type="button" className="project-add-folder" onClick={() => void addFolder()}><FolderPlus size={20} /><span>添加文件夹</span></button>
        </div>
        {error && <p className="project-editor-error" role="alert">{error}</p>}
      </div>
      <footer className="project-editor-footer"><button type="button" className="project-remove-action" onClick={onDelete}>删除项目</button><div className="project-editor-actions"><button type="button" className="project-cancel" onClick={onCancel}>取消</button><button type="button" className="project-save" onClick={save}><Check size={16} />保存</button></div></footer>
    </section>
  </div>
}
