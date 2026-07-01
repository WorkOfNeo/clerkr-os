export interface KanbanStatus {
  id: string;
  label: string;
  color: string;
  isDone: boolean;
}

export interface KanbanAssignee {
  user: { id: string; email: string; name: string };
}

export interface KanbanTask {
  id: string;
  slug: string;
  name: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  order: number;
  statusId: string;
  sprintId: string | null;
  dueDate: Date | string | null;
  estimatedHours: number | string | null;
  loggedHours: number | string | null;
  assignees: KanbanAssignee[];
  blockedBy: { blocker: { id: string; slug: string; name: string } }[];
  group: { label: string; color: string } | null;
  stack: { label: string; color: string } | null;
}
