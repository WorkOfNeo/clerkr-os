"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { isPushConfigured, sendPush, vapidPublicKey } from "@/lib/notifications/push";
import { requireSession } from "@/lib/session";

export async function listNotifications(limit = 30) {
  const session = await requireSession();
  return db.notification.findMany({
    where: { OR: [{ userId: null }, { userId: session.user.id }] },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function unreadCount(): Promise<number> {
  const session = await requireSession();
  return db.notification.count({
    where: { readAt: null, OR: [{ userId: null }, { userId: session.user.id }] },
  });
}

export async function markRead(id: string): Promise<void> {
  await requireSession();
  await db.notification.update({ where: { id }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
}

export async function markAllRead(): Promise<void> {
  const session = await requireSession();
  await db.notification.updateMany({
    where: { readAt: null, OR: [{ userId: null }, { userId: session.user.id }] },
    data: { readAt: new Date() },
  });
  revalidatePath("/", "layout");
}

// ─── Push ────────────────────────────────────────────────────────────────────

export async function pushStatus(): Promise<{ configured: boolean; publicKey: string | null }> {
  await requireSession();
  return { configured: isPushConfigured(), publicKey: vapidPublicKey() };
}

const subSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  userAgent: z.string().optional(),
});

/** Register this device. Upserted on the endpoint, which is the browser's own
 *  identity for the subscription — re-subscribing must not create a second. */
export async function savePushSubscription(
  input: z.infer<typeof subSchema>,
): Promise<{ ok: true }> {
  const session = await requireSession();
  const parsed = subSchema.parse(input);

  await db.pushSubscription.upsert({
    where: { endpoint: parsed.endpoint },
    create: { ...parsed, userId: session.user.id },
    update: { p256dh: parsed.p256dh, auth: parsed.auth, userId: session.user.id },
  });
  return { ok: true };
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  await requireSession();
  await db.pushSubscription.deleteMany({ where: { endpoint } });
}

/** Prove the whole chain works — keys, subscription, service worker, phone. */
export async function sendTestPush(): Promise<{ sent: number }> {
  const session = await requireSession();
  const sent = await sendPush(session.user.id, {
    title: "Clerkr OS",
    body: "Notifications are working.",
    href: "/chat",
    tag: "test",
  });
  return { sent };
}

export async function deviceCount(): Promise<number> {
  const session = await requireSession();
  return db.pushSubscription.count({ where: { userId: session.user.id } });
}
