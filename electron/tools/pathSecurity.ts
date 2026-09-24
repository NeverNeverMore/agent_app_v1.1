import fs from "node:fs/promises"
import path from "node:path"

function inside(root: string, candidate: string): boolean { return candidate === root || candidate.startsWith(root + path.sep) }
function roots(folders: string[], fallback: string) { return (folders.length ? folders : (fallback ? [fallback] : [])).map((folder) => path.resolve(folder)) }
export async function resolveExistingWithinRoot(projectFolder: string, requestedPath: string): Promise<string> {
  if (!projectFolder) throw new Error("????????????????????????")
  const root = await fs.realpath(path.resolve(projectFolder))
  const real = await fs.realpath(path.resolve(root, requestedPath || "."))
  if (!inside(root, real)) throw new Error("??????????????????")
  return real
}
export async function resolveWriteWithinRoot(projectFolder: string, requestedPath: string): Promise<string> {
  if (!projectFolder) throw new Error("????????????????????????")
  const root = await fs.realpath(path.resolve(projectFolder))
  const candidate = path.resolve(root, requestedPath || ".")
  let parent = path.dirname(candidate); const missing = [path.basename(candidate)]
  while (true) {
    try {
      const parentReal = await fs.realpath(parent)
      if (!inside(root, parentReal)) throw new Error("??????????????????")
      const target = path.join(parentReal, ...missing.reverse())
      try {
        const targetReal = await fs.realpath(target)
        if (!inside(root, targetReal)) throw new Error("??????????????????")
        return targetReal
      } catch (targetError) {
        if ((targetError as NodeJS.ErrnoException).code === "ENOENT") return target
        throw targetError
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      const next = path.dirname(parent); if (next === parent) throw new Error("??????????????????")
      missing.push(path.basename(parent)); parent = next
    }
  }
}

export async function resolveExistingWithinRoots(folders: string[], requestedPath: string): Promise<{ target: string; root: string }> {
  const candidates = roots(folders, folders[0] ?? '')
  const raw = requestedPath || '.'
  for (const candidateRoot of candidates) {
    try {
      const root = await fs.realpath(candidateRoot)
      const firstPart = raw.split(/[\\/]/)[0]
      const isPrefixed = candidates.length > 1 && candidates.indexOf(candidateRoot) > 0 && path.basename(root).toLowerCase() === firstPart.toLowerCase()
      const relative = isPrefixed ? raw.split(/[\\/]/).slice(1).join('/') : raw
      const real = await fs.realpath(path.resolve(root, relative))
      if (inside(root, real)) return { target: real, root }
    } catch { /* try another configured source folder */ }
  }
  throw new Error('路径不在项目工作区内')
}

export async function resolveWriteWithinRoots(folders: string[], requestedPath: string): Promise<{ target: string; root: string }> {
  const candidates = roots(folders, folders[0] ?? '')
  const raw = requestedPath || '.'
  const explicit = candidates.length > 1 && raw.includes('/')
  const firstPart = raw.split(/[\\/]/)[0]
  for (let index = 0; index < candidates.length; index += 1) {
    const candidateRoot = candidates[index]
    const root = await fs.realpath(candidateRoot)
    if (explicit && index > 0 && path.basename(root).toLowerCase() !== firstPart.toLowerCase()) continue
    const relative = explicit && index > 0 ? raw.split(/[\\/]/).slice(1).join(path.sep) : raw
    try { return { target: await resolveWriteWithinRoot(root, relative), root } } catch { /* try next source */ }
  }
  throw new Error('路径不在项目工作区内')
}
