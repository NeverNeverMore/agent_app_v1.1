import fs from 'node:fs/promises'
import path from 'node:path'
import type { SkillInfo, SkillSource } from '../shared/skills'

const SKILL_FILE = 'SKILL.md'
const MAX_FILE_BYTES = 64 * 1024
const MAX_PROMPT_BYTES = 200 * 1024
const NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/

export interface ParsedSkill extends SkillInfo { prompt: string }

export function withSkillPrompt(systemPrompt: string, skillPrompt: string): string {
  return skillPrompt
    ? `${systemPrompt}\n\nThe following user-enabled Skills define additional working instructions:\n${skillPrompt}`
    : systemPrompt
}

function parseFrontmatter(raw: string): { values: Record<string, string | string[]>; body: string } {
  if (!raw.startsWith('---\n') && !raw.startsWith('---\r\n')) throw new Error('Missing YAML frontmatter')
  const end = raw.indexOf('\n---', 4)
  if (end < 0) throw new Error('Unclosed YAML frontmatter')
  const header = raw.slice(4, end).replace(/\r/g, '')
  const values: Record<string, string | string[]> = {}
  for (const line of header.split('\n')) {
    if (!line.trim()) continue
    const separator = line.indexOf(':')
    if (separator <= 0) throw new Error(`Invalid frontmatter line: ${line}`)
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim()
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(key)) throw new Error(`Invalid frontmatter field: ${key}`)
    values[key] = value.startsWith('[') && value.endsWith(']')
      ? value.slice(1, -1).split(',').map((item) => item.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
      : value.replace(/^['"]|['"]$/g, '')
  }
  return { values, body: raw.slice(end + 4).trim() }
}

function textValue(values: Record<string, string | string[]>, key: string): string {
  const value = values[key]
  return typeof value === 'string' ? value.trim() : ''
}

export function parseSkill(raw: string, filePath: string, source: SkillSource, id: string): ParsedSkill {
  const { values, body } = parseFrontmatter(raw)
  const name = textValue(values, 'name')
  if (!name || !NAME_PATTERN.test(name)) throw new Error('name must start with a letter and contain only letters, numbers, - or _')
  if (!body) throw new Error('Skill body cannot be empty')
  return {
    id, name, description: textValue(values, 'description'),
    ...(textValue(values, 'version') ? { version: textValue(values, 'version') } : {}),
    tags: Array.isArray(values.tags) ? values.tags : [], source, filePath,
    enabledByDefault: false, prompt: body,
  }
}

async function directorySkills(directory: string, source: SkillSource): Promise<{ skills: ParsedSkill[]; errors: SkillInfo[] }> {
  const skills: ParsedSkill[] = []
  const errors: SkillInfo[] = []
  const names = new Set<string>()
  let entries: Awaited<ReturnType<typeof fs.readdir>>
  try { entries = await fs.readdir(directory, { withFileTypes: true }) } catch { return { skills, errors } }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const filePath = path.join(directory, entry.name, SKILL_FILE)
    try {
      const stat = await fs.stat(filePath)
      if (stat.size > MAX_FILE_BYTES) throw new Error('SKILL.md exceeds the 64KB limit')
      const parsed = parseSkill(await fs.readFile(filePath, 'utf8'), filePath, source, '')
      if (names.has(parsed.name)) throw new Error(`Duplicate Skill name: ${parsed.name}`)
      names.add(parsed.name)
      skills.push({ ...parsed, id: `${source}:${parsed.name}` })
    } catch (error) {
      errors.push({ id: `${source}:${entry.name}`, name: entry.name, description: '', tags: [], source, filePath, enabledByDefault: false, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return { skills, errors }
}

export class SkillManager {
  private globalDirectory = ''
  private skills = new Map<string, ParsedSkill>()

  initialize(userDataPath: string): void { this.globalDirectory = path.join(userDataPath, 'skills') }

  async list(projectFolder = ''): Promise<SkillInfo[]> {
    const global = await directorySkills(this.globalDirectory, 'global')
    const projectDirectory = projectFolder ? path.join(projectFolder, '.agent', 'skills') : ''
    const project = projectDirectory ? await directorySkills(projectDirectory, 'project') : { skills: [], errors: [] as SkillInfo[] }
    const merged = new Map<string, ParsedSkill>()
    for (const skill of global.skills) merged.set(skill.name, skill)
    for (const skill of project.skills) merged.set(skill.name, skill)
    this.skills = new Map([...merged.values()].map((skill) => [skill.id, skill]))
    return [...merged.values(), ...global.errors, ...project.errors].map(({ prompt: _prompt, ...info }) => info)
  }

  async prompts(ids: string[], projectFolder = ''): Promise<string> {
    await this.list(projectFolder)
    let total = 0
    const sections: string[] = []
    for (const id of ids) {
      const skill = this.skills.get(id)
      if (!skill) continue
      const bytes = Buffer.byteLength(skill.prompt, 'utf8')
      if (total + bytes > MAX_PROMPT_BYTES) break
      total += bytes
      sections.push(`## Skill: ${skill.name}\n${skill.prompt}`)
    }
    return sections.join('\n\n')
  }

  getDirectories(projectFolder = ''): { global: string; project: string } {
    return { global: this.globalDirectory, project: projectFolder ? path.join(projectFolder, '.agent', 'skills') : '' }
  }
}

export const skillManager = new SkillManager()
