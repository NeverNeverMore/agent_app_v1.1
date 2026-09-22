import { useState, useEffect } from 'react'
import { X, Eye, EyeOff, Check, AlertCircle, Loader2 } from 'lucide-react'
import type { ApiConfig } from '../../shared/types'
import { MODEL_SUGGESTIONS } from '../../shared/config'

interface SettingsDrawerProps {
  isOpen: boolean
  config: ApiConfig
  onSave: (patch: Partial<ApiConfig>) => void
  onClose: () => void
}

type TestStatus =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'success'; models?: number }
  | { type: 'error'; message: string }

export function SettingsDrawer({
  isOpen,
  config,
  onSave,
  onClose,
}: SettingsDrawerProps) {
  const [draft, setDraft] = useState<ApiConfig>(config)
  const [showKey, setShowKey] = useState(false)
  const [testStatus, setTestStatus] = useState<TestStatus>({ type: 'idle' })
  const [isSaved, setIsSaved] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setDraft(config)
    setTestStatus({ type: 'idle' })
    setIsSaved(false)
  }, [isOpen])

  useEffect(() => {
    if (!isSaved) return
    const timer = window.setTimeout(() => setIsSaved(false), 2200)
    return () => window.clearTimeout(timer)
  }, [isSaved])

  if (!isOpen) return null

  const handleChange = (patch: Partial<ApiConfig>) => {
    setDraft((prev) => ({ ...prev, ...patch }))
    setTestStatus({ type: 'idle' })
    setIsSaved(false)
  }

  const handleSave = () => {
    onSave({
      apiKey: draft.apiKey.trim(),
      baseUrl: draft.baseUrl.trim(),
      model: draft.model.trim(),
      protocol: draft.protocol,
    })
    setIsSaved(true)
  }

  const handleTest = async () => {
    if (!draft.apiKey.trim() || !draft.baseUrl.trim()) {
      setTestStatus({ type: 'error', message: '请填写接口密钥和请求地址' })
      return
    }
    setTestStatus({ type: 'loading' })
    setIsSaved(false)
    try {
      const result = await window.electronAPI.testApi({
        apiKey: draft.apiKey.trim(),
        baseUrl: draft.baseUrl.trim(),
        model: draft.model.trim(),
        protocol: draft.protocol,
      })
      if (result.ok) {
        setTestStatus({ type: 'success', models: result.models })
      } else {
        setTestStatus({ type: 'error', message: result.error || '检测失败' })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setTestStatus({ type: 'error', message })
    }
  }

  const canTest = Boolean(draft.apiKey.trim() && draft.baseUrl.trim())

  return (
    <div className="drawer-overlay">
      <aside
        className="settings-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="drawer-header">
          <h3 id="settings-title">设置</h3>
          <button
            type="button"
            onClick={onClose}
            className="icon-button"
            aria-label="关闭设置"
            title="关闭"
          >
            <X size={20} />
          </button>
        </div>

        <div className="drawer-body">
          <div className="field">
            <label htmlFor="api-key">接口密钥</label>
            <div className="input-with-button">
              <input
                id="api-key"
                type={showKey ? 'text' : 'password'}
                value={draft.apiKey}
                onChange={(e) => handleChange({ apiKey: e.target.value })}
                placeholder="输入你的 LINGQI 接口密钥"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="icon-button"
                aria-label={showKey ? '隐藏' : '显示'}
              >
                {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="field">
            <label htmlFor="api-protocol">协议</label>
            <select
              id="api-protocol"
              value={draft.protocol}
              onChange={(e) => handleChange({ protocol: e.target.value as ApiConfig['protocol'] })}
            >
              <option value="openai">OpenAI Compatible</option>
              <option value="anthropic">Anthropic Messages</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="api-url">API 请求地址</label>
            <input
              id="api-url"
              type="text"
              value={draft.baseUrl}
              onChange={(e) => handleChange({ baseUrl: e.target.value })}
              placeholder="https://api.kimi.com/coding/v1"
            />
          </div>

          <div className="field">
            <label htmlFor="api-model">选用模型</label>
            <input
              id="api-model"
              type="text"
              list="model-suggestions"
              value={draft.model}
              onChange={(e) => handleChange({ model: e.target.value })}
              placeholder="kimi-code-plan"
            />
            <datalist id="model-suggestions">
              {MODEL_SUGGESTIONS.map((model) => (
                <option key={model} value={model} />
              ))}
            </datalist>
          </div>

          <button
            type="button"
            onClick={handleTest}
            disabled={!canTest || testStatus.type === 'loading'}
            className="test-button"
          >
            {testStatus.type === 'loading' ? (
              <Loader2 size={18} className="spin" />
            ) : (
              <Check size={18} />
            )}
            检测联通
          </button>

          {testStatus.type !== 'idle' && testStatus.type !== 'loading' && (
            <div className={`test-result ${testStatus.type}`}>
              {testStatus.type === 'success' ? (
                <Check size={18} />
              ) : (
                <AlertCircle size={18} />
              )}
              <span>
                {testStatus.type === 'success'
                  ? testStatus.models === undefined
                    ? '连接成功'
                    : `连接成功，可用模型 ${testStatus.models} 个`
                  : testStatus.message}
              </span>
            </div>
          )}

          <p className="hint">
            设置、会话历史和项目文件夹关联会保存在本地。
          </p>
        </div>

        <div className="drawer-footer">
          <span className={`save-status ${isSaved ? 'visible' : ''}`} role="status" aria-live="polite">
            {isSaved ? <><Check size={15} /> 保存成功</> : null}
          </span>
          <button type="button" onClick={handleSave} className="primary">
            保存
          </button>
        </div>
      </aside>
    </div>
  )
}
