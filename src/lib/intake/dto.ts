import { DUPLICATE_THRESHOLD } from "@/lib/ai/intake";

// Shape and mapper for proposals crossing the server/client boundary.
//
// Deliberately NOT in chat/intake-actions.ts: a "use server" module may only
// export async functions, so a synchronous mapper there breaks the build.

export interface ProposalDTO {
  id: string;
  kind: string;
  status: string;
  title: string;
  body: string | null;
  payload: Record<string, unknown>;
  matchType: string | null;
  matchId: string | null;
  matchTitle: string | null;
  matchScore: number | null;
  /** Above the dedupe threshold — the UI leads with "comment instead". */
  likelyDuplicate: boolean;
  createdType: string | null;
  createdId: string | null;
}

export function toDTO(p: {
  id: string;
  kind: string;
  status: string;
  title: string;
  body: string | null;
  payload: unknown;
  matchType: string | null;
  matchId: string | null;
  matchTitle: string | null;
  matchScore: number | null;
  createdType: string | null;
  createdId: string | null;
}): ProposalDTO {
  return {
    id: p.id,
    kind: p.kind,
    status: p.status,
    title: p.title,
    body: p.body,
    payload: (p.payload ?? {}) as Record<string, unknown>,
    matchType: p.matchType,
    matchId: p.matchId,
    matchTitle: p.matchTitle,
    matchScore: p.matchScore,
    likelyDuplicate: (p.matchScore ?? 0) >= DUPLICATE_THRESHOLD,
    createdType: p.createdType,
    createdId: p.createdId,
  };
}
