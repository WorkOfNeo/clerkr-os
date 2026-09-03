"use client";

import { useEffect, useState } from "react";
import { Check, Share, SquarePlus } from "lucide-react";

import { cn } from "@/lib/utils";

type Platform = "ios" | "android" | "desktop" | "unknown";

/**
 * How to install the app, told for the device in your hand rather than as a
 * matrix of every platform. Detection is after mount — a server render can't
 * know the user agent without opting the whole page out of caching.
 */
export function InstallGuide() {
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    // iPadOS reports as Macintosh, so touch points are the reliable tell.
    const isIOS =
      /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
    setPlatform(isIOS ? "ios" : /Android/.test(ua) ? "android" : "desktop");

    setInstalled(
      window.matchMedia("(display-mode: standalone)").matches ||
        // iOS's own non-standard flag, still the only reliable one there.
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true,
    );
  }, []);

  if (installed) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2.5 text-[13px]">
        <Check className="h-4 w-4 shrink-0" />
        <span>
          Installed — you&apos;re running the app, not the browser. Notifications can reach you here.
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {platform === "ios" && (
        <Steps
          heading="iPhone or iPad — Safari"
          note="It has to be Safari. Chrome and Firefox on iOS can't install a web app, and iOS only delivers notifications to an app on the Home Screen — never to a tab."
          steps={[
            <>
              Tap <Chip icon={<Share className="h-3 w-3" />}>Share</Chip> in the toolbar — the
              square with an arrow coming out of it.
            </>,
            <>
              Scroll down and tap{" "}
              <Chip icon={<SquarePlus className="h-3 w-3" />}>Add to Home Screen</Chip>.
            </>,
            <>Tap <strong>Add</strong>, top right.</>,
            <>Open Clerkr OS from the Home Screen. It runs without the address bar.</>,
          ]}
        />
      )}

      {platform === "android" && (
        <Steps
          heading="Android — Chrome"
          steps={[
            <>Tap the <strong>⋮</strong> menu, top right.</>,
            <>Tap <strong>Add to Home screen</strong> (or <strong>Install app</strong>).</>,
            <>Confirm, then open it from your home screen.</>,
          ]}
        />
      )}

      {platform === "desktop" && (
        <Steps
          heading="Desktop — Chrome or Edge"
          note="Safari on macOS installs from File → Add to Dock."
          steps={[
            <>
              Click the <strong>install icon</strong> in the address bar — a monitor with a
              downward arrow.
            </>,
            <>Or open the <strong>⋮</strong> menu and choose <strong>Install Clerkr OS</strong>.</>,
            <>It opens in its own window, with its own icon.</>,
          ]}
        />
      )}

      {platform === "unknown" && (
        <p className="text-[13px] text-muted-foreground">Checking your device…</p>
      )}
    </div>
  );
}

function Steps({
  heading,
  note,
  steps,
}: {
  heading: string;
  note?: string;
  steps: React.ReactNode[];
}) {
  return (
    <div className="rounded-lg bg-card p-4 shadow-xs ring-1 ring-inset ring-hairline">
      <h3 className="text-[14px] font-semibold">{heading}</h3>
      {note && <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">{note}</p>}
      <ol className="mt-3 space-y-2.5">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold tabular-nums">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Chip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "mx-0.5 inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 align-middle",
        "text-[12px] font-medium",
      )}
    >
      {icon}
      {children}
    </span>
  );
}
