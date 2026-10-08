import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ChatAttachment, AttachmentKind } from '../shared/attachments'
import type { KnowledgeFolder, KnowledgeNote, KnowledgeNoteInput, KnowledgeNotePatch, KnowledgeNoteSummary } from '../shared/knowledge'
import { parseAttachment } from './attachments.ts'

interface KnowledgeIndexEntry extends KnowledgeNoteSummary {
  tags: string[]
  sourcePath?: string
}

interface KnowledgeIndexFile {
  folders?: KnowledgeFolder[]
  notes?: KnowledgeIndexEntry[]
}

export interface KnowledgeContextItem {
  id: string
  title: string
  folder: string
  sourceName?: string
  content: string
}

const INDEX_FILE = 'knowledge-index.json'
const NOTES_DIR = 'notes'
const ORIGINALS_DIR = 'originals'
const MAX_INDEX_RESULTS = 200
export const DEFAULT_FOLDER_ID = 'default'
export const DEFAULT_FOLDER_NAME = '默认'
const supportedKinds: Record<string, AttachmentKind> = {
  '.md': 'text', '.markdown': 'text', '.txt': 'text', '.json': 'text', '.csv': 'text', '.html': 'text',
  '.pdf': 'pdf', '.docx': 'docx', '.xlsx': 'xlsx', '.xls': 'xls', '.pptx': 'pptx',
}

