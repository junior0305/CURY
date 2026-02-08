import { supabase } from "./client";
import type { Task, TaskStatus, TaskType } from "@/types/task";

const mapTaskFromDB = (t: any): Task => ({
  id: t.id,
  userId: t.user_id,
  leadId: t.lead_id,
  type: t.type as TaskType,
  title: t.title,
  notes: t.notes,
  dueAt: t.due_at,
  status: t.status as TaskStatus,
  createdAt: t.created_at,
});

export async function fetchOpenTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("status", "OPEN")
    .order("due_at", { ascending: true });

  if (error) {
    if ((error as any).code === 'PGRST303' || (error as any).message?.includes('JWT')) {
      window.dispatchEvent(new CustomEvent('supabase-auth-error', { detail: error }));
    }
    throw error;
  }
  return (data || []).map(mapTaskFromDB);
}

export async function createTask(input: {
  userId: string;
  leadId: string | null;
  type: TaskType;
  title: string;
  notes?: string | null;
  dueAt: string; // ISO
}): Promise<Task> {
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      user_id: input.userId,
      lead_id: input.leadId,
      type: input.type,
      title: input.title,
      notes: input.notes ?? null,
      due_at: input.dueAt,
      status: "OPEN",
    })
    .select("*")
    .single();

  if (error) throw error;
  return mapTaskFromDB(data);
}

export async function markTaskDone(taskId: string): Promise<void> {
  const { error } = await supabase.from("tasks").update({ status: "DONE" }).eq("id", taskId);
  if (error) throw error;
}

export async function snoozeTask(taskId: string, nextDueAtIso: string): Promise<void> {
  const { error } = await supabase
    .from("tasks")
    .update({ due_at: nextDueAtIso })
    .eq("id", taskId);
  if (error) throw error;
}