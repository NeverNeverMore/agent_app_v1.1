export type AttachmentKind =
  | "text"
  | "image"
  | "pdf"
  | "docx"
  | "xlsx"
  | "xls"
  | "pptx"

export type AttachmentParseStatus = "pending" | "ready" | "failed"

export interface ChatAttachment {
  id: string
  name: string
  kind: AttachmentKind
  mimeType: string
  size: number
  tempPath?: string
  extractedText?: string
  dataUrl?: string
  parseStatus: AttachmentParseStatus
  error?: string
  truncated?: boolean
}
