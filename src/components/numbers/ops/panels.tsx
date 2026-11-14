'use client'

import { useRef } from 'react'
import { CircleHelp, Filter, Hourglass, TriangleAlert, UserX } from 'lucide-react'
import { Odometer } from './Odometer'
import { useBumps, useListMotion } from './list-motion'
import {
  CHANNELS,
  CHANNEL_IDS,
  PENDING_CHANNELS,
  TIME_ZONE,
  channelById,
  channelsByVolume,
  heatLevel,
  pctChange,
  sumCounts,
  type ChannelId,
  type LivePerson,
  type OpsSnapshot,
} from './snapshot'

// ─── formatting (da-DK: '.' thousands, ',' decimals) ────────────────────────

const INT = new Intl.NumberFormat('da-DK', { maximumFractionDigits: 0 })
const DEC1 = new Intl.NumberFormat('da-DK', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const USD = new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'USD' })
const HHMM = new Intl.DateTimeFormat('da-DK', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: TIME_ZONE,
})
const DAY_SHORT = ['man', 'tir', 'ons', 'tor', 'fre', 'lør', 'søn']

const fmtInt = (n: number) => INT.format(n)
const fmtSec = (ms: number) => `${DEC1.format(ms / 1000)} s`
const fmtPct = (p: number) => `${p > 0 ? '+' : p < 0 ? '−' : '±'}${Math.abs(p)} %`
const chColor = (id: ChannelId) => `var(--ob-ch-${channelById(id).slot})`

// ─── the stat strip ─────────────────────────────────────────────────────────

const RING_C = 2 * Math.PI * 19

