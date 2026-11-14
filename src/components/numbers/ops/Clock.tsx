'use client'

import { useEffect, useState } from 'react'
import { TIME_ZONE } from './snapshot'

const TIME_FMT = new Intl.DateTimeFormat('da-DK', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: TIME_ZONE,
})

const DATE_FMT = new Intl.DateTimeFormat('da-DK', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: TIME_ZONE,
})

/**
 * The board's clock. First paint shows the server's time (the snapshot's
 * `now`), formatted with an explicit time zone so server and browser render
 * the same string; then it ticks every second on the browser's clock.
 */
export function Clock({ initial }: { initial: string }) {
  const [now, setNow] = useState(() => new Date(initial))

  useEffect(() => {
    const tick = () => setNow(new Date())
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="ob-clock">
      <div className="ob-clock-t">{TIME_FMT.format(now).replace(/\./g, ':')}</div>
      <div className="ob-clock-d">{DATE_FMT.format(now)}</div>
    </div>
  )
}
