import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { KnowledgeStore } from '../electron/knowledge.ts'
import { DEFAULT_FOLDER_ID, DEFAULT_FOLDER_NAME } from '../electron/knowledge.ts'

test('knowledge store creates, updates, searches and deletes notes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-knowledge-'))
  try {
    const store = new KnowledgeStore()
    await store.initialize(root)
    const created = await store.create({ title: 'SQLite 笔记', content: 'FTS5 和 sqlite-vec 用于知识检索', folder: '技术' })
    assert.equal((await store.list('sqlite'))[0]?.id, created.id)
    const updated = await store.update({ id: created.id, title: 'SQLite 更新', content: '新的内容', folder: '技术' })
    assert.equal(updated?.title, 'SQLite 更新')
    assert.equal((await store.get(created.id))?.content, '新的内容')
    assert.equal(await store.remove(created.id), true)
    assert.equal(await store.get(created.id), null)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('knowledge store imports a text file and keeps the original', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-knowledge-import-'))
  const source = path.join(root, 'manual.txt')
  try {
    await fs.writeFile(source, '本地知识库导入测试', 'utf8')
    const store = new KnowledgeStore()
    await store.initialize(root)
    const [summary] = await store.importFiles([source])
    assert.equal(summary.sourceName, 'manual.txt')
    assert.equal((await store.get(summary.id))?.content, '本地知识库导入测试')
    await fs.access(path.join(root, 'knowledge-base', summary.sourcePath ?? ''))
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('knowledge context retrieval returns at most the requested matching notes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-knowledge-context-'))
  try {
    const store = new KnowledgeStore()
    await store.initialize(root)
    await store.create({ title: '检索一', content: '知识库检索关键词：本地上下文', folder: DEFAULT_FOLDER_NAME })
    await store.create({ title: '检索二', content: '知识库检索关键词：第二条内容', folder: DEFAULT_FOLDER_NAME })
    await store.create({ title: '无关', content: '完全不同的内容', folder: DEFAULT_FOLDER_NAME })
    const results = await store.retrieveContext('知识库检索关键词', 1)
    assert.equal(results.length, 1)
    assert.match(results[0]?.content ?? '', /知识库检索关键词/)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('knowledge imports into the selected folder and rejects missing destinations', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-knowledge-import-folder-'))
  const source = path.join(root, 'selected.txt')
  try {
    await fs.writeFile(source, 'selected folder import', 'utf8')
    const store = new KnowledgeStore()
    await store.initialize(root)
    const target = await store.createFolder('目标目录')
    const [summary] = await store.importFiles([source], target.name)
    assert.equal(summary.folder, target.name)
    await assert.rejects(() => store.importFiles([source], '不存在的目录'))
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('knowledge notes can move and copy while preserving imported originals', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-knowledge-move-copy-'))
  const source = path.join(root, 'guide.txt')
  try {
    await fs.writeFile(source, 'original text', 'utf8')
    const store = new KnowledgeStore()
    await store.initialize(root)
    const folderA = await store.createFolder('资料一')
    const folderB = await store.createFolder('资料二')
    const [imported] = await store.importFiles([source], folderA.name)
    const original = await store.get(imported.id)
    const originalPath = path.join(root, 'knowledge-base', original?.sourcePath ?? '')
    await fs.access(originalPath)

    await assert.rejects(() => store.moveNote(imported.id, folderA.name))
    await assert.rejects(() => store.copyNote(imported.id, folderA.name))
    await assert.rejects(() => store.moveNote(imported.id, 'missing'))
    await assert.rejects(() => store.copyNote(imported.id, 'missing'))

    const copied = await store.copyNote(imported.id, folderB.name)
    assert.ok(copied)
    assert.notEqual(copied.id, imported.id)
    assert.equal(copied.folder, folderB.name)
    const copiedNote = await store.get(copied.id)
    assert.equal(copiedNote?.content, 'original text')
    assert.notEqual(copiedNote?.sourcePath, original?.sourcePath)
    await fs.access(path.join(root, 'knowledge-base', copiedNote?.sourcePath ?? ''))
    await fs.access(originalPath)

    const moved = await store.moveNote(imported.id, folderB.name)
    assert.equal(moved?.id, imported.id)
    assert.equal((await store.get(imported.id))?.folder, folderB.name)
    assert.equal((await store.get(imported.id))?.sourcePath, original?.sourcePath)

    await store.remove(copied.id)
    await assert.rejects(() => fs.access(path.join(root, 'knowledge-base', copiedNote?.sourcePath ?? '')))
    await fs.access(originalPath)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('deleting an imported knowledge note removes its managed original only', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-knowledge-delete-import-'))
  const source = path.join(root, 'delete-me.txt')
  try {
    await fs.writeFile(source, 'keep external source', 'utf8')
    const store = new KnowledgeStore()
    await store.initialize(root)
    const [note] = await store.importFiles([source])
    const importedPath = path.join(root, 'knowledge-base', (await store.get(note.id))?.sourcePath ?? '')
    await store.remove(note.id)
    await assert.rejects(() => fs.access(importedPath))
    await fs.access(source)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('knowledge folders support rename, pin, default protection and cascade delete', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-knowledge-folders-'))
  try {
    const store = new KnowledgeStore()
    await store.initialize(root)
    const defaultFolder = (await store.listFolders()).find((item) => item.id === DEFAULT_FOLDER_ID)
    assert.equal(defaultFolder?.name, DEFAULT_FOLDER_NAME)
    await assert.rejects(() => store.renameFolder(DEFAULT_FOLDER_ID, '不能改'))
    await assert.rejects(() => store.deleteFolder(DEFAULT_FOLDER_ID))
    const folder = await store.createFolder('项目资料')
    await assert.rejects(() => store.createFolder('项目资料'))
    await assert.rejects(() => store.createFolder('12345678'))
    const note = await store.create({ title: '资料', content: '正文', folder: folder.name })
    await store.setFolderPinned(folder.id, true)
    assert.equal((await store.listFolders())[1]?.id, folder.id)
    const notePath = path.join(root, 'knowledge-base', 'notes', note.fileName)
    await fs.access(notePath)
    await store.renameFolder(folder.id, '新资料')
    assert.equal((await store.get(note.id))?.folder, '新资料')
    await store.deleteFolder(folder.id)
    assert.equal(await store.get(note.id), null)
    await assert.rejects(() => fs.access(notePath))
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('legacy unclassified and imported folders migrate to default', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-knowledge-migrate-'))
  try {
    const kb = path.join(root, 'knowledge-base')
    await fs.mkdir(path.join(kb, 'notes'), { recursive: true })
    const oldId = 'old-note'
    await fs.writeFile(path.join(kb, 'notes', `${oldId}.md`), 'legacy', 'utf8')
    await fs.writeFile(path.join(kb, 'knowledge-index.json'), JSON.stringify([{ id: oldId, title: '旧笔记', kind: 'note', fileName: `${oldId}.md`, folder: '未分类', tags: [], createdAt: 1, updatedAt: 1 }]), 'utf8')
    const store = new KnowledgeStore()
    await store.initialize(root)
    assert.equal((await store.get(oldId))?.folder, DEFAULT_FOLDER_NAME)
    assert.equal((await store.listFolders()).filter((item) => item.name === '未分类').length, 0)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
