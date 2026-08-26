import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ApiConfig, PermissionMode } from '../shared/types'
import type { TaskStatusEvent } from '../shared/task'
import type { ChatAttachment } from '../shared/attachments'
import { cleanupAttachments, cleanupOldAttachments, prepareAttachments, selectAndCopyAttachments } from './attachments'
import {
  approveApproval,
  cancelApprovalsForRequest,
  configureApprovalStore,
  listPendingApprovals,
  rejectApproval,
} from './approvals'
import { runAgentLoop } from './agentLoop'
import { getToolRegistry } from './tools'
import { protocolEndpoint } from './protocol'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function createApplicationMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '刷新' },
        { role: 'forceReload', label: '强制刷新' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '重置缩放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'close', label: '关闭' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: '关于', click: () => mainWindow?.show() },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

let mainWindow: BrowserWindow | null = null
const abortControllers = new Map<number, AbortController>()

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    title: 'chat',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  configureApprovalStore(path.join(app.getPath('userData'), 'pending-approvals.json'))
  void cleanupOldAttachments(app.getPath('temp'))
  createWindow()
  createApplicationMenu()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface SendMessagePayload {
  id: number
  config: ApiConfig
  messages: Message[]
  projectFolder?: string
  permissionMode?: PermissionMode
  conversationId?: string
  attachments?: ChatAttachment[]
}

ipcMain.on('send-message', async (event, payload: SendMessagePayload) => {
  const { id, config, messages, projectFolder = '', permissionMode = 'ask', conversationId = '', attachments = [] } = payload
  const controller = new AbortController()
  abortControllers.set(id, controller)

  try {
    event.sender.send('task-status', { id, event: { status: 'queued' } satisfies TaskStatusEvent })
    const preparedAttachments = await prepareAttachments(attachments, (status) => event.sender.send('task-status', { id, event: { status } satisfies TaskStatusEvent }))
    await runAgentLoop({
      config,
      messages,
      projectFolder,
      permissionMode,
      requestId: id,
      conversationId,
      attachments: preparedAttachments,
      signal: controller.signal,
      emitChunk: (content) => event.sender.send('stream-chunk', { id, content }),
      emitToolEvent: (toolEvent) =>
        event.sender.send('tool-event', { id, event: toolEvent }),
      emitApproval: (approvalEvent) =>
        event.sender.send('approval-event', { id, event: approvalEvent }),
      emitTaskStatus: (taskEvent) =>
        event.sender.send('task-status', { id, event: taskEvent }),
    })
    event.sender.send('task-status', { id, event: { status: controller.signal.aborted ? 'cancelled' : 'completed' } satisfies TaskStatusEvent })
    event.sender.send('stream-done', { id })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    event.sender.send('task-status', { id, event: { status: controller.signal.aborted ? 'cancelled' : 'failed', error: message } satisfies TaskStatusEvent })
    event.sender.send('stream-error', { id, error: message })
  } finally {
    cancelApprovalsForRequest(id)
    abortControllers.delete(id)
    if (attachments.length) setTimeout(() => void cleanupAttachments(attachments), 10 * 60 * 1000)
  }
})

ipcMain.on('abort-message', (_event, { id }: { id: number }) => {
  const controller = abortControllers.get(id)
  if (controller) {
    controller.abort()
    abortControllers.delete(id)
  }
  cancelApprovalsForRequest(id)
})

ipcMain.handle(
  'approve-tool',
  (_event, { approvalId, argumentsHash }: { approvalId: string; argumentsHash: string }) =>
    approveApproval(approvalId, argumentsHash)
)

ipcMain.handle('reject-tool', (_event, { approvalId }: { approvalId: string }) =>
  rejectApproval(approvalId)
)

ipcMain.handle('list-pending-approvals', () => listPendingApprovals())

ipcMain.handle('test-api', async (_event, config: ApiConfig) => {
  try {
    if (config.protocol === 'anthropic') {
      const response = await fetch(protocolEndpoint(config.baseUrl, '/v1/messages'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 8,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      })
      if (!response.ok) {
        const text = await response.text()
        return { ok: false, error: `HTTP ${response.status}: ${text || response.statusText}` }
      }
      return { ok: true }
    }

    const response = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
    })

    if (!response.ok) {
      const text = await response.text()
      return {
        ok: false,
        error: `HTTP ${response.status}: ${text || response.statusText}`,
      }
    }

    const data = (await response.json()) as { data?: unknown[] }
    return { ok: true, models: data.data?.length ?? 0 }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message }
  }
})

ipcMain.handle('import-attachments', async (_event, filePaths: string[]) => selectAndCopyAttachments(app.getPath('temp'), filePaths))

ipcMain.handle('select-attachments', async () => {
  if (!mainWindow) return []
  const result = await dialog.showOpenDialog(mainWindow, { title: '????????', properties: ['openFile', 'multiSelections'] })
  if (result.canceled) return []
  return selectAndCopyAttachments(app.getPath('temp'), result.filePaths)
})

ipcMain.handle('cleanup-attachments', async (_event, attachments: ChatAttachment[]) => { await cleanupAttachments(attachments); return { ok: true } })

ipcMain.handle('select-folder', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择项目文件夹',
    properties: ['openDirectory', 'createDirectory'],
  })
  return result.canceled ? null : result.filePaths[0] ?? null
})

ipcMain.handle('list-tools', () => getToolRegistry().listMeta())
