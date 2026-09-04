import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { configureApprovalStore, createApproval, approveApproval, rejectApproval, listPendingApprovals } from '../electron/approvals.ts'

test('审批创建、查询、批准与持久化清理', async () => {
  const file = path.join(os.tmpdir(), `approvals-${Date.now()}.json`)
  configureApprovalStore(file)
  const { request, decision } = createApproval({ requestId: 1, conversationId: 'c1', toolCallId: 't1', toolName: 'file_write', arguments: '{}', permission: 'write', emitUpdate: () => {} })
  assert.equal(listPendingApprovals().length, 1)
  assert.equal(approveApproval(request.id, request.argumentsHash).ok, true)
  assert.equal(await decision, 'approved')
  assert.equal(listPendingApprovals().length, 0)
  assert.equal(fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).length : 0, 0)
})

test('错误 hash 不会批准，拒绝后终态可等待', async () => {
  configureApprovalStore(path.join(os.tmpdir(), `approvals-${Date.now()}-2.json`))
  const { request, decision } = createApproval({ requestId: 2, conversationId: 'c1', toolCallId: 't2', toolName: 'file_write', arguments: '{}', permission: 'write', emitUpdate: () => {} })
  assert.equal(approveApproval(request.id, 'bad').ok, false)
  assert.equal(rejectApproval(request.id).ok, true)
  assert.equal(await decision, 'rejected')
})
