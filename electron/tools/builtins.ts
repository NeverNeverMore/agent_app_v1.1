import fs from 'node:fs/promises'
import path from 'node:path'
import type { ToolDefinition, ToolResult } from './types'

const MAX_LIST_ENTRIES = 200
const MAX_READ_CHARS = 100_000

function ok(output: unknown): ToolResult {
  return { success: true, output }
}

function fail(code: string, message: string, retryable = false): ToolResult {
  return { success: false, error: { code, message, retryable } }
}

/** 安全边界：所有文件路径必须解析在项目文件夹之内 */
import { resolveExistingWithinRoot, resolveWriteWithinRoot } from "./pathSecurity"

async function resolveWithinRoot(projectFolder: string, relativePath: string): Promise<string> { return resolveExistingWithinRoot(projectFolder, relativePath) }
async function resolveWritePath(projectFolder: string, requestedPath: string, allowOutsideRoot: boolean): Promise<string> {
  if (allowOutsideRoot) return path.resolve(projectFolder || process.cwd(), requestedPath)
  return resolveWriteWithinRoot(projectFolder, requestedPath)
}

/* ---------- time_current ---------- */

const timeCurrent: ToolDefinition = {
  name: 'time_current',
  displayName: '当前时间',
  description: '获取当前日期和时间',
  permission: 'read',
  source: 'builtin',
  category: '系统',
  inputSchema: { type: 'object', properties: {} },
  execute: async () => {
    const now = new Date()
    return ok({
      iso: now.toISOString(),
      local: now.toLocaleString('zh-CN', { hour12: false }),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timestamp: now.getTime(),
    })
  },
}

/* ---------- calculator_calculate ---------- */

type CalcToken = { type: 'number'; value: number } | { type: 'op'; value: string }

function evaluateExpression(expression: string): number {
  const tokens: CalcToken[] = []
  let i = 0
  while (i < expression.length) {
    const ch = expression[i]
    if (ch === ' ' || ch === '\t') {
      i++
      continue
    }
    if (/[0-9.]/.test(ch)) {
      let j = i
      while (j < expression.length && /[0-9.]/.test(expression[j])) j++
      const num = Number(expression.slice(i, j))
      if (!Number.isFinite(num)) throw new Error(`无效数字: ${expression.slice(i, j)}`)
      tokens.push({ type: 'number', value: num })
      i = j
      continue
    }
    if ('+-*/%()'.includes(ch)) {
      tokens.push({ type: 'op', value: ch })
      i++
      continue
    }
    throw new Error(`不支持的字符: ${ch}`)
  }

  let pos = 0
  const peek = () => tokens[pos]
  const next = () => tokens[pos++]

  function parseExpr(): number {
    let value = parseTerm()
    while (
      peek()?.type === 'op' &&
      ['+', '-'].includes((peek() as { value: string }).value)
    ) {
      const op = (next() as { value: string }).value
      const rhs = parseTerm()
      value = op === '+' ? value + rhs : value - rhs
    }
    return value
  }

  function parseTerm(): number {
    let value = parseFactor()
    while (
      peek()?.type === 'op' &&
      ['*', '/', '%'].includes((peek() as { value: string }).value)
    ) {
      const op = (next() as { value: string }).value
      const rhs = parseFactor()
      if (op === '*') value *= rhs
      else if (op === '/') {
        if (rhs === 0) throw new Error('除数不能为 0')
        value /= rhs
      } else value %= rhs
    }
    return value
  }

  function parseFactor(): number {
    const token = next()
    if (!token) throw new Error('表达式不完整')
    if (token.type === 'number') return token.value
    if (token.value === '-') return -parseFactor()
    if (token.value === '+') return parseFactor()
    if (token.value === '(') {
      const value = parseExpr()
      const closing = next()
      if (!closing || closing.type !== 'op' || closing.value !== ')')
        throw new Error('缺少右括号')
      return value
    }
    throw new Error(`意外的记号: ${token.value}`)
  }

  const result = parseExpr()
  if (pos !== tokens.length) throw new Error('表达式存在多余内容')
  if (!Number.isFinite(result)) throw new Error('计算结果无效')
  return result
}

