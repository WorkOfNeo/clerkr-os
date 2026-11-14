/** Small pieces for the /admin/numbers-links and /admin/revenue-firms pages; styles in ./numbers.css. */

const nf = new Intl.NumberFormat("da-DK");
export const fmtNum = (n: number) => nf.format(Math.round(n));
export const fmtKr = (n: number) => `${nf.format(Math.round(n))} kr.`;

export function Badge({ tone, children }: { tone?: "green" | "amber" | "red"; children: React.ReactNode }) {
  return (
    <span className="nb-badge" data-tone={tone}>
      {children}
    </span>
  );
}

export function firmStatus(f: { isActive: boolean; isDemo: boolean; inTrial: boolean; trialEndsAt: string | Date | null }): {
  label: string;
  tone?: "green" | "amber" | "red";
} {
  if (!f.isActive) return { label: "Inactive in Clerkr", tone: "red" };
  if (f.isDemo) return { label: "Demo", tone: "amber" };
  if (f.inTrial) {
    const ends = f.trialEndsAt ? new Date(f.trialEndsAt) : null;
    return {
      label: ends ? `Trial · ends ${ends.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "Trial",
      tone: "amber",
    };
  }
  return { label: "Customer", tone: "green" };
}

export function relTime(iso: string | Date | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen" });
  const dayKey = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: "Europe/Copenhagen" });
  if (dayKey(d) === dayKey(now)) return `today ${time}`;
  const y = new Date(now.getTime() - 86_400_000);
  if (dayKey(d) === dayKey(y)) return "yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/Copenhagen" });
}
