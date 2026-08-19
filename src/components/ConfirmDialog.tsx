import { AlertTriangle } from 'lucide-react'

interface ConfirmDialogProps {
  conversationTitle: string
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmDialog({
  conversationTitle,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <div className="confirm-overlay">
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
      >
        <div className="confirm-icon">
          <AlertTriangle size={22} />
        </div>
        <h3 id="delete-dialog-title">删除会话</h3>
        <p>确定删除“{conversationTitle}”吗？删除后无法恢复。</p>
        <div className="confirm-actions">
          <button type="button" className="secondary" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="danger" onClick={onConfirm}>
            删除
          </button>
        </div>
      </div>
    </div>
  )
}