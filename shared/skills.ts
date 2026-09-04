export type SkillSource = 'global' | 'project'

export interface SkillInfo {
  id: string
  name: string
  description: string
  version?: string
  tags: string[]
  source: SkillSource
  filePath: string
  enabledByDefault: boolean
  error?: string
}
