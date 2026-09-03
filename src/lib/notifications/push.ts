import webpush from "web-push";

import { db } from "@/lib/db";

/**
 * Web push, so a notification reaches the phone with the app closed.
 *
 * Optional by design, exactly like OPENAI_API_KEY: without VAPID keys the app
 * runs fine and simply never offers to push. Generate a pair once with
 * `npx web-push generate-vapid-keys` and set them in the environment.
 *
 * iOS only delivers push to a PWA that has been ADDED TO THE HOME SCREEN — a
 * tab in Safari will never receive one, however the permission prompt looks.
 * That is why the install guide comes first in the settings page.
 */

export function isPushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

function configure(): void {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT?.trim() || "mailto:nh@neo-labs.com",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
}

export interface PushPayload {
  title: string;
  body?: string;
  href?: string;
  tag?: string;
}

/**
 * Send to every device a user has installed. Returns how many landed.
 *
 * A 404 or 410 means the browser threw the subscription away (app deleted,
 * cache cleared) — that row is dead and gets removed rather than retried
 * forever.
 */
export async function sendPush(userId: string, payload: PushPayload): Promise<number> {
  if (!isPushConfigured()) return 0;
  configure();

  const subs = await db.pushSubscription.findMany({ where: { userId } });
  if (!subs.length) return 0;

  let sent = 0;
  const dead: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload),
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(sub.id);
        else console.warn("[push] send failed:", status ?? err);
      }
    }),
  );

  if (dead.length) {
    await db.pushSubscription.deleteMany({ where: { id: { in: dead } } });
  }
  if (sent > 0) {
    await db.pushSubscription.updateMany({
      where: { userId },
      data: { lastSentAt: new Date() },
    });
  }
  return sent;
}

/** Push the notifications a sweep just created, to everyone with a device. */
export async function pushUnsent(notificationIds: string[]): Promise<number> {
  if (!isPushConfigured() || !notificationIds.length) return 0;

  const notes = await db.notification.findMany({
    where: { id: { in: notificationIds } },
    select: { id: true, userId: true, kind: true, title: true, body: true, href: true },
  });

  // A workspace-wide notification (userId null) goes to everyone who has a
  // device registered — this is a single-tenant tool, the news is shared.
  const everyone = await db.pushSubscription.findMany({
    distinct: ["userId"],
    select: { userId: true },
  });

  let sent = 0;
  for (const note of notes) {
    const targets = note.userId ? [note.userId] : everyone.map((s) => s.userId);
    for (const userId of targets) {
      sent += await sendPush(userId, {
        title: note.title,
        body: note.body ?? undefined,
        href: note.href ?? undefined,
        tag: `${note.kind}:${note.id}`,
      });
    }
  }
  return sent;
}
