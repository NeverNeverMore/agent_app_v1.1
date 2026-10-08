import { useEffect, useRef, useState } from 'react'
import type { DragEvent, FormEvent } from 'react'
import { BookOpen, FileUp, Folder, MoreHorizontal, Pencil, Pin, Plus, Search, Save, Trash2, X } from 'lucide-react'
import type { KnowledgeFolder, KnowledgeNote, KnowledgeNoteSummary } from '../../shared/knowledge'

const ALL_NOTES = '全部笔记'
const DEFAULT_FOLDER = '默认'

function formatTime(timestamp: number) { return new Date(timestamp).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) }

export function KnowledgeBase() {
  const [notes, setNotes] = useState<KnowledgeNoteSummary[]>([])
  const [folders, setFolders] = useState<KnowledgeFolder[]>([])
  const [selected, setSelected] = useState<KnowledgeNote | null>(null)
  const [activeFolder, setActiveFolder] = useState(ALL_NOTES)
  const [query, setQuery] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [folder, setFolder] = useState(DEFAULT_FOLDER)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [editingFolderName, setEditingFolderName] = useState('')
  const [menuFolderId, setMenuFolderId] = useState<string | null>(null)
  const [deleteFolder, setDeleteFolder] = useState<KnowledgeFolder | null>(null)
  const [noteMenuId, setNoteMenuId] = useState<string | null>(null)
  const [noteAction, setNoteAction] = useState<'move' | 'copy' | null>(null)
  const [actionNote, setActionNote] = useState<KnowledgeNoteSummary | null>(null)
  const [targetFolder, setTargetFolder] = useState('')
  const [deleteNote, setDeleteNote] = useState<KnowledgeNoteSummary | null>(null)
  const knowledgePanelRef = useRef<HTMLElement>(null)
  const searchTimer = useRef<number | undefined>(undefined)
  const visibleNotes = activeFolder === ALL_NOTES ? notes : notes.filter((note) => note.folder === activeFolder)

  const load = async (nextQuery = query) => {
    setLoading(true)
    try {
      const [nextNotes, nextFolders] = await Promise.all([window.electronAPI.listKnowledgeNotes(nextQuery), window.electronAPI.listKnowledgeFolders()])
      setNotes(nextNotes)
      setFolders(nextFolders)
      if (activeFolder !== ALL_NOTES && !nextFolders.some((item) => item.name === activeFolder)) setActiveFolder(DEFAULT_FOLDER)
      if (selected && !nextNotes.some((item) => item.id === selected.id)) { setSelected(null); setTitle(''); setContent('') }
      setError(null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setLoading(false) }
  }

  const selectNote = async (id: string) => {
    const note = await window.electronAPI.getKnowledgeNote(id)
    if (!note) return
    setSelected(note); setTitle(note.title); setContent(note.content); setFolder(note.folder)
  }

  useEffect(() => { void load('') }, [])
  useEffect(() => { window.clearTimeout(searchTimer.current); searchTimer.current = window.setTimeout(() => { void load(query) }, 180); return () => window.clearTimeout(searchTimer.current) }, [query])
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element) || !knowledgePanelRef.current?.contains(target)) return
      if (target.closest('.knowledge-note-menu, .knowledge-note-menu-button, .knowledge-folder-menu, .knowledge-folder-menu-button')) return
      setNoteMenuId(null)
      setMenuFolderId(null)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  const clearEditor = () => { setSelected(null); setTitle(''); setContent(''); setFolder(activeFolder === ALL_NOTES ? DEFAULT_FOLDER : activeFolder) }
  const newNote = () => { setSelected(null); setTitle('未命名笔记'); setContent(''); setFolder(activeFolder === ALL_NOTES ? DEFAULT_FOLDER : activeFolder); setError(null) }
  const chooseFolder = (name: string) => { setActiveFolder(name); if (selected && name !== ALL_NOTES && selected.folder !== name) clearEditor() }

  const save = async () => {
    if (!title.trim()) { setError('请输入笔记标题'); return }
    setSaving(true)
    try {
      const note = selected ? await window.electronAPI.updateKnowledgeNote({ id: selected.id, title, content, folder }) : await window.electronAPI.createKnowledgeNote({ title, content, folder })
      if (note) { setSelected(note); setTitle(note.title); setContent(note.content); setFolder(note.folder) }
      await load(query)
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setSaving(false) }
  }

  const importFiles = async (paths?: string[]) => {
    const targetFolder = activeFolder === ALL_NOTES ? DEFAULT_FOLDER : activeFolder
    try { const filePaths = paths ?? await window.electronAPI.selectKnowledgeFiles(); if (!filePaths.length) return; await window.electronAPI.importKnowledgeFiles(filePaths, targetFolder); await load(query) }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }

  const createFolder = async (event: FormEvent) => {
    event.preventDefault()
    try {
      const created = await window.electronAPI.createKnowledgeFolder({ name: folderName })
      setFolderDialogOpen(false); setFolderName(''); setActiveFolder(created.name); setSelected(null); setTitle('未命名笔记'); setContent(''); setFolder(created.name); await load(query)
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }

  const beginRename = (item: KnowledgeFolder) => { setMenuFolderId(null); setEditingFolderId(item.id); setEditingFolderName(item.name) }
  const finishRename = async (cancel = false) => {
    if (!editingFolderId) return
    const id = editingFolderId; setEditingFolderId(null); if (cancel) return
    try { const updated = await window.electronAPI.renameKnowledgeFolder(id, editingFolderName); if (updated && activeFolder !== ALL_NOTES && activeFolder !== DEFAULT_FOLDER) setActiveFolder(updated.name); await load(query) }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }
  const togglePinned = async (item: KnowledgeFolder) => { setMenuFolderId(null); try { await window.electronAPI.setKnowledgeFolderPinned(item.id, !item.pinned); await load(query) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } }
  const confirmDeleteFolder = async () => { if (!deleteFolder) return; try { await window.electronAPI.deleteKnowledgeFolder(deleteFolder.id); setDeleteFolder(null); chooseFolder(DEFAULT_FOLDER); await load(query) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } }
  const beginNoteAction = (note: KnowledgeNoteSummary, action: 'move' | 'copy') => {
    setNoteMenuId(null)
    setActionNote(note)
    setNoteAction(action)
    setTargetFolder(folders.find((item) => item.name !== note.folder)?.name ?? '')
  }
  const applyNoteAction = async () => {
    if (!actionNote || !noteAction || !targetFolder) return
    try {
      const result = noteAction === 'move'
        ? await window.electronAPI.moveKnowledgeNote(actionNote.id, targetFolder)
        : await window.electronAPI.copyKnowledgeNote(actionNote.id, targetFolder)
      setNoteAction(null)
      setActionNote(null)
      if (result && noteAction === 'move') {
        setSelected(null)
        setTitle('')
        setContent('')
        setActiveFolder(targetFolder)
        await load(query)
        await selectNote(result.id)
      } else {
        await load(query)
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }
  const confirmDeleteNote = async () => {
    if (!deleteNote) return
    try {
      await window.electronAPI.deleteKnowledgeNote(deleteNote.id)
      if (selected?.id === deleteNote.id) clearEditor()
      setDeleteNote(null)
      await load(query)
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }
  const onDrop = (event: DragEvent) => { event.preventDefault(); setIsDragging(false); const paths = Array.from(event.dataTransfer.files).map((file) => window.electronAPI.getFilePath(file)).filter(Boolean); if (paths.length) void importFiles(paths) }

  return <section ref={knowledgePanelRef} className={`knowledge-panel ${isDragging ? 'dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setIsDragging(true) }} onDragLeave={() => setIsDragging(false)} onDrop={onDrop}>
    <header className="knowledge-header"><div className="knowledge-heading"><BookOpen size={22} /><div><h2>知识库</h2><p>本地 Markdown 笔记与导入文件</p></div></div><div className="knowledge-actions"><button type="button" className="secondary-button" onClick={() => void importFiles()}><FileUp size={16} />导入文件</button><button type="button" className="primary-button" onClick={newNote}><Plus size={16} />新建笔记</button></div></header>
    <div className="knowledge-layout">
      <aside className="knowledge-folders"><div className="knowledge-subtitle">知识库</div><button type="button" className={`knowledge-nav ${activeFolder === ALL_NOTES ? 'active' : ''}`} onClick={() => chooseFolder(ALL_NOTES)}><BookOpen size={15} />全部笔记<span>{notes.length}</span></button><div className="knowledge-subtitle folder-title">文件夹 <button type="button" className="knowledge-folder-add" onClick={() => setFolderDialogOpen(true)} aria-label="新建文件夹" title="新建文件夹"><Plus size={14} /></button></div>{folders.map((item) => <div className={`knowledge-folder-row ${activeFolder === item.name ? 'active' : ''}`} key={item.id}>{editingFolderId === item.id ? <input className="knowledge-folder-rename" autoFocus value={editingFolderName} onChange={(event) => setEditingFolderName(event.target.value)} onBlur={() => void finishRename()} onKeyDown={(event) => { if (event.key === 'Enter') void finishRename(); if (event.key === 'Escape') void finishRename(true) }} /> : <button type="button" className="knowledge-nav" onClick={() => chooseFolder(item.name)}><Folder size={15} />{item.name}<span>{notes.filter((note) => note.folder === item.name).length}</span></button>}{!item.isDefault && editingFolderId !== item.id && <button type="button" className="knowledge-folder-menu-button" onClick={() => setMenuFolderId(menuFolderId === item.id ? null : item.id)} aria-label={`编辑文件夹 ${item.name}`}><MoreHorizontal size={16} /></button>}{menuFolderId === item.id && <div className="knowledge-folder-menu"><button type="button" onClick={() => void togglePinned(item)}><Pin size={14} />{item.pinned ? '取消置顶' : '置顶'}</button><button type="button" onClick={() => beginRename(item)}><Pencil size={14} />重命名</button><button type="button" className="danger" onClick={() => { setMenuFolderId(null); setDeleteFolder(item) }}><Trash2 size={14} />删除</button></div>}</div>)}</aside>
      <section className="knowledge-notes"><label className="knowledge-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题或内容" /></label>{loading ? <div className="knowledge-empty">加载中...</div> : visibleNotes.length ? visibleNotes.map((note) => <div className={`knowledge-note-row ${selected?.id === note.id ? 'active' : ''}`} key={note.id}><button type="button" className="knowledge-note-item" onClick={() => void selectNote(note.id)}><strong>{note.title}</strong><small>{note.sourceType ?? 'Markdown'} · {formatTime(note.updatedAt)}</small></button><button type="button" className="knowledge-note-menu-button" aria-label={`文档操作 ${note.title}`} aria-expanded={noteMenuId === note.id} onClick={() => setNoteMenuId(noteMenuId === note.id ? null : note.id)}><MoreHorizontal size={17} /></button>{noteMenuId === note.id && <div className="knowledge-note-menu"><button type="button" onClick={() => beginNoteAction(note, 'move')}>移动到…</button><button type="button" onClick={() => beginNoteAction(note, 'copy')}>复制到…</button><button type="button" className="danger" onClick={() => { setNoteMenuId(null); setDeleteNote(note) }}>删除</button></div>}</div>) : <div className="knowledge-empty">当前文件夹还没有笔记。</div>}</section>
      <main className="knowledge-editor"><div className="knowledge-editor-toolbar"><span>{selected?.sourceName ? `来源：${selected.sourceName}` : 'Markdown 笔记'}</span><div>{selected && <button type="button" className="icon-button" onClick={() => setDeleteNote(selected)} title="删除笔记" aria-label="删除笔记"><Trash2 size={17} /></button>}<button type="button" className="primary-button" onClick={() => void save()} disabled={saving || !title.trim()}><Save size={16} />{saving ? '保存中...' : '保存'}</button></div></div>{error && <div className="knowledge-error" role="alert">{error}</div>}{title ? <><input className="knowledge-title-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="笔记标题" /><input list="knowledge-folder-options" className="knowledge-folder-input" value={folder} onChange={(event) => setFolder(event.target.value)} placeholder="文件夹" /><datalist id="knowledge-folder-options">{folders.map((item) => <option value={item.name} key={item.id} />)}</datalist><textarea className="knowledge-content-input" value={content} onChange={(event) => setContent(event.target.value)} placeholder="开始编写 Markdown 内容..." /></> : <div className="knowledge-editor-empty"><BookOpen size={38} /><h3>选择一篇笔记</h3><p>或者创建新笔记、导入 Markdown、TXT、PDF 等文件。</p></div>}</main>
    </div>
    {isDragging && <div className="knowledge-drop-overlay"><FileUp size={28} /><strong>释放文件以导入知识库</strong><span>支持 Markdown、TXT、PDF、DOCX、XLSX、PPTX</span></div>}
    {folderDialogOpen && <div className="knowledge-modal-overlay"><form className="knowledge-modal" onSubmit={(event) => void createFolder(event)}><div className="knowledge-modal-header"><h3>新建文件夹</h3><button type="button" className="icon-button" onClick={() => setFolderDialogOpen(false)} aria-label="关闭"><X size={18} /></button></div><label>文件夹名称<input autoFocus value={folderName} maxLength={7} onChange={(event) => setFolderName(event.target.value)} placeholder="最多 7 个字" /></label><div className="knowledge-modal-help">名称不能超过 7 个字，不能与已有文件夹重复。</div><div className="knowledge-modal-actions"><button type="button" className="secondary-button" onClick={() => setFolderDialogOpen(false)}>取消</button><button type="submit" className="primary-button">创建</button></div></form></div>}
    {deleteFolder && <div className="knowledge-modal-overlay"><div className="knowledge-modal"><div className="knowledge-modal-header"><h3>删除文件夹</h3><button type="button" className="icon-button" onClick={() => setDeleteFolder(null)} aria-label="关闭"><X size={18} /></button></div><p className="knowledge-delete-warning">删除“{deleteFolder.name}”将同时删除该文件夹下的所有笔记、导入文件及原始附件，此操作不可恢复。请确认是否继续？</p><div className="knowledge-modal-actions"><button type="button" className="secondary-button" onClick={() => setDeleteFolder(null)}>取消</button><button type="button" className="danger-button" onClick={() => void confirmDeleteFolder()}>确认删除</button></div></div></div>}
    {noteAction && actionNote && <div className="knowledge-modal-overlay"><div className="knowledge-modal"><div className="knowledge-modal-header"><h3>{noteAction === 'move' ? '移动文档' : '复制文档'}</h3><button type="button" className="icon-button" onClick={() => setNoteAction(null)} aria-label="关闭"><X size={18} /></button></div><p className="knowledge-action-note-title">{actionNote.title}</p><label>目标文件夹<select value={targetFolder} onChange={(event) => setTargetFolder(event.target.value)}><option value="" disabled>请选择文件夹</option>{folders.filter((item) => item.name !== actionNote.folder).map((item) => <option value={item.name} key={item.id}>{item.name}</option>)}</select></label><div className="knowledge-modal-actions"><button type="button" className="secondary-button" onClick={() => setNoteAction(null)}>取消</button><button type="button" className="primary-button" disabled={!targetFolder} onClick={() => void applyNoteAction()}>{noteAction === 'move' ? '移动' : '复制'}</button></div></div></div>}
    {deleteNote && <div className="knowledge-modal-overlay"><div className="knowledge-modal"><div className="knowledge-modal-header"><h3>删除文档</h3><button type="button" className="icon-button" onClick={() => setDeleteNote(null)} aria-label="关闭"><X size={18} /></button></div><p className="knowledge-delete-warning">确定删除“{deleteNote.title}”吗？{deleteNote.kind === 'imported' ? '该文档的提取内容和知识库中的原始附件也会一并删除。' : ''}此操作不可恢复。</p><div className="knowledge-modal-actions"><button type="button" className="secondary-button" onClick={() => setDeleteNote(null)}>取消</button><button type="button" className="danger-button" onClick={() => void confirmDeleteNote()}>确认删除</button></div></div></div>}
  </section>
}
