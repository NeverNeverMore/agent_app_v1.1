#!/usr/bin/env node
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, extname } from 'node:path'

const EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.mjs', '.cjs', '.css', '.json', '.md',
  '.yml', '.yaml', '.html', '.txt', '.editorconfig', '.gitattributes',
])

const IGNORE_DIRS = new Set([
  'node_modules', 'dist', 'dist-electron', 'release', '.git', '.idea', '.vscode',
])

async function walk(dir, files) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue
      await walk(p, files)
    } else if (entry.isFile()) {
      const ext = extname(entry.name)
      if (EXTENSIONS.has(ext) || EXTENSIONS.has(entry.name)) {
        files.push(p)
      }
    }
  }
}

async function main() {
  const files = []
  await walk('.', files)

  const problems = []
  for (const p of files) {
    const buf = await readFile(p)
    let text
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buf)
    } catch (err) {
      problems.push(`${p}: 不是合法的 UTF-8 (${err.message})`)
      continue
    }
    if (text.includes('\uFFFD')) {
      problems.push(`${p}: 包含 U+FFFD 替换字符（通常是乱码残留）`)
    }
  }

  if (problems.length > 0) {
    console.error('编码检查失败：')
    for (const msg of problems) {
      console.error(`  - ${msg}`)
    }
    process.exit(1)
  }

  console.log(`编码检查通过：${files.length} 个文件均为合法 UTF-8，未发现 U+FFFD。`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
