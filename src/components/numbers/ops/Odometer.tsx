'use client'

import { useEffect, useState } from 'react'
import { useEntered } from '../loop'

/**
 * A number that rolls. Each digit is a 0–9 column translated to its place, so
 * a poll that moves 146 → 149 rolls the last digit instead of swapping text.
 * Columns are keyed from the RIGHT: 99 → 100 keeps the ones and tens rolling
 * and grows a new column on the left, rather than rebuilding the string.
 * Non-digits (",", ".", "s", "%", "$") just sit there.
 *
 * A screen reader hears the plain value once, not thirty digit columns. The
 * transition is CSS (ops-board.css .ob-odo-col) on the board's spring, and
 * reduced motion turns it off — the digits simply change.
 *
 * Ported from NEO Ledger's /live board (wiki: "Live dashboard recipe").
 *
 * NUMBERS: rolls IN when the loop brings its tab in — first render shows every
 * digit as 0, then the real value one frame later, so each tab animates its
 * numbers in like a poll does. NOT on the page's first load (`useEntered`,
 * ../loop.ts): there it paints the real value straight away, because rolling
 * every digit on the board while a TV is still hydrating is what made it lag.
 */
export function Odometer({ value }: { value: string | number }) {
  const real = String(value)
  const entered = useEntered()
  const [text, setText] = useState(() => (entered ? real.replace(/\d/g, '0') : real))
  useEffect(() => {
    if (text === real) return
    const raf = requestAnimationFrame(() => setText(real))
    return () => cancelAnimationFrame(raf)
    // `text` is left out on purpose: this reacts to a new value, not to its own roll.
  }, [real]) // eslint-disable-line react-hooks/exhaustive-deps
  const chars = [...text]
  return (
    <span className="ob-odo">
      <span className="ob-odo-sr">{real}</span>
      <span className="ob-odo-ov" aria-hidden>
        {chars.map((c, i) => {
          const key = chars.length - i
          if (!/\d/.test(c)) {
            return (
              <span key={`c${key}`} className="ob-odo-ch">
                {c}
              </span>
            )
          }
          return (
            <span key={`d${key}`} className="ob-odo-d">
              <span
                className="ob-odo-col"
                style={{ transform: `translateY(${-Number(c) * 1.2}em)` }}
              >
                {DIGITS}
              </span>
            </span>
          )
        })}
      </span>
    </span>
  )
}

const DIGITS = '0123456789'.split('').map((d) => <span key={d}>{d}</span>)
