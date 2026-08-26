import fs from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import mammoth from "mammoth"
import * as XLSX from "xlsx"
import { PDFParse } from "pdf-parse"
import JSZip from "jszip"
import { XMLParser } from "fast-xml-parser"
import type { ChatAttachment, AttachmentKind } from "../shared/attachments"

export const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024
export const MAX_ATTACHMENTS = 5
export const MAX_EXTRACTED_CHARS = 100_000
export const MAX_TOTAL_EXTRACTED_CHARS = 180_000
const ATTACHMENT_ROOT = "attachments"

const extKinds: Record<string, { kind: AttachmentKind; mimeType: string }> = {
  ".txt": { kind: "text", mimeType: "text/plain" }, ".md": { kind: "text", mimeType: "text/markdown" },
  ".json": { kind: "text", mimeType: "application/json" }, ".csv": { kind: "text", mimeType: "text/csv" },
  ".ts": { kind: "text", mimeType: "text/plain" }, ".tsx": { kind: "text", mimeType: "text/plain" },
  ".js": { kind: "text", mimeType: "text/plain" }, ".jsx": { kind: "text", mimeType: "text/plain" },
  ".css": { kind: "text", mimeType: "text/css" }, ".html": { kind: "text", mimeType: "text/html" },
  ".py": { kind: "text", mimeType: "text/x-python" }, ".java": { kind: "text", mimeType: "text/plain" },
  ".png": { kind: "image", mimeType: "image/png" }, ".jpg": { kind: "image", mimeType: "image/jpeg" },
  ".jpeg": { kind: "image", mimeType: "image/jpeg" }, ".webp": { kind: "image", mimeType: "image/webp" },
  ".pdf": { kind: "pdf", mimeType: "application/pdf" },
  ".docx": { kind: "docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  ".xlsx": { kind: "xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  ".xls": { kind: "xls", mimeType: "application/vnd.ms-excel" },
  ".pptx": { kind: "pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
}

function kindFor(filePath: string) {
  const result = extKinds[path.extname(filePath).toLowerCase()]
  if (!result) throw new Error("????????")
  return result
}

function assertSignature(kind: AttachmentKind, mimeType: string, header: Buffer) {
  if (kind === "pdf" && header.toString("ascii", 0, 4) !== "%PDF") throw new Error("???????? PDF")
  if (["docx", "xlsx", "pptx"].includes(kind) && !(header[0] === 0x50 && header[1] === 0x4b)) throw new Error("Office ??????")
  if (kind === "xls" && !(header[0] === 0xd0 && header[1] === 0xcf && header[2] === 0x11 && header[3] === 0xe0)) throw new Error("Excel ??????")
  if (kind === "image") {
    const valid = mimeType === "image/png" ? header[0] === 0x89 && header.toString("ascii", 1, 4) === "PNG" : mimeType === "image/jpeg" ? header[0] === 0xff && header[1] === 0xd8 : mimeType === "image/webp" ? header.toString("ascii", 0, 4) === "RIFF" && header.toString("ascii", 8, 12) === "WEBP" : false
    if (!valid) throw new Error("??????")
  }
}

export async function selectAndCopyAttachments(tempRoot: string, filePaths: string[]): Promise<ChatAttachment[]> {
  if (filePaths.length > MAX_ATTACHMENTS) throw new Error(`???? ${MAX_ATTACHMENTS} ???`)
  const dir = path.join(tempRoot, ATTACHMENT_ROOT, randomUUID())
  await fs.mkdir(dir, { recursive: true })
  const result: ChatAttachment[] = []
  try {
    for (const source of filePaths) {
      const stat = await fs.stat(source)
      if (!stat.isFile()) throw new Error("??????")
      if (stat.size > MAX_ATTACHMENT_SIZE) throw new Error(`???? ${MAX_ATTACHMENT_SIZE / 1024 / 1024}MB ??`)
      const { kind, mimeType } = kindFor(source)
      const header = await fs.readFile(source, { encoding: undefined }).then((b) => b.subarray(0, 16))
      if (kind === "pdf" || ["docx", "xlsx", "xls", "pptx"].includes(kind)) assertSignature(kind, mimeType, header)
      const id = randomUUID()
      const target = path.join(dir, `${id}-${path.basename(source)}`)
      await fs.copyFile(source, target)
      result.push({ id, name: path.basename(source), kind, mimeType, size: stat.size, tempPath: target, parseStatus: "pending" })
    }
    return result
  } catch (error) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

function limitText(text: string): { text: string; truncated: boolean } {
  return text.length > MAX_EXTRACTED_CHARS ? { text: `${text.slice(0, MAX_EXTRACTED_CHARS)}\n[?????]`, truncated: true } : { text, truncated: false }
}

async function parsePptx(filePath: string): Promise<string> {
  const zip = await JSZip.loadAsync(await fs.readFile(filePath))
  const parser = new XMLParser({ ignoreAttributes: false })
  const zipEntries = Object.values(zip.files)
  const totalUncompressed = zipEntries.reduce((sum, entry) => sum + Number((entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0), 0)
  if (zipEntries.length > 2000 || totalUncompressed > 50 * 1024 * 1024) throw new Error("Office ??????????")
  const slides = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort()
  const output: string[] = []
  for (const [index, name] of slides.entries()) {
    const xml = await zip.files[name].async("text")
    const parsed = parser.parse(xml) as Record<string, unknown>
    const texts: string[] = []
    const visit = (value: unknown) => {
      if (!value || typeof value !== "object") return
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (key.endsWith(":t") || key === "a:t") { if (typeof child === "string") texts.push(child) }
        else if (Array.isArray(child)) child.forEach(visit); else visit(child)
      }
    }
    visit(parsed)
    output.push(`[??? ${index + 1}]\n${texts.join(" ")}`)
  }
  return output.join("\n\n")
}

export async function parseAttachment(attachment: ChatAttachment): Promise<ChatAttachment> {
  if (!attachment.tempPath) return { ...attachment, parseStatus: "failed", error: "???????" }
  try {
    let text = ""
    if (attachment.kind === "text") text = await fs.readFile(attachment.tempPath, "utf8")
    else if (attachment.kind === "pdf") { const parser = new PDFParse({ data: await fs.readFile(attachment.tempPath) }); text = (await parser.getText()).text; await parser.destroy() }
    else if (attachment.kind === "docx") text = (await mammoth.extractRawText({ path: attachment.tempPath })).value
    else if (attachment.kind === "xlsx" || attachment.kind === "xls") {
      const workbook = XLSX.read(await fs.readFile(attachment.tempPath), { type: "buffer", cellFormula: false })
      text = workbook.SheetNames.map((name) => `[???: ${name}]\n${XLSX.utils.sheet_to_csv(workbook.Sheets[name])}`).join("\n\n")
    } else if (attachment.kind === "pptx") text = await parsePptx(attachment.tempPath)
    else if (attachment.kind === "image") {
      const data = (await fs.readFile(attachment.tempPath)).toString("base64")
      return { ...attachment, parseStatus: "ready", dataUrl: `data:${attachment.mimeType};base64,${data}` }
    }
    const limited = limitText(text)
    return { ...attachment, parseStatus: "ready", extractedText: limited.text, truncated: limited.truncated }
  } catch (error) {
    return { ...attachment, parseStatus: "failed", error: error instanceof Error ? error.message : String(error) }
  }
}

export async function prepareAttachments(attachments: ChatAttachment[], onProgress?: (status: "preparing_attachments" | "parsing_attachments") => void): Promise<ChatAttachment[]> {
  onProgress?.("parsing_attachments")
  const prepared: ChatAttachment[] = []
  let total = 0
  for (const attachment of attachments) {
    const parsed = await parseAttachment(attachment)
    if (parsed.extractedText) {
      const remaining = MAX_TOTAL_EXTRACTED_CHARS - total
      parsed.extractedText = parsed.extractedText.slice(0, Math.max(0, remaining))
      total += parsed.extractedText.length
    }
    prepared.push(parsed)
  }
  return prepared
}

export async function cleanupAttachments(attachments: ChatAttachment[]): Promise<void> {
  const dirs = new Set<string>()
  for (const attachment of attachments) if (attachment.tempPath) dirs.add(path.dirname(attachment.tempPath))
  await Promise.all([...dirs].map((dir) => fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)))
}

export async function cleanupOldAttachments(tempRoot: string, maxAgeMs = 60 * 60 * 1000): Promise<void> {
  const root = path.join(tempRoot, ATTACHMENT_ROOT)
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
  const now = Date.now()
  for (const entry of entries) {
    const full = path.join(root, entry.name)
    const stat = await fs.stat(full).catch(() => undefined)
    if (stat && now - stat.mtimeMs > maxAgeMs) await fs.rm(full, { recursive: true, force: true }).catch(() => undefined)
  }
}
