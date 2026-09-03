export interface KanbanFeatureRef {
  id: string;
  slug: string;
  title: string;
}

export interface KanbanAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
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
  attachments: KanbanAttachment[];
}
