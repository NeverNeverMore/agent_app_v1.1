import fs from "node:fs/promises"
import path from "node:path"

function inside(root: string, candidate: string): boolean { return candidate === root || candidate.startsWith(root + path.sep) }
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