const calculator: ToolDefinition = {
  name: 'calculator_calculate',
  displayName: '计算器',
  description: '计算数学表达式，支持 + - * / %、括号和负数',
  permission: 'read',
  source: 'builtin',
  category: '计算',
  inputSchema: {
    type: 'object',
    properties: {
      expression: { type: 'string', description: '要计算的表达式，例如 (1+2)*3' },
    },
    required: ['expression'],
  },
  execute: async (args) => {
    try {
      const value = evaluateExpression(String(args.expression))
      return ok({ expression: args.expression, value })
    } catch (error) {
      return fail(
        'INVALID_EXPRESSION',
        error instanceof Error ? error.message : String(error)
      )
    }
  },
}

/* ---------- file_list / file_read ---------- */

const fileList: ToolDefinition = {
  name: 'file_list',
  displayName: '列出文件',
  description: '列出项目文件夹中指定目录下的文件和子目录，路径相对于项目文件夹',
  permission: 'read',
  source: 'builtin',
  category: '文件',
  requirements: '需要关联项目文件夹',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '相对路径，默认为项目根目录' },
    },
  },
  execute: async (args, context) => {
    try {
      const target = await resolveWithinRoot(
        context.projectFolder,
        typeof args.path === 'string' ? args.path : '.'
      )
      const dirents = await fs.readdir(target, { withFileTypes: true })
      const entries: Array<{ name: string; type: string; size?: number }> = []
      for (const dirent of dirents.slice(0, MAX_LIST_ENTRIES)) {
        let size: number | undefined
        if (dirent.isFile()) {
          try {
            size = (await fs.stat(path.join(target, dirent.name))).size
          } catch {
            /* ignore stat errors for individual entries */
          }
        }
        entries.push({
          name: dirent.name,
          type: dirent.isDirectory() ? 'directory' : dirent.isFile() ? 'file' : 'other',
          ...(size !== undefined ? { size } : {}),
        })
      }
      return ok({
        path: path.relative(context.projectFolder, target) || '.',
        entries,
        truncated: dirents.length > MAX_LIST_ENTRIES,
      })
    } catch (error) {
      return fail(
        'FILE_ACCESS_ERROR',
        error instanceof Error ? error.message : String(error)
      )
    }
  },
}

const fileRead: ToolDefinition = {
  name: 'file_read',
  displayName: '读取文件',
  description: '读取项目文件夹中的文本文件内容，路径相对于项目文件夹，内容过长会截断',
  permission: 'read',
  source: 'builtin',
  category: '文件',
  requirements: '需要关联项目文件夹',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '相对路径，例如 src/index.ts' },
    },
    required: ['path'],
  },
  execute: async (args, context) => {
    try {
      const target = await resolveWithinRoot(context.projectFolder, String(args.path))
      const stat = await fs.stat(target)
      if (!stat.isFile()) return fail('FILE_ACCESS_ERROR', '目标路径不是文件')
      const content = await fs.readFile(target, 'utf-8')
      const truncated = content.length > MAX_READ_CHARS
      return ok({
        path: path.relative(context.projectFolder, target),
        size: stat.size,
        truncated,
        content: truncated ? content.slice(0, MAX_READ_CHARS) : content,
      })
    } catch (error) {
      return fail(
        'FILE_ACCESS_ERROR',
        error instanceof Error ? error.message : String(error)
      )
    }
  },
}

/* ---------- file_write ---------- */

const MAX_WRITE_CHARS = 200_000
const PREVIEW_CHARS = 300

const fileWrite: ToolDefinition = {
  name: 'file_write',
  displayName: '写入文件',
  description:
    '将文本内容写入项目文件夹中的文件（UTF-8），路径相对于项目文件夹，会覆盖同名文件，执行前需要用户确认',
  permission: 'write',
  source: 'builtin',
  category: '文件',
  requirements: '需要关联项目文件夹，执行前需用户确认',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '相对路径，例如 docs/note.md' },
      content: { type: 'string', description: '要写入的完整文本内容' },
    },
    required: ['path', 'content'],
  },
  describeApproval: async (args, context) => {
    const content = typeof args.content === 'string' ? args.content : ''
    let targetPath = typeof args.path === 'string' ? args.path : ''
    let overwrite = false
    try {
      const target = await resolveWritePath(
        context.projectFolder,
        targetPath,
        context.permissionMode === 'full'
      )
      targetPath = path.relative(context.projectFolder, target) || targetPath
      const stat = await fs.stat(target).catch(() => null)
      overwrite = stat?.isFile() ?? false
    } catch {
      /* 路径非法时保持原始值，执行阶段会返回越界错误 */
    }
    return {
      targetPath,
      overwrite,
      contentLength: content.length,
      contentPreview:
        content.length > PREVIEW_CHARS ? `${content.slice(0, PREVIEW_CHARS)}…` : content,
    }
  },
  execute: async (args, context) => {
    try {
      const content = typeof args.content === 'string' ? args.content : ''
      if (content.length > MAX_WRITE_CHARS) {
        return fail(
          'CONTENT_TOO_LARGE',
          `写入内容超过 ${MAX_WRITE_CHARS} 字符限制（当前 ${content.length}）`
        )
      }
      const relativePath = String(args.path)
      if (path.isAbsolute(relativePath) && context.permissionMode !== 'full') {
        return fail('FILE_ACCESS_ERROR', '只允许使用相对于项目文件夹的路径')
      }
      const target = await resolveWritePath(
        context.projectFolder,
        relativePath,
        context.permissionMode === 'full'
      )
      const stat = await fs.stat(target).catch(() => null)
      if (stat?.isDirectory()) return fail('FILE_ACCESS_ERROR', '目标路径是目录，无法写入')
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, content, 'utf-8')
      return ok({
        path: path.relative(context.projectFolder, target),
        bytes: Buffer.byteLength(content, 'utf-8'),
        created: !stat,
      })
    } catch (error) {
      return fail(
        'FILE_ACCESS_ERROR',
        error instanceof Error ? error.message : String(error)
      )
    }
  },
}


