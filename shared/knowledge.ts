export type KnowledgeSourceKind = 'note' | 'imported'

export interface KnowledgeFolder {
  id: string
  name: string
  pinned: boolean
  createdAt: number
  updatedAt: number
  isDefault: boolean
}

export interface KnowledgeFolderInput {
  name: string
}

export interface KnowledgeImportInput {
  filePaths: string[]
  folderName: string
}

export interface KnowledgeNoteSummary {
  id: string
  title: string
  kind: KnowledgeSourceKind
  fileName: string
  folder: string
  sourceName?: string
  sourceType?: string
  createdAt: number
  updatedAt: number
}

export interface KnowledgeNote extends KnowledgeNoteSummary {
  content: string
  tags: string[]
  sourcePath?: string
}

export interface KnowledgeNoteInput {
  title: string
  content: string
  folder?: string
  tags?: string[]
}

export interface KnowledgeNotePatch {
  id: string
  title: string
  content: string
  folder?: string
  tags?: string[]
}
