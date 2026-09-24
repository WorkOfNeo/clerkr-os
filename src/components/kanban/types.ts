export interface KanbanFeatureRef {
  id: string;
  slug: string;
  title: string;
}

export interface KanbanTicketRef {
  id: string;
  slug: string;
  number: number;
  title: string;
  status: string;
}

export interface KanbanAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
}

export interface BoardSubtask {
  id: string;
  title: string;
  done: boolean;
  doneAt: string | Date | null;
  order: number;
  /** The NEO Ledger plan item / task this line mirrors, once a sync linked it. */
  ledgerRef: string | null;
}

export interface BoardColumn {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  color: string;
  icon: string | null;
  sortOrder: number;
  isDone: boolean;
  isDefault: boolean;
  wipLimit: number | null;
}

/** Server column row → the shape the board components take. Shared by the
 *  board and the card page so both hand the client the same thing. */
export function toBoardColumn(c: BoardColumn & Record<string, unknown>): BoardColumn {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    color: c.color,
    icon: c.icon,
    sortOrder: c.sortOrder,
    isDone: c.isDone,
    isDefault: c.isDefault,
    wipLimit: c.wipLimit,
  };
}

export interface BoardCard {
  id: string;
  slug: string;
  number: number;
  title: string;
  description: string | null;
  columnId: string;
  order: number;
  confidence: number;
  themeTag: string | null;
  blocked: boolean;
  blockerNote: string | null;
  dueDate: string | Date | null;
  completedAt: string | Date | null;
  featureId: string | null;
  feature: KanbanFeatureRef | null;
  ticketId: string | null;
  ticket: KanbanTicketRef | null;
  attachments: KanbanAttachment[];
  subtasks: BoardSubtask[];
  ledgerUrl: string | null;
  ledgerProjectId: string | null;
  ledgerSyncedAt: string | Date | null;
}
