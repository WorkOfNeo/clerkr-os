// Sparse ordering maths, shared by the drag handler on the client and the write
// path on the server. Split out of lib/kanban.ts because that module imports
// the Prisma client, which must not be pulled into a client bundle.

export const ORDER_GAP = 1000;

/**
 * The `order` value for dropping a card into `index` of a column.
 * Midpoint between its new neighbours; the ends just extend by a gap. One row
 * is written per drop — no renumbering the column.
 */
export function orderForSlot(
  neighbours: { id: string; order: number }[],
  index: number,
  movingId?: string,
): number {
  const others = neighbours.filter((c) => c.id !== movingId);
  const before = others[index - 1]?.order;
  const after = others[index]?.order;
  if (before === undefined && after === undefined) return ORDER_GAP;
  if (before === undefined) return after! - ORDER_GAP;
  if (after === undefined) return before + ORDER_GAP;
  return Math.round((before + after) / 2);
}
