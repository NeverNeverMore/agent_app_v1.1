import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { MAX_ATTACHMENT_SIZE, MAX_ATTACHMENTS, cleanupAttachments, cleanupUnreferencedPreviews, parseAttachment, persistImagePreviews, readImagePreview, selectAndCopyAttachments } from '../electron/attachments.ts'
import * as XLSX from 'xlsx'

test('文本附件可复制并解析，结果带 ready 状态', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'attachments-'))
  const source = path.join(root, 'note.md')
  await fs.writeFile(source, '# hello\ncontent')
  const attachments = await selectAndCopyAttachments(root, [source])
  assert.equal(attachments.length, 1)
  const parsed = await parseAttachment(attachments[0])
  assert.equal(parsed.parseStatus, 'ready')
  assert.match(parsed.extractedText ?? '', /hello/)
  await cleanupAttachments(attachments)
})

test('附件数量和大小限制生效', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'attachments-limit-'))
  const files: string[] = []
  for (let i = 0; i < MAX_ATTACHMENTS + 1; i++) {
    const file = path.join(root, `f${i}.txt`)
    await fs.writeFile(file, 'x')
    files.push(file)
  }
  await assert.rejects(() => selectAndCopyAttachments(root, files))
  const large = path.join(root, 'large.txt')
  await fs.writeFile(large, Buffer.alloc(MAX_ATTACHMENT_SIZE + 1))
  await assert.rejects(() => selectAndCopyAttachments(root, [large]))
})

test('图片预览持久化并可清理未引用文件', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'attachments-preview-'))
  const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'attachments-user-data-'))
  const source = path.join(root, 'photo.png')
  await fs.writeFile(source, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  const [attachment] = await selectAndCopyAttachments(root, [source])
  const previews = await persistImagePreviews(root, userData, [attachment])
  assert.equal(previews[attachment.id], attachment.id)
  assert.match((await readImagePreview(userData, attachment.id)) ?? '', /^data:image\/png;base64,/)
  await cleanupUnreferencedPreviews(userData, [])
  assert.equal(await readImagePreview(userData, attachment.id), null)
  await cleanupAttachments([attachment])
})

test('XLSX ???????????', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'attachments-xlsx-'))
  const source = path.join(root, 'table.xlsx')
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['??', '??'], ['??', '??']]), 'Sheet1')
  XLSX.writeFile(workbook, source)
  const attachments = await selectAndCopyAttachments(root, [source])
  const parsed = await parseAttachment(attachments[0])
  assert.equal(parsed.parseStatus, 'ready')
  assert.match(parsed.extractedText ?? '', /Sheet1/)
  assert.match(parsed.extractedText ?? '', /Sheet1/)
  await cleanupAttachments(attachments)
})
