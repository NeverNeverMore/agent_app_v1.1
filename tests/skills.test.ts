import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { SkillManager, parseSkill, withSkillPrompt } from '../electron/skills.ts'

const skillText = (name: string, body = 'Follow this instruction.') => `---\nname: ${name}\ndescription: Test skill\nversion: 1.0.0\ntags: [test, agent]\n---\n\n${body}\n`

async function writeSkill(root: string, directory: string, content: string): Promise<void> {
  const skillDirectory = path.join(root, directory)
  await fs.mkdir(skillDirectory, { recursive: true })
  await fs.writeFile(path.join(skillDirectory, 'SKILL.md'), content, 'utf8')
}

test('parses Skill frontmatter and rejects invalid content', () => {
  const skill = parseSkill(skillText('code-review'), 'SKILL.md', 'global', 'global:code-review')
  assert.equal(skill.name, 'code-review')
  assert.deepEqual(skill.tags, ['test', 'agent'])
  assert.throws(() => parseSkill('no frontmatter', 'SKILL.md', 'global', 'global:bad'))
  assert.throws(() => parseSkill(skillText('bad name'), 'SKILL.md', 'global', 'global:bad'))
  assert.throws(() => parseSkill(skillText('empty', ''), 'SKILL.md', 'global', 'global:empty'))
})

test('project Skill overrides a global Skill with the same name', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-'))
  const userData = path.join(root, 'user-data')
  const project = path.join(root, 'project')
  await writeSkill(path.join(userData, 'skills'), 'global-review', skillText('review', 'Global prompt'))
  await writeSkill(path.join(project, '.agent', 'skills'), 'project-review', skillText('review', 'Project prompt'))
  const manager = new SkillManager()
  manager.initialize(userData)
  const list = await manager.list(project)
  assert.equal(list.filter((skill) => skill.name === 'review').length, 1)
  assert.equal(list.find((skill) => skill.name === 'review')?.source, 'project')
  assert.equal(await manager.prompts(['project:review'], project), '## Skill: review\nProject prompt')
})

test('invalid and oversized Skills are isolated from valid Skills', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-errors-'))
  const skillsRoot = path.join(root, 'skills')
  await writeSkill(skillsRoot, 'valid', skillText('valid'))
  await writeSkill(skillsRoot, 'invalid', 'invalid')
  await writeSkill(skillsRoot, 'large', skillText('large', 'x'.repeat(70 * 1024)))
  const manager = new SkillManager()
  manager.initialize(root)
  const list = await manager.list('')
  assert.equal(list.some((skill) => skill.id === 'global:valid' && !skill.error), true)
  assert.equal(list.filter((skill) => skill.error).length, 2)
})

test('missing Skill directories return an empty list', async () => {
  const manager = new SkillManager()
  manager.initialize(path.join(os.tmpdir(), `missing-skills-${Date.now()}`))
  assert.deepEqual(await manager.list(''), [])
})

test('enabled Skill content is appended to the Agent system prompt', () => {
  const prompt = withSkillPrompt('Base instructions', '## Skill: review\nCheck tests first.')
  assert.match(prompt, /Base instructions/)
  assert.match(prompt, /Skill: review/)
  assert.match(prompt, /Check tests first/)
  assert.equal(withSkillPrompt('Base instructions', ''), 'Base instructions')
})
