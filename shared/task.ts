export type TaskStatus =
  | "queued"
  | "preparing_attachments"
  | "parsing_attachments"
  | "generating"
  | "waiting_approval"
  | "running_tool"
  | "completed"
  | "failed"
  | "cancelled"

export interface TaskStatusEvent {
  status: TaskStatus
  error?: string
}
