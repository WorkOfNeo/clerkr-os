// Next.js instrumentation hook — runs once when the server process starts.
// Starts the embedding sweep so anything created without a vector (OpenAI
// down, bulk backfill, transient failure) becomes searchable within minutes
// with no manual step.

const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 30_000;

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const g = globalThis as typeof globalThis & {
    __embedSweepTimer?: ReturnType<typeof setInterval>;
  };
  if (g.__embedSweepTimer) return; // dev hot-reload guard

  const run = async () => {
    try {
      const { sweepMissingEmbeddings } = await import("@/lib/ai/embed-sweep");
      const result = await sweepMissingEmbeddings(25);
      const total =
        result.embedded.wikiNotes + result.embedded.features + result.embedded.meetings;
      if (total > 0 || result.errors > 0) {
        console.log("[embed-sweep]", JSON.stringify(result));
      }
    } catch (err) {
      console.warn("[embed-sweep] pass failed:", err);
    }
  };

  g.__embedSweepTimer = setInterval(run, SWEEP_INTERVAL_MS);
  setTimeout(run, FIRST_RUN_DELAY_MS);
}
