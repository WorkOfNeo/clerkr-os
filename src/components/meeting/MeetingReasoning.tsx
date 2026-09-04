import { Search, Sparkles } from "lucide-react";

import type { ReasoningTrace } from "@/lib/meetings/review";

/**
 * How the last read was reasoned. The summary is always visible; the step by
 * step trace (what was searched, what came back, what was kept and dropped)
 * sits behind a disclosure so the page stays scannable.
 */
export function MeetingReasoning({ trace }: { trace: ReasoningTrace }) {
  const searches = trace.steps.filter((s) => s.kind === "search");
  const finalize = trace.steps.find((s) => s.kind === "finalize");
  const notes = trace.steps.filter((s) => s.kind === "note");
  const hasDetail = trace.steps.length > 0;

  return (
    <section className="surface p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2} />
        How it was read
        {!trace.completed && (
          <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
            not reviewed
          </span>
        )}
      </h2>
      <p className="text-sm text-muted-foreground">{trace.summary}</p>

      {hasDetail && (
        <details className="group mt-3">
          <summary className="cursor-pointer select-none text-[12px] font-medium text-muted-foreground hover:text-foreground">
            {searches.length} search{searches.length === 1 ? "" : "es"}
            {finalize && finalize.kind === "finalize" ? (
              <>
                {" "}
                · kept {finalize.kept}
                {finalize.dropped.length > 0 && <> · dropped {finalize.dropped.length}</>}
              </>
            ) : null}
            <span className="ml-1 text-muted-foreground/60 group-open:hidden">— show</span>
            <span className="ml-1 hidden text-muted-foreground/60 group-open:inline">— hide</span>
          </summary>

          <ol className="mt-3 space-y-3 border-l pl-4 text-[12.5px]">
            {trace.steps.map((step, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-muted-foreground/40" />
                {step.kind === "search" && (
                  <div>
                    <p className="flex items-center gap-1.5 text-foreground">
                      <Search className="h-3 w-3 text-muted-foreground" />
                      Searched {step.stores.join(", ")} for &ldquo;{step.query}&rdquo;
                    </p>
                    {step.hits.length ? (
                      <ul className="mt-1 space-y-0.5 text-muted-foreground">
                        {step.hits.map((h, j) => (
                          <li key={j} className="truncate">
                            {h}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-0.5 text-muted-foreground">Nothing similar found.</p>
                    )}
                  </div>
                )}
                {step.kind === "finalize" && (
                  <div>
                    <p className="text-foreground">
                      Kept {step.kept}
                      {step.dropped.length > 0 && <>, dropped {step.dropped.length}</>}
                    </p>
                    {step.dropped.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-muted-foreground">
                        {step.dropped.map((d, j) => (
                          <li key={j}>
                            <span className="line-through">{d.title}</span> — {d.why}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {step.kind === "note" && (
                  <p className="whitespace-pre-wrap text-muted-foreground">{step.text}</p>
                )}
              </li>
            ))}
          </ol>
          {notes.length === 0 && trace.model && (
            <p className="mt-3 text-[11px] text-muted-foreground/70">{trace.model}</p>
          )}
        </details>
      )}
    </section>
  );
}
