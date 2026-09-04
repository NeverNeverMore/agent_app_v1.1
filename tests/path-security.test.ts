import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { resolveExistingWithinRoot, resolveWriteWithinRoot } from '../electron/tools/pathSecurity.ts'

test('路径安全拒绝 ../ 与符号链接越界', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-root-'))
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-out-'))
  await fs.writeFile(path.join(outside, 'secret.txt'), 'secret')
  await fs.symlink(outside, path.join(root, 'link'), 'junction')
  await assert.rejects(() => resolveExistingWithinRoot(root, 'link/secret.txt'))
  await assert.rejects(() => resolveWriteWithinRoot(root, 'link/new.txt'))
  await assert.rejects(() => resolveExistingWithinRoot(root, '../agent-out'))
})

test('项目内新文件写入路径允许且解析到真实父目录', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-root-'))
  const resolved = await resolveWriteWithinRoot(root, 'nested/new.txt')
  assert.equal(path.dirname(resolved), path.join(await fs.realpath(root), 'nested'))
})
