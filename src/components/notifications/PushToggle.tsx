"use client";

import { useEffect, useState, useTransition } from "react";
import { BellOff, BellRing } from "lucide-react";

import {
  deletePushSubscription,
  savePushSubscription,
  sendTestPush,
} from "@/app/notifications/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * VAPID keys travel as base64url; the Push API wants raw bytes.
 *
 * Backed by an explicit ArrayBuffer so the result is the NARROW
 * `Uint8Array<ArrayBuffer>` that `applicationServerKey` accepts — the default
 * `new Uint8Array(n)` widens to ArrayBufferLike and fails tsc, the same trap
 * as Prisma's Bytes input (see lib/images/decode-data-url.ts).
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalised);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Turning on push. Three things have to line up — a registered service worker,
 * the OS permission, and a subscription saved server-side — so the button
 * reports which one is missing rather than just failing.
 */
export function PushToggle({ publicKey }: { publicKey: string | null }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [standalone, setStandalone] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(ok);

    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
    const installed =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    // Only iOS actually refuses push outside an installed app; elsewhere a tab
    // is fine, so don't nag desktop users to install.
    setStandalone(!isIOS || installed);

    if (!ok) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setEnabled(Boolean(sub)))
      .catch(() => setEnabled(false));
  }, []);

  async function enable() {
    if (!publicKey) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast(
          permission === "denied"
            ? "Notifications are blocked for this site — turn them back on in your browser or iOS settings."
            : "Notifications weren't allowed.",
          { tone: "error" },
        );
        return;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("The browser returned an incomplete subscription.");
      }

      await savePushSubscription({
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        userAgent: navigator.userAgent.slice(0, 200),
      });
      setEnabled(true);
      toast("This device will get notifications", { tone: "success" });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not turn notifications on.", {
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await deletePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setEnabled(false);
      toast("Notifications off for this device");
    } catch {
      toast("Could not turn them off.", { tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  if (!publicKey) {
    return (
      <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-[13px] text-muted-foreground">
        Push isn&apos;t configured on the server. Generate a key pair with{" "}
        <code className="rounded bg-card px-1 py-0.5 text-[12px]">
          npx web-push generate-vapid-keys
        </code>{" "}
        and set <code className="text-[12px]">VAPID_PUBLIC_KEY</code> and{" "}
        <code className="text-[12px]">VAPID_PRIVATE_KEY</code>. The in-app bell works regardless.
      </p>
    );
  }

  if (!supported) {
    return (
      <p className="text-[13px] text-muted-foreground">
        This browser can&apos;t do push notifications. The bell in the sidebar still works.
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      {!standalone && (
        <p className="rounded-lg bg-warning/10 px-3 py-2.5 text-[13px] text-warning">
          On iPhone and iPad, notifications only reach the app once it&apos;s on your Home Screen.
          Install it first with the steps above, then open it from there and come back.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={enabled ? disable : enable} disabled={busy || !standalone}>
          {enabled ? (
            <>
              <BellOff className="h-3.5 w-3.5" />
              Turn off on this device
            </>
          ) : (
            <>
              <BellRing className="h-3.5 w-3.5" />
              {busy ? "Asking…" : "Turn on for this device"}
            </>
          )}
        </Button>

        {enabled && (
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const { sent } = await sendTestPush();
                toast(
                  sent > 0
                    ? `Test sent to ${sent} device${sent === 1 ? "" : "s"}`
                    : "No device received it — try turning it off and on again.",
                  { tone: sent > 0 ? "success" : "error" },
                );
              })
            }
          >
            Send a test
          </Button>
        )}
      </div>

      <p className="text-[12.5px] text-muted-foreground">
        Each device is separate — turning it on here doesn&apos;t turn it on for your phone.
      </p>
    </div>
  );
}
