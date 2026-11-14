'use client'

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

/**
 * Motion for a list a poll re-sorts — ported from NEO Ledger's /live board
 * (wiki: "Live dashboard recipe"), where it is the reaction Niels singled out.
 *
 *  - a row that MOVES slides from where it was (FLIP, WAAPI on the board's spring)
 *  - a row that ARRIVES folds in (CSS, ops-board.css .ob-fold[data-in])
 *  - a row that LEAVES stays where it was as a ghost and folds out, instead of
 *    blinking away when the next poll lands
 *
 * The first render moves nothing: a board that animates on arrival was wrong
 * for a moment. CSS/WAAPI rather than motion/react because the fold is a
 * grid-template-rows animation and the move must survive the board's TV zoom
 * (see the FLIP pass below) — and reduced motion is honoured here and in the
 * CSS.
 *
 * Usage: render each row as an `.ob-fold` wrapper carrying `data-motion-key`,
 * whose direct child is a bare <div> with the styled row inside THAT (a padded
 * fold child closes to a stripe, not to nothing), in a container with `.ob-motion-list`
 * (position: relative), so every row's offsetTop is measured against the list.
 */
export function useListMotion<T>(
  items: readonly T[],
  keyOf: (t: T) => string,
  container: RefObject<HTMLElement | null>,
  ms = 650
): Array<{ item: T; key: string; entering: boolean; leaving: boolean }> {
  const [ghosts, setGhosts] = useState<Ghost<T>[]>([])
  const [entering, setEntering] = useState<ReadonlySet<string>>(NONE)
  const prev = useRef<{ items: readonly T[]; keys: string[] } | null>(null)
  const firstTops = useRef<Map<string, number> | null>(null)
  const lastRendered = useRef<string | null>(null)
  const alive = useRef(true)
  const keys = items.map(keyOf)
  const sig = keys.join('|')

  // Arrivals and departures are known in the render they first happen, not a
  // commit later: a new row must fold in from its very first frame, and a row
  // that left must stay put as a ghost from its first frame, or the commit in
  // between lays rows out at the wrong height and the FLIP pass reads that as
  // movement. The effect below then holds both in state until the fold is done.
  const before = prev.current
  const fresh = before ? keys.filter((k) => !before.keys.includes(k)) : []
  const freshGone = before ? departures(before.keys, before.items, keys) : []
  const allGhosts = [...ghosts.filter((g) => !freshGone.some((f) => f.key === g.key)), ...freshGone]

  const rows = items.map((item, i) => ({
    item,
    key: keys[i]!,
    entering: entering.has(keys[i]!) || fresh.includes(keys[i]!),
    leaving: false,
  }))
  // A ghost stays where it was: right after the row that preceded it, which
  // may itself be a ghost. Not at its old index — ten arrivals at the top of
  // the feed would otherwise drop the bottom rows' ghosts into the middle.
  for (const g of allGhosts) {
    if (keys.includes(g.key)) continue
    const at = g.after === null ? 0 : rows.findIndex((r) => r.key === g.after) + 1
    rows.splice(at > 0 || g.after === null ? at : rows.length, 0, {
      item: g.item,
      key: g.key,
      entering: false,
      leaving: true,
    })
  }
  // What is actually on screen, ghosts included. Rows slide only when THIS
  // changes — an arrival, a departure, a reorder — never on a re-render that
  // merely let a neighbour's fold grow (the board re-renders every second).
  const rendered = rows.map((r) => r.key).join('|')
  // FLIP's "first": where every row is right now, read in the render that is
  // about to change the list — before React touches the DOM. Positions kept
  // from an earlier render would be stale, because folds keep growing between
  // renders. Reading layout here is the one sanctioned impurity of FLIP.
  if (lastRendered.current !== null && lastRendered.current !== rendered && container.current) {
    firstTops.current = measureTops(container.current)
  }

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  // What arrived and what left, decided before paint so neither blinks.
  useLayoutEffect(() => {
    const before = prev.current
    prev.current = { items, keys }
    if (!before) return
    const now = new Set(keys)
    const gone = departures(before.keys, before.items, keys)
    const added = keys.filter((k) => !before.keys.includes(k))
    if (gone.length) {
      setGhosts((g) => [
        ...g.filter((x) => !now.has(x.key) && !gone.some((y) => y.key === x.key)),
        ...gone,
      ])
    }
    if (added.length) setEntering(new Set(added))
    if (gone.length || added.length) {
      setTimeout(() => {
        if (!alive.current) return
        if (gone.length) setGhosts((g) => g.filter((x) => !gone.some((y) => y.key === x.key)))
        if (added.length) setEntering(NONE)
      }, ms)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the list's signature, not identity
  }, [sig])

  // FLIP: every row that moved slides from its old place.
  useLayoutEffect(() => {
    const root = container.current
    if (!root || lastRendered.current === rendered) return
    lastRendered.current = rendered
    const first = firstTops.current
    firstTops.current = null
    if (!first) return
    const still =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    const easing =
      getComputedStyle(root).getPropertyValue('--ob-spring').trim() ||
      'cubic-bezier(0.22, 1, 0.36, 1)'
    root.querySelectorAll<HTMLElement>('[data-motion-key]').forEach((el) => {
      const top = el.offsetTop
      const was = first.get(el.dataset.motionKey!)
      if (still || was == null || Math.abs(was - top) < 1 || el.dataset.motionLeaving) return
      // A row moved again mid-slide starts from where it is on screen, not
      // from where it was laid out: take the live offset, then replace the slide.
      const slides = el.getAnimations().filter((a) => !(a instanceof CSSAnimation))
      const live = slides.length ? new DOMMatrixReadOnly(getComputedStyle(el).transform).m42 : 0
      slides.forEach((a) => a.cancel())
      const frames = [
        { transform: `translateY(${was - top + live}px)` },
        { transform: 'translateY(0)' },
      ]
      try {
        el.animate(frames, { duration: 588, easing })
      } catch {
        // Engines without linear() easing in WAAPI.
        el.animate(frames, { duration: 588, easing: 'ease-out' })
      }
    })
  })

  return rows
}

/**
 * Keys whose value changed since the last render — a row to glow, a heat cell
 * to ping. Empty on the first render, so nothing glows on arrival.
 */
export function useBumps(
  values: Readonly<Record<string, string | number | null>>,
  ms = 1400
): ReadonlySet<string> {
  const [bumped, setBumped] = useState<ReadonlySet<string>>(NONE)
  const prev = useRef<Readonly<Record<string, string | number | null>> | null>(null)
  const sig = JSON.stringify(values)
  useLayoutEffect(() => {
    const before = prev.current
    prev.current = values
    if (!before) return
    const changed = Object.keys(values).filter((k) => k in before && before[k] !== values[k])
    if (!changed.length) return
    setBumped(new Set(changed))
    const t = setTimeout(() => setBumped(NONE), ms)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the values' signature
  }, [sig])
  return bumped
}

const NONE: ReadonlySet<string> = new Set()

type Ghost<T> = { key: string; after: string | null; item: T }

/** The rows that left, in their old order, each anchored to the row that came
 *  before it in the old list (null = it was first). */
function departures<T>(
  beforeKeys: readonly string[],
  beforeItems: readonly T[],
  keys: readonly string[]
): Ghost<T>[] {
  const now = new Set(keys)
  const out: Ghost<T>[] = []
  beforeKeys.forEach((k, i) => {
    if (!now.has(k))
      out.push({ key: k, after: i === 0 ? null : beforeKeys[i - 1]!, item: beforeItems[i]! })
  })
  return out
}

/**
 * Every row's layout position. offsetTop, never getBoundingClientRect: it is
 * the LAYOUT position, so a row still sliding is not read as somewhere else,
 * and it is in the element's own pixels under the TV zoom — the same pixels a
 * translate is applied in. Rows sit in a `.ob-motion-list` (position:
 * relative), so offsetTop is measured against the list itself.
 */
function measureTops(root: HTMLElement): Map<string, number> {
  const tops = new Map<string, number>()
  root.querySelectorAll<HTMLElement>('[data-motion-key]').forEach((el) => {
    tops.set(el.dataset.motionKey!, el.offsetTop)
  })
  return tops
}