/* ---------- http_fetch ---------- */
const MAX_RESPONSE_CHARS = 20_000
const HTTP_FETCH_MAX_ATTEMPTS = 3
const HTTP_FETCH_RETRY_DELAY_MS = 500

function shouldRetryHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

const httpFetch: ToolDefinition = {
  name: 'http_fetch',
  displayName: 'HTTP 请求',
  description: '通过 HTTP/HTTPS 获取指定 URL 的内容，仅使用 GET 请求，返回状态码、响应头和文本或 JSON 响应体。网络异常会自动重试。',
  permission: 'read',
  source: 'builtin',
  category: '网络',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Full URL to request, e.g. https://api.example.com/data' },
      headers: {
        type: 'object',
        description: '可选的请求头键值对，例如 {"Accept": "application/json"}',
        additionalProperties: { type: 'string' },
      },
    },
    required: ['url'],
  },
  execute: async (args, context) => {
    const rawUrl = String(args.url ?? '')
    let url: URL
    try {
      url = new URL(rawUrl)
    } catch {
      return fail('INVALID_URL', `无效的 URL: ${rawUrl}`)
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return fail('INVALID_URL', `仅支持 http: 和 https: 协议，当前为 ${url.protocol}`)
    }
    const headers = (args.headers as Record<string, string> | undefined) ?? {}

    for (let attempt = 1; attempt <= HTTP_FETCH_MAX_ATTEMPTS; attempt++) {
      try {
        const response = await fetch(rawUrl, { headers, signal: context.signal })
        if (shouldRetryHttpStatus(response.status) && attempt < HTTP_FETCH_MAX_ATTEMPTS) {
          await response.body?.cancel()
          await new Promise((resolve) => setTimeout(resolve, HTTP_FETCH_RETRY_DELAY_MS * attempt))
          continue
        }
      const text = await response.text()
      const truncated = text.length > MAX_RESPONSE_CHARS
      const bodyText = truncated ? text.slice(0, MAX_RESPONSE_CHARS) : text
      let parsedBody: unknown = bodyText
      const contentType = response.headers.get('content-type') ?? ''
      if (contentType.includes('application/json')) {
        try {
          parsedBody = JSON.parse(bodyText)
        } catch {
          // fallback to text
        }
      }
      const headerMap: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        headerMap[key] = value
      })
      return ok({
        url: rawUrl,
        method: 'GET',
        attempts: attempt,
        status: response.status,
        statusText: response.statusText,
        contentType,
        headers: headerMap,
        truncated,
        body: parsedBody,
      })
      } catch (error) {
        if (context.signal.aborted) {
          return fail('TOOL_ABORTED', 'HTTP 请求已被用户停止')
        }
        if (attempt === HTTP_FETCH_MAX_ATTEMPTS) {
          return fail(
            'NETWORK_ERROR',
            error instanceof Error ? error.message : String(error),
            true
          )
        }
        await new Promise((resolve) => setTimeout(resolve, HTTP_FETCH_RETRY_DELAY_MS * attempt))
      }
    }
    return fail('NETWORK_ERROR', 'HTTP 请求未完成', true)
  },
}
export function createBuiltinTools(): ToolDefinition[] {
  return [timeCurrent, calculator, fileList, fileRead, fileWrite, httpFetch]
}