export function StatStrip({ snap }: { snap: OpsSnapshot }) {
  const total = sumCounts(snap.today)
  const delta = pctChange(total, snap.yesterdaySoFar)
  const week = snap.days.slice(-7)
  const weekMax = Math.max(1, ...week.map((d) => d.total))
  const placedFrac = snap.mail.relevant > 0 ? snap.mail.placed / snap.mail.relevant : 0
  const runsMax = Math.max(1, ...snap.agentRuns.week)
  const costDelta = pctChange(snap.spend.costUsd, snap.spend.costPrevUsd)

  return (
    <section className="ob-panel ob-strip" aria-label="Nøgletal">
      <div className="ob-cell">
        <span className="ob-lbl">Indgået i dag</span>
        <span className="ob-big">
          <Odometer value={fmtInt(total)} />
          {delta != null && (
            <span className="ob-delta" data-up={delta > 0 || undefined}>
              <Odometer value={fmtPct(delta)} />
            </span>
          )}
        </span>
        <span className="ob-cap">vs. i går til samme tid</span>
        <div className="ob-viz">
          <div
            className="ob-mbars"
            role="img"
            aria-label={`Indgået pr. dag de sidste 7 dage: ${week.map((d) => d.total).join(', ')}`}
          >
            {week.map((d, i) => (
              <i
                key={d.date}
                data-now={i === week.length - 1 || undefined}
                data-weekend={d.weekend || undefined}
                style={{ height: `${Math.max(2, (d.total / weekMax) * 28)}px` }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="ob-cell">
        <span className="ob-lbl">Mails placeret</span>
        <div className="ob-ringrow">
          <svg
            className="ob-ring"
            viewBox="0 0 46 46"
            role="img"
            aria-label={`Clerkr har placeret ${Math.round(placedFrac * 100)} % af dagens relevante mails`}
          >
            <circle className="ob-ring-track" cx="23" cy="23" r="19" />
            <circle
              className="ob-ring-arc"
              cx="23"
              cy="23"
              r="19"
              transform="rotate(-90 23 23)"
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C * (1 - Math.min(1, placedFrac))}
            />
          </svg>
          <div className="flex flex-col gap-0.5">
            <span className="ob-big">
              <Odometer value={fmtInt(snap.mail.placed)} />
            </span>
            <span className="ob-cap">
              {snap.mail.relevant > 0 ? (
                <>
                  <b>
                    <Odometer value={`${Math.round(placedFrac * 100)} %`} />
                  </b>{' '}
                  af relevante mails
                </>
              ) : (
                'ingen mails endnu i dag'
              )}
            </span>
          </div>
        </div>
      </div>

      <div className="ob-cell">
        <span className="ob-lbl">Opgaver oprettet</span>
        <span className="ob-big">
          <Odometer value={fmtInt(snap.tasks.created)} />
        </span>
        <span className="ob-cap">
          <b>
            <Odometer value={fmtInt(snap.tasks.done)} />
          </b>{' '}
          af dem er færdige
        </span>
        <div className="ob-viz">
          <div className="ob-cbar">
            <i
              style={{
                width: `${snap.tasks.created > 0 ? (snap.tasks.done / snap.tasks.created) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      </div>

      <div className="ob-cell">
        <span className="ob-lbl">Agentkørsler</span>
        <span className="ob-big">
          <Odometer value={fmtInt(snap.agentRuns.today)} />
        </span>
        <span className="ob-cap">man–søn, i dag i sort</span>
        <div className="ob-viz">
          <div
            className="ob-mbars"
            role="img"
            aria-label={`Agentkørsler i denne uge: ${snap.agentRuns.week
              .map((n, i) => `${DAY_SHORT[i]} ${n}`)
              .join(', ')}`}
          >
            {snap.agentRuns.week.map((n, i) => (
              <i
                key={DAY_SHORT[i]}
                data-now={i === snap.agentRuns.weekday || undefined}
                data-weekend={i >= 5 || undefined}
                style={{ height: `${Math.max(2, (n / runsMax) * 28)}px` }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="ob-cell">
        <span className="ob-lbl">Svartid i chat, 24 t</span>
        <span className="ob-big">
          {snap.chat.avgMs != null ? <Odometer value={fmtSec(snap.chat.avgMs)} /> : '—'}
        </span>
        <span className="ob-cap">
          første token{' '}
          <b>
            {snap.chat.firstTokenMs != null ? (
              <Odometer value={fmtSec(snap.chat.firstTokenMs)} />
            ) : (
              '—'
            )}
          </b>{' '}
          (est.)
        </span>
      </div>

      <div className="ob-cell">
        <span className="ob-lbl">Forbrug, 24 t</span>
        <span className="ob-big">
          <Odometer value={USD.format(snap.spend.costUsd)} />
          {costDelta != null && (
            <span className="ob-delta">
              <Odometer value={fmtPct(costDelta)} />
            </span>
          )}
        </span>
        <span className="ob-cap">
          <b>
            <Odometer value={`${DEC1.format(snap.spend.tokens / 1e6)} mio`} />
          </b>{' '}
          tokens
        </span>
      </div>
    </section>
  )
}

// ─── Indgange ───────────────────────────────────────────────────────────────

export function IntakePanel({ snap }: { snap: OpsSnapshot }) {
  const box = useRef<HTMLDivElement>(null)
  const rows = channelsByVolume(snap.today)
  const motion = useListMotion(rows, (c) => c.id, box)
  const glow = useBumps(Object.fromEntries(CHANNELS.map((c) => [c.id, snap.today[c.id]])))
  const total = sumCounts(snap.today)
  const max24 = Math.max(1, ...CHANNEL_IDS.flatMap((id) => snap.last24[id]))

  return (
    <div className="ob-panel ob-a-intake">
      <div className="ob-ph">
        <h2>Indgange</h2>
        <span className="ob-meta">i dag, efter kanal</span>
        <span className="ob-ph-right">
          <span>
            <Odometer value={fmtInt(total)} /> i alt
          </span>
        </span>
      </div>
      <div className="ob-pb">
        <div className="ob-ch-head ob-colhead" aria-hidden>
          <span>Kanal</span>
          <span>I dag</span>
          <span>Sidste 24 t</span>
          <span>Andel</span>
        </div>
        <div className="ob-motion-list" ref={box}>
          {motion.map(({ item: c, key, entering, leaving }) => (
            <div
              key={key}
              className="ob-fold"
              data-motion-key={key}
              data-motion-leaving={leaving || undefined}
              data-in={entering || undefined}
              data-out={leaving || undefined}
            >
              <div>
                <div className="ob-ch-row" data-glow={glow.has(c.id) || undefined}>
                  <span className="ob-ch-name">
                    <i className="ob-sw" style={{ background: chColor(c.id) }} />
                    <span>{c.name}</span>
                  </span>
                  <span className="ob-ch-n">
                    <Odometer value={fmtInt(snap.today[c.id])} />
                  </span>
                  <span
                    className="ob-ch-24"
                    role="img"
                    aria-label={`${c.name}, de sidste 24 timer: ${snap.last24[c.id].join(', ')}`}
                  >
                    {snap.last24[c.id].map((n, i) => (
                      <i
                        key={i}
                        data-zero={n === 0 || undefined}
                        style={{
                          background: chColor(c.id),
                          height: `${Math.max(2, (n / max24) * 24)}px`,
                        }}
                      />
                    ))}
                  </span>
                  <span className="ob-ch-share">
                    <Odometer
                      value={`${total > 0 ? Math.round((snap.today[c.id] / total) * 100) : 0} %`}
                    />
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
        {PENDING_CHANNELS.map((p) => (
          <div key={p.name} className="ob-ch-row" data-pending>
            <span className="ob-ch-name">
              <i className="ob-sw" />
              <span>{p.name}</span>
            </span>
            <span className="ob-ch-pending-note">{p.note}</span>
          </div>
        ))}
        <HeatStrip snap={snap} />
      </div>
    </div>
  )
}

function HeatStrip({ snap }: { snap: OpsSnapshot }) {
  const days = snap.days
  const max = Math.max(1, ...days.map((d) => d.total))
  const today = days[days.length - 1]
  const ping = useBumps({ today: today?.total ?? 0 }, 1100)
  return (
    <div className="ob-heat-wrap">
      <div className="ob-heat-top">
        <span>Indgået pr. dag, 30 dage</span>
        <span className="ob-key" aria-hidden>
          færre <i /> <i data-l="1" /> <i data-l="2" /> <i data-l="3" /> <i data-l="4" /> flere
        </span>
      </div>
      <div
        className="ob-heat"
        style={{ ['--n' as string]: days.length }}
        role="img"
        aria-label={`Indgået pr. dag de sidste ${days.length} dage. I dag ${today?.total ?? 0}, højeste dag ${max}.`}
      >
        {days.map((d, i) => (
          <i
            key={d.date}
            data-l={heatLevel(d.total, max) || undefined}
            data-weekend={d.weekend || undefined}
            data-ping={(i === days.length - 1 && ping.has('today')) || undefined}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Indgående post ─────────────────────────────────────────────────────────

export function MailFlowPanel({ snap }: { snap: OpsSnapshot }) {
  const m = snap.mail
  const steps = [
    { label: 'Relevante mails', n: m.relevant },
    { label: 'Placeret i projekt', n: m.placed },
    { label: 'Læst og forstået', n: m.understood },
    { label: 'Clerkr gik i gang', n: m.started },
    { label: 'Leveret', n: m.delivered },
  ]
  const chips = [
    {
      key: 'approval',
      n: m.awaitingApproval,
      text: 'venter på godkendelse',
      tone: 'neutral',
      Icon: Hourglass,
    },
    { key: 'unknown', n: m.unknownSender, text: 'ukendte afsendere', tone: 'warn', Icon: UserX },
    {
      key: 'uncertain',
      n: m.uncertain,
      text: 'usikre placeringer',
      tone: 'warn',
      Icon: CircleHelp,
    },
    { key: 'failed', n: m.failed, text: 'fejlet', tone: 'warn', Icon: TriangleAlert },
    { key: 'noise', n: m.noise, text: 'sorteret fra som støj', tone: 'neutral', Icon: Filter },
  ].filter((c) => c.n > 0)

  return (
    <div className="ob-panel ob-a-flow">
      <div className="ob-ph">
        <h2>Indgående post</h2>
        <span className="ob-meta">i dag, fra mail til opgave</span>
      </div>
      <div className="ob-pb">
        <div
          className="ob-flow"
          role="img"
          aria-label={`Indgående post i dag: ${steps.map((s) => `${s.label} ${s.n}`).join(', ')}`}
        >
          {steps.map((s, i) => (
            <div key={s.label} className="ob-fl">
              <span className="ob-fl-name">{s.label}</span>
              <span className="ob-fl-track">
                <i
                  style={{
                    width: `${m.relevant > 0 ? (s.n / m.relevant) * 100 : 0}%`,
                    background: `var(--ob-step-${i + 1})`,
                  }}
                />
              </span>
              <span className="ob-fl-v">
                <Odometer value={fmtInt(s.n)} />
              </span>
            </div>
          ))}
        </div>
        <div className="ob-chips">
          {chips.length === 0 ? (
            <span className="ob-empty">Intet venter på en person.</span>
          ) : (
            chips.map(({ key, n, text, tone, Icon }) => (
              <span key={key} className="ob-chip" data-tone={tone}>
                <Icon aria-hidden />
                <span>
                  <Odometer value={fmtInt(n)} /> {text}
                </span>
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Lige nu ────────────────────────────────────────────────────────────────

type OrgGroup = { org: string; people: LivePerson[] }

/** One row per office, busiest-most-recently first. */
function groupByOrg(people: readonly LivePerson[]): OrgGroup[] {
  const groups = new Map<string, LivePerson[]>()
  for (const p of people) {
    const list = groups.get(p.org)
    if (list) list.push(p)
    else groups.set(p.org, [p])
  }
  return [...groups].map(([org, list]) => ({ org, people: list }))
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

export function LivePanel({ snap }: { snap: OpsSnapshot }) {
  const box = useRef<HTMLDivElement>(null)
  const groups = groupByOrg(snap.live)
  const motion = useListMotion(groups, (g) => g.org, box)
  const glow = useBumps(
    Object.fromEntries(groups.map((g) => [g.org, g.people.map((p) => p.id).join()]))
  )
  const liveCount = snap.live.filter((p) => p.isLive).length

  return (
    <div className="ob-panel ob-a-live">
      <div className="ob-ph">
        <h2>Lige nu</h2>
        <span className="ob-meta">
          {fmtInt(groups.length)} kontorer · {fmtInt(snap.live.length)} brugere ·{' '}
          {fmtInt(liveCount)} aktive nu
        </span>
      </div>
      <div className="ob-pb ob-motion-list" ref={box}>
        {groups.length === 0 && <p className="ob-empty">Ingen er på lige nu.</p>}
        {motion.map(({ item: g, key, entering, leaving }) => (
          <div
            key={key}
            className="ob-fold"
            data-motion-key={key}
            data-motion-leaving={leaving || undefined}
            data-in={entering || undefined}
            data-out={leaving || undefined}
          >
            <div>
              <div className="ob-org" data-glow={glow.has(g.org) || undefined}>
                <span className="ob-org-name">
                  {g.org} <span>· {g.people.length}</span>
                </span>
                <span className="ob-org-mod">{g.people[0]?.module}</span>
                <span className="ob-avs">
                  {g.people.map((p) => (
                    <span
                      key={p.id}
                      className="ob-av"
                      data-live={p.isLive || undefined}
                      role="img"
                      aria-label={`${p.name}, ${p.isLive ? 'aktiv nu' : 'for nylig'}, ${p.module}`}
                    >
                      {initials(p.name)}
                    </span>
                  ))}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Seneste ────────────────────────────────────────────────────────────────

export function FeedPanel({ snap }: { snap: OpsSnapshot }) {
  const box = useRef<HTMLDivElement>(null)
  const motion = useListMotion(snap.feed, (f) => f.id, box)

  return (
    <div className="ob-panel ob-a-feed">
      <div className="ob-ph">
        <h2>Seneste</h2>
        <span className="ob-meta">nyeste først</span>
      </div>
      <div className="ob-feed ob-motion-list" ref={box}>
        {snap.feed.length === 0 && <p className="ob-empty">Intet nyt de sidste to døgn.</p>}
        {motion.map(({ item: f, key, entering, leaving }) => {
          const ch = channelById(f.channel)
          return (
            <div
              key={key}
              className="ob-fold"
              data-motion-key={key}
              data-motion-leaving={leaving || undefined}
              data-in={entering || undefined}
              data-out={leaving || undefined}
            >
              {/* One line: the channel's square (Indgange is its legend), the title,
                  who, and when. Nothing else, so the rail reads as a list. */}
              <div>
                <div className="ob-it" data-glow={entering || undefined}>
                  <i
                    className="ob-sw"
                    role="img"
                    aria-label={ch.name}
                    style={{ background: chColor(f.channel) }}
                  />
                  <span className="ob-it-title">{f.title}</span>
                  <span className="ob-it-name">{f.name}</span>
                  <time dateTime={f.at}>{HHMM.format(new Date(f.at))}</time>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
