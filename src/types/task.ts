export type TaskStatus = "OPEN" | "DONE";

export type TaskType =
  | "FOLLOW_UP"
  | "CALL"
  | "WHATSAPP_TEXT"
  | "WHATSAPP_AUDIO"
  | "WHATSAPP_VIDEO"
  | "DOCS_REQUEST"
  | "SCHEDULE_VISIT";

export interface Task {
  id: string;
  userId: string;
  leadId: string | null;
  type: TaskType;
  title: string;
  notes: string | null;
  dueAt: string; // ISO
  status: TaskStatus;
  createdAt: string; // ISO
}
