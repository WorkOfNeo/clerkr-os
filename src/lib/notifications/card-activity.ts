import { db } from "@/lib/db";

/**
 * Tell a card's followers something happened to it.
 *
 * Two filters, both deliberate:
 *  - the person who did it never hears about it — they were there;
 *  - `notifySubscribedCards` is per person, so following a card and wanting to
 *    be told about it stay separate choices.
 *
 * The dedupe key includes a timestamp because this IS an event, not a standing
 * fact — unlike the sweep's notifications, two moves an hour apart are two
 * pieces of news.
 */
export async function notifyCardActivity(input: {
  cardId: string;
  actorId: string;
  title: string;
  body?: string;
}): Promise<number> {
  const followers = await db.cardSubscriber.findMany({
    where: {
      cardId: input.cardId,
      userId: { not: input.actorId },
      user: { notifySubscribedCards: true },
    },
    select: { userId: true },
  });
  if (!followers.length) return 0;

  const stamp = Date.now();
  const { count } = await db.notification.createMany({
    data: followers.map((f) => ({
      userId: f.userId,
      kind: "CARD_ACTIVITY" as const,
      title: input.title,
      body: input.body,
      href: "/kanban",
      dedupeKey: `card-activity:${input.cardId}:${f.userId}:${stamp}`,
    })),
    skipDuplicates: true,
  });

  try {
    const { pushUnsent } = await import("./push");
    const fresh = await db.notification.findMany({
      where: { dedupeKey: { startsWith: `card-activity:${input.cardId}:` }, readAt: null },
      orderBy: { createdAt: "desc" },
      take: count,
      select: { id: true },
    });
    await pushUnsent(fresh.map((n) => n.id));
  } catch (err) {
    console.warn("[card-activity] push failed:", err);
  }

  return count;
}