function safeTitle(value: string, fallback = '未命名笔记') {
  const trimmed = value.trim().replace(/[\\/:*?"<>|\r\n]+/g, ' ')
  return trimmed.slice(0, 120) || fallback
}

function normalizeFolderName(value: string) {
  return value.trim()
}

function assertFolderName(value: string) {
  const name = normalizeFolderName(value)
  if (!name) throw new Error('文件夹名称不能为空')
  if ([...name].length > 7) throw new Error('文件夹名称不能超过 7 个字')
  return name
}

function noteFileName(id: string) { return `${id}.md` }

export class KnowledgeStore {
  private root = ''
  private entries = new Map<string, KnowledgeIndexEntry>()
  private folders = new Map<string, KnowledgeFolder>()

  async initialize(userDataRoot: string) {
    this.root = path.join(userDataRoot, 'knowledge-base')
    await fs.mkdir(path.join(this.root, NOTES_DIR), { recursive: true })
    await fs.mkdir(path.join(this.root, ORIGINALS_DIR), { recursive: true })
    const raw = await fs.readFile(path.join(this.root, INDEX_FILE), 'utf8').catch(() => '')
    const now = Date.now()
    const defaultFolder: KnowledgeFolder = { id: DEFAULT_FOLDER_ID, name: DEFAULT_FOLDER_NAME, pinned: false, createdAt: now, updatedAt: now, isDefault: true }
    this.folders.set(DEFAULT_FOLDER_ID, defaultFolder)
    if (!raw) { await this.persist(); return }
    try {
      const parsed = JSON.parse(raw) as unknown
      const legacyNotes = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' ? (parsed as KnowledgeIndexFile).notes ?? [] : [])
      const savedFolders = !Array.isArray(parsed) && parsed && typeof parsed === 'object' ? (parsed as KnowledgeIndexFile).folders ?? [] : []
      for (const folder of savedFolders) {
        if (folder && typeof folder.id === 'string' && typeof folder.name === 'string' && folder.id !== DEFAULT_FOLDER_ID && folder.name !== '未分类' && folder.name !== '导入文件') {
          this.folders.set(folder.id, { ...folder, pinned: Boolean(folder.pinned), isDefault: false })
        }
      }
      for (const item of legacyNotes) {
          if (item && typeof item === 'object' && typeof (item as KnowledgeIndexEntry).id === 'string') {
            const entry = item as KnowledgeIndexEntry
            const legacyFolder = entry.folder === '未分类' || entry.folder === '导入文件' || !entry.folder ? DEFAULT_FOLDER_NAME : entry.folder
            const folderId = [...this.folders.values()].find((folder) => folder.name === legacyFolder)?.id ?? (legacyFolder === DEFAULT_FOLDER_NAME ? DEFAULT_FOLDER_ID : `folder-${legacyFolder}`)
            if (folderId !== DEFAULT_FOLDER_ID && !this.folders.has(folderId)) {
              const folder: KnowledgeFolder = { id: folderId, name: legacyFolder, pinned: false, createdAt: now, updatedAt: now, isDefault: false }
              this.folders.set(folderId, folder)
            }
            this.entries.set(entry.id, { ...entry, folder: legacyFolder, tags: Array.isArray(entry.tags) ? entry.tags : [] })
          }
      }
      await this.persist()
    } catch {
      // A corrupt index can be rebuilt from the note files in a later phase.
    }
  }

  private async persist() {
    const target = path.join(this.root, INDEX_FILE)
    const temp = `${target}.tmp`
    await fs.writeFile(temp, JSON.stringify({ folders: [...this.folders.values()], notes: [...this.entries.values()] }, null, 2), 'utf8')
    await fs.rename(temp, target)
  }

  private async readContent(id: string) {
    return fs.readFile(path.join(this.root, NOTES_DIR, noteFileName(id)), 'utf8')
  }

  private resolveManagedSource(sourcePath: string) {
    const target = path.resolve(this.root, sourcePath)
    const originalsRoot = path.resolve(this.root, ORIGINALS_DIR) + path.sep
    if (!target.startsWith(originalsRoot)) return null
    return target
  }

  private summary(entry: KnowledgeIndexEntry): KnowledgeNoteSummary { return { ...entry } }

  async listFolders(): Promise<KnowledgeFolder[]> {
    return [...this.folders.values()].sort((a, b) => a.isDefault ? -1 : b.isDefault ? 1 : a.pinned !== b.pinned ? (a.pinned ? -1 : 1) : a.name.localeCompare(b.name, 'zh-CN'))
  }

  async createFolder(name: string): Promise<KnowledgeFolder> {
    const normalized = assertFolderName(name)
    if ([...this.folders.values()].some((folder) => folder.name === normalized)) throw new Error('文件夹名称已存在')
    const now = Date.now()
    const folder: KnowledgeFolder = { id: randomUUID(), name: normalized, pinned: false, createdAt: now, updatedAt: now, isDefault: false }
    this.folders.set(folder.id, folder)
    await this.persist()
    return folder
  }

  async renameFolder(id: string, name: string): Promise<KnowledgeFolder | null> {
    const folder = this.folders.get(id)
    if (!folder) return null
    if (folder.isDefault) throw new Error('默认文件夹不能修改名称')
    const normalized = assertFolderName(name)
    if ([...this.folders.values()].some((item) => item.id !== id && item.name === normalized)) throw new Error('文件夹名称已存在')
    const updated = { ...folder, name: normalized, updatedAt: Date.now() }
    this.folders.set(id, updated)
    for (const entry of this.entries.values()) if (entry.folder === folder.name) entry.folder = normalized
    await this.persist()
    return updated
  }

  async setFolderPinned(id: string, pinned: boolean): Promise<KnowledgeFolder | null> {
    const folder = this.folders.get(id)
    if (!folder) return null
    if (folder.isDefault) throw new Error('默认文件夹不能置顶')
    const updated = { ...folder, pinned: Boolean(pinned), updatedAt: Date.now() }
    this.folders.set(id, updated)
    await this.persist()
    return updated
  }

  async deleteFolder(id: string): Promise<boolean> {
    const folder = this.folders.get(id)
    if (!folder) return false
    if (folder.isDefault) throw new Error('默认文件夹不能删除')
    const entries = [...this.entries.values()].filter((entry) => entry.folder === folder.name)
    for (const entry of entries) {
      this.entries.delete(entry.id)
      await fs.rm(path.join(this.root, NOTES_DIR, noteFileName(entry.id)), { force: true })
      if (entry.sourcePath) {
        const source = this.resolveManagedSource(entry.sourcePath)
        if (source) await fs.rm(source, { force: true })
      }
    }
    this.folders.delete(id)
    await this.persist()
    return true
  }

  async list(query = ''): Promise<KnowledgeNoteSummary[]> {
    const needle = query.trim().toLocaleLowerCase()
    const result: KnowledgeNoteSummary[] = []
    for (const entry of [...this.entries.values()].sort((a, b) => b.updatedAt - a.updatedAt)) {
      if (needle) {
        const haystack = `${entry.title} ${entry.fileName} ${entry.folder} ${entry.sourceName ?? ''} ${entry.tags.join(' ')}`.toLocaleLowerCase()
        let content = ''
        if (!haystack.includes(needle)) content = (await this.readContent(entry.id).catch(() => '')).toLocaleLowerCase()
        if (!haystack.includes(needle) && !content.includes(needle)) continue
      }
      result.push(this.summary(entry))
      if (result.length >= MAX_INDEX_RESULTS) break
    }
    return result
  }

  async retrieveContext(query: string, limit = 5): Promise<KnowledgeContextItem[]> {
    const summaries = await this.list(query)
    const results: KnowledgeContextItem[] = []
    let totalChars = 0
    for (const summary of summaries.slice(0, limit)) {
      const content = await this.readContent(summary.id).catch(() => '')
      if (!content.trim()) continue
      const remaining = 12_000 - totalChars
      if (remaining <= 0) break
      const excerpt = content.length > remaining ? `${content.slice(0, Math.max(0, remaining - 20))}…` : content
      results.push({ id: summary.id, title: summary.title, folder: summary.folder, ...(summary.sourceName ? { sourceName: summary.sourceName } : {}), content: excerpt })
      totalChars += excerpt.length
    }
    return results
  }

  async get(id: string): Promise<KnowledgeNote | null> {
    const entry = this.entries.get(id)
    if (!entry) return null
    return { ...entry, content: await this.readContent(id).catch(() => '') }
  }

  async create(input: KnowledgeNoteInput): Promise<KnowledgeNote> {
    const id = randomUUID()
    const now = Date.now()
    const entry: KnowledgeIndexEntry = {
      id, title: safeTitle(input.title), kind: 'note', fileName: noteFileName(id), folder: input.folder?.trim() || '未分类',
      tags: input.tags ?? [], createdAt: now, updatedAt: now,
    }
    await fs.writeFile(path.join(this.root, NOTES_DIR, entry.fileName), input.content, 'utf8')
    this.entries.set(id, entry)
    await this.persist()
    return { ...entry, content: input.content }
  }

  async update(input: KnowledgeNotePatch): Promise<KnowledgeNote | null> {
    const current = this.entries.get(input.id)
    if (!current) return null
    const entry: KnowledgeIndexEntry = {
      ...current, title: safeTitle(input.title), folder: input.folder?.trim() || current.folder || '未分类',
      tags: input.tags ?? current.tags, updatedAt: Date.now(),
    }
    await fs.writeFile(path.join(this.root, NOTES_DIR, entry.fileName), input.content, 'utf8')
    this.entries.set(entry.id, entry)
    await this.persist()
    return { ...entry, content: input.content }
  }

  async remove(id: string) {
    const entry = this.entries.get(id)
    if (!entry) return false
    this.entries.delete(id)
    await fs.rm(path.join(this.root, NOTES_DIR, noteFileName(id)), { force: true })
    if (entry.sourcePath) {
      const source = this.resolveManagedSource(entry.sourcePath)
      if (source) await fs.rm(source, { force: true })
    }
    await this.persist()
    return true
  }

  async moveNote(id: string, targetFolderName: string): Promise<KnowledgeNoteSummary | null> {
    const entry = this.entries.get(id)
    if (!entry) return null
    const target = [...this.folders.values()].find((folder) => folder.name === targetFolderName)
    if (!target) throw new Error('目标文件夹不存在')
    if (entry.folder === target.name) throw new Error('文档已经位于目标文件夹')
    entry.folder = target.name
    entry.updatedAt = Date.now()
    await this.persist()
    return this.summary(entry)
  }

  async copyNote(id: string, targetFolderName: string): Promise<KnowledgeNoteSummary | null> {
    const entry = this.entries.get(id)
    if (!entry) return null
    const target = [...this.folders.values()].find((folder) => folder.name === targetFolderName)
    if (!target) throw new Error('目标文件夹不存在')
    if (entry.folder === target.name) throw new Error('不能复制到当前文件夹')

    const newId = randomUUID()
    const newEntry: KnowledgeIndexEntry = {
      ...entry,
      id: newId,
      fileName: noteFileName(newId),
      folder: target.name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    let copiedSourcePath: string | undefined
    if (entry.sourcePath) {
      const source = this.resolveManagedSource(entry.sourcePath)
      if (source) {
        const sourceExists = await fs.stat(source).then((stat) => stat.isFile()).catch(() => false)
        if (sourceExists) {
          const targetPath = path.join(this.root, ORIGINALS_DIR, `${newId}-${path.basename(source)}`)
          await fs.copyFile(source, targetPath)
          copiedSourcePath = path.relative(this.root, targetPath)
        }
      }
    }
    if (copiedSourcePath) newEntry.sourcePath = copiedSourcePath
    else delete newEntry.sourcePath

    const content = await this.readContent(id).catch(() => '')
    await fs.writeFile(path.join(this.root, NOTES_DIR, newEntry.fileName), content, 'utf8')
    this.entries.set(newId, newEntry)
    await this.persist()
    return this.summary(newEntry)
  }

  async importFiles(filePaths: string[], folderName = DEFAULT_FOLDER_NAME): Promise<KnowledgeNoteSummary[]> {
    const targetFolder = [...this.folders.values()].find((folder) => folder.name === folderName)
    if (!targetFolder) throw new Error('目标文件夹不存在，请刷新知识库后重试')
    const imported: KnowledgeNoteSummary[] = []
    for (const source of filePaths) {
      const extension = path.extname(source).toLowerCase()
      const kind = supportedKinds[extension]
      if (!kind) throw new Error(`不支持导入的文件类型：${extension || path.basename(source)}`)
      const stat = await fs.stat(source)
      if (!stat.isFile()) throw new Error(`导入目标不是文件：${source}`)
      const id = randomUUID()
      const sourceName = path.basename(source)
      const originalPath = path.join(this.root, ORIGINALS_DIR, `${id}-${sourceName}`)
      await fs.copyFile(source, originalPath)
      const attachment: ChatAttachment = { id, name: sourceName, kind, mimeType: 'application/octet-stream', size: stat.size, tempPath: source, parseStatus: 'pending' }
      const parsed = await parseAttachment(attachment)
      const content = parsed.extractedText ?? ''
      const now = Date.now()
      const entry: KnowledgeIndexEntry = {
        id, title: safeTitle(path.basename(source, extension)), kind: 'imported', fileName: noteFileName(id), folder: targetFolder.name,
        sourceName, sourceType: extension.slice(1).toUpperCase(), sourcePath: path.relative(this.root, originalPath),
        tags: [], createdAt: now, updatedAt: now,
      }
      await fs.writeFile(path.join(this.root, NOTES_DIR, entry.fileName), content, 'utf8')
      this.entries.set(id, entry)
      imported.push(this.summary(entry))
    }
    await this.persist()
    return imported
  }
}

export const knowledgeStore = new KnowledgeStore()
