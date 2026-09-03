// Next.js instrumentation hook — runs once when the server process starts.
// Starts the embedding sweep so anything created without a vector (OpenAI
// down, bulk backfill, transient failure) becomes searchable within minutes
// with no manual step.

const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
// Local hour the memory pass runs — late enough that the day is done.
const NIGHTLY_HOUR = 3;
const FIRST_RUN_DELAY_MS = 30_000;

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Shout if the document volume isn't actually there. Getting this wrong loses
  // files silently, so it's checked once at boot rather than discovered later.
  try {
    const { checkStorageReady } = await import("@/lib/documents/storage");
    const status = await checkStorageReady();
    if (!status.ok) {
      console.error(`[documents] STORAGE MISCONFIGURED — ${status.problem}`);
    } else if (status.backend === "VOLUME") {
      console.log("[documents] storing files on the mounted volume");
    }
  } catch (err) {
    console.warn("[documents] storage check failed:", err);
  }

  const g = globalThis as typeof globalThis & {
    __embedSweepTimer?: ReturnType<typeof setInterval>;
    __lastMemoryPass?: string;
  };
  if (g.__embedSweepTimer) return; // dev hot-reload guard

  const run = async () => {
    try {
      const { sweepMissingEmbeddings } = await import("@/lib/ai/embed-sweep");
      const result = await sweepMissingEmbeddings(25);
      const total = Object.values(result.embedded).reduce((a, b) => a + b, 0);
      if (total > 0 || result.errors > 0) {
        console.log("[embed-sweep]", JSON.stringify(result));
      }
    } catch (err) {
      console.warn("[embed-sweep] pass failed:", err);
    }
  };

  // Notifications ride the same timer. Both are best-effort background work
  // and neither should ever be able to take the other down, so they are
  // separately wrapped.
  const notify = async () => {
    try {
      const { sweepNotifications, pruneNotifications } = await import(
        "@/lib/notifications/sweep"
      );
      const result = await sweepNotifications();
      if (result.created > 0) {
        console.log("[notifications]", JSON.stringify(result));
        // Only the rows that were actually new get pushed — skipDuplicates
        // means an existing fact produced no row and must not re-ping a phone.
        const { db } = await import("@/lib/db");
        const fresh = await db.notification.findMany({
          where: { readAt: null },
          orderBy: { createdAt: "desc" },
          take: result.created,
          select: { id: true },
        });
        const { pushUnsent } = await import("@/lib/notifications/push");
        await pushUnsent(fresh.map((n) => n.id));
      }
      await pruneNotifications();
    } catch (err) {
      console.warn("[notifications] sweep failed:", err);
    }
  };

  // Once an hour, check whether the nightly memory pass is due. A plain
  // "every 24h" interval drifts with every restart and would eventually run at
  // lunchtime; checking the clock keeps it at night whatever happens.
  const memoryPass = async () => {
    const hour = new Date().getHours();
    if (hour !== NIGHTLY_HOUR) return;

    const today = new Date().toISOString().slice(0, 10);
    if (g.__lastMemoryPass === today) return; // already ran tonight
    g.__lastMemoryPass = today;

    try {
      const { runNightlyMemoryPass } = await import("@/lib/memory/nightly");
      const result = await runNightlyMemoryPass();
      if (result.proposed > 0 || result.scannedMessages > 0) {
        console.log("[memory]", JSON.stringify(result));
      }
    } catch (err) {
      console.warn("[memory] nightly pass failed:", err);
    }
  };

  g.__embedSweepTimer = setInterval(() => {
    void run();
    void notify();
    void memoryPass();
  }, SWEEP_INTERVAL_MS);
  setTimeout(run, FIRST_RUN_DELAY_MS);
  setTimeout(notify, FIRST_RUN_DELAY_MS + 5_000);
}
