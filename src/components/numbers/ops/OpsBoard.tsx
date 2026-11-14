'use client'

import './ops-board.css'
import './tokens.css'
import { useCallback, useEffect, useState } from 'react'
import { ClerkrLogo } from './ClerkrLogo'
import { Clock } from './Clock'
import { Odometer } from './Odometer'
import { FeedPanel, IntakePanel, LivePanel, MailFlowPanel, StatStrip } from './panels'
import { POLL_MS, sentence, type OpsSnapshot } from './snapshot'

const INT = new Intl.NumberFormat('da-DK', { maximumFractionDigits: 0 })

/**
 * Copied from Clerkr-V2 apps/web/app/ops-board/OpsBoard.tsx (2026-11-14) for
 * the numbers board. Two changes, both marked NUMBERS: it polls clerkr-internal
 * (`pollUrl`, which serves the latest snapshot the Clerkr prod worker pushed)
 * instead of reading a database, and the header carries the board's tabs. The
 * pill reports the age of the DATA (snap.now), not of the last poll: a poll can
 * succeed while the worker has stopped pushing, and the board must say so.
 *
 * /ops-board — the office TV board. Words first (one sentence), then one stat
 * strip, then the panels; the layout is named grid areas in ops-board.css.
 *
 * "Live" means polled, honestly: a GET of /ops-board/data every POLL_MS while
 * the tab is visible, paused while it is hidden, one immediate read on return.
 * The pill says exactly what is true, and a hairline under it fills toward the
 * next read. First paint is the server's snapshot, so nothing ever counts up
 * from 0 and nothing animates until a poll actually changes something.
 */
/** NUMBERS: after this long without a newer snapshot the pill turns amber. */
const STALE_MS = 3 * 60_000

export function OpsBoard({
  initial,
  pollUrl,
  nav,
}: {
  initial: OpsSnapshot
  pollUrl: string
  nav?: React.ReactNode
}) {
  const [snap, setSnap] = useState(initial)
  const [failed, setFailed] = useState(false)
  const [hidden, setHidden] = useState(false)
  // Both clocks start on the server's time so first paint and hydration agree
  // ("opdateret 0 s siden"); they move to the browser's clock once mounted.
  const [checked, setChecked] = useState(() => Date.parse(initial.now))
  const [now, setNow] = useState(() => Date.parse(initial.now))
  const [round, setRound] = useState(0)

  const read = useCallback(async () => {
    try {
      const res = await fetch(pollUrl, {
        cache: 'no-store',
        headers: { accept: 'application/json' },
      })
      // Anything but a 200 JSON — a 401 after a session expired, a 500 the
      // route already captured, an HTML page — is "can't reach", never data.
      if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) {
        throw new Error(`ops-board poll: ${res.status}`)
      }
      setSnap((await res.json()) as OpsSnapshot)
      setFailed(false)
    } catch {
      // A status, not an error to file: the route captures its own failures
      // (data/route.ts), and a TV that lost its network is not an app fault.
      // The pill says it, and the next round retries.
      setFailed(true)
    }
    setChecked(Date.now())
    setRound((n) => n + 1)
  }, [pollUrl])

  // A chained timeout keyed on `round`, not setInterval: the next read is
  // POLL_MS after the last one LANDED, so a slow read never stacks.
  useEffect(() => {
    if (hidden) return
    const t = setTimeout(() => void read(), POLL_MS)
    return () => clearTimeout(t)
  }, [hidden, round, read])

  useEffect(() => {
    const onVisibility = () => {
      setHidden(document.hidden)
      if (!document.hidden) void read()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [read])

  useEffect(() => {
    setChecked(Date.now())
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // NUMBERS: the age of the data itself, not of the last poll.
  void checked
  const ageMs = Math.max(0, now - Date.parse(snap.now))
  const since = Math.round(ageMs / 1000)
  const sinceLabel = since < 60 ? `${since} s` : `${Math.round(since / 60)} min`
  const stale = ageMs > STALE_MS

  return (
    <div className="ob-root" data-night={snap.night || undefined}>
      <main className="ob">
        <header className="ob-head">
          <div className="ob-brandrow">
            <div className="ob-brand">
              <ClerkrLogo title="Clerkr" />
              Clerkr
            </div>
            {nav}
          </div>
          <span
            className="ob-pill"
            role="status"
            data-warn={failed || stale || undefined}
            data-off={(!failed && hidden) || undefined}
          >
            <span className="ob-pill-dot" aria-hidden />
            <span>{failed ? 'Kan ikke hente tallene' : stale ? 'Ingen nye tal fra prod' : hidden ? 'Sat på pause' : 'Live'}</span>
            <span className="ob-pill-sub">
              {failed
                ? 'prøver igen'
                : hidden
                  ? 'fanen er skjult'
                  : `tal fra ${sinceLabel} siden`}
            </span>
            {/* key={round} remounts the hairline, so its fill restarts exactly when a read lands. */}
            {!failed && !hidden && !stale && (
              <i
                key={round}
                className="ob-pill-next"
                aria-hidden
                style={{ animationDuration: `${POLL_MS}ms` }}
              />
            )}
          </span>
          <Clock initial={initial.now} />
        </header>

        <p className="ob-sentence">
          {sentence(snap).map((part, i) =>
            'value' in part ? (
              <b key={i}>
                <Odometer value={INT.format(part.value)} />
              </b>
            ) : (
              <span key={i}>{part.text}</span>
            )
          )}
        </p>

        <StatStrip snap={snap} />

        <section className="ob-grid">
          <IntakePanel snap={snap} />
          <MailFlowPanel snap={snap} />
          <LivePanel snap={snap} />
          <FeedPanel snap={snap} />
        </section>
      </main>
    </div>
  )
}
