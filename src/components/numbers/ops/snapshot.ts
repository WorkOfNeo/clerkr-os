/**
 * /ops-board's snapshot — the one shape the server renders on first paint and
 * the poll (`/ops-board/data`) returns every POLL_MS after that.
 *
 * Everything in this file is pure and client-safe: the types, the channel
 * list, the mail-state rules and the sentence. The loader (load.ts) only
 * counts rows; every rule about what a count MEANS lives here, so the view
 * adds nothing but motion and the rules can be asserted without a database
 * (__tests__/snapshot.test.ts).
 */

/** One poll per 15 s — the same cadence as page_heartbeat, so a faster poll
 *  would not surface anything newer than the data itself. */
export const POLL_MS = 15_000

export const TIME_ZONE = 'Europe/Copenhagen'

/** The TV canvas: on a landscape screen the board is laid out at exactly this
 *  size and scaled to fit (page.tsx FIT_SCRIPT, ops-board.css). Change both. */
export const TV_W = 1920
export const TV_H = 1080

// ─── channels ───────────────────────────────────────────────────────────────

export type ChannelId = 'mail' | 'chat' | 'messages' | 'documents' | 'outlook' | 'word'

export type Channel = {
  id: ChannelId
  /** Row label in the Indgange table. */
  name: string
  /** Legend and feed label. */
  short: string
  /** The plural noun the sentence uses: "59 mails, 34 chats og 22 beskeder". */
  noun: string
  /** 1-based slot in --chart-channel-N. Fixed: a channel never changes colour by rank. */
  slot: number
}

/**
 * Every door work comes in through, in colour-slot order. Each one is one
 * table (see load.ts for the exact predicate):
 *
 *   mail       mail_intakes (the Indgående post sweep), demo mail excluded
 *   chat       chat_sessions with surface NULL or 'web' (page and panel alike —
 *              the data does not tell them apart)
 *   messages   messages written by a person (author_type = 'human')
 *   documents  documents with origin upload | sharepoint | drive
 *   outlook    chat_sessions with surface 'outlook' — the add-in pane
 *   word       chat_sessions with surface 'word' — the add-in pane
 */
export const CHANNELS: readonly Channel[] = [
  { id: 'mail', name: 'Indgående post', short: 'Post', noun: 'mails', slot: 1 },
  { id: 'chat', name: 'Chat i Clerkr', short: 'Chat', noun: 'chats', slot: 2 },
  { id: 'messages', name: 'Beskeder', short: 'Beskeder', noun: 'beskeder', slot: 3 },
  { id: 'documents', name: 'Dokumenter', short: 'Dokumenter', noun: 'dokumenter', slot: 4 },
  { id: 'outlook', name: 'Outlook-tilføjelse', short: 'Outlook', noun: 'fra Outlook', slot: 5 },
  { id: 'word', name: 'Word-tilføjelse', short: 'Word', noun: 'fra Word', slot: 6 },
]

export const CHANNEL_IDS: readonly ChannelId[] = CHANNELS.map((c) => c.id)

/** Doors that exist on the roadmap but not in code, shown greyed so nobody
 *  reads a missing row as a zero. Teams: Clerkr Tag is DEFERRED
 *  (docs/roadmap/FEATURE-MAP.md). Delete the entry the day it ships. */
export const PENDING_CHANNELS: readonly { name: string; note: string }[] = [
  { name: 'Teams', note: 'ikke bygget' },
]

export function channelById(id: ChannelId): Channel {
  return CHANNELS.find((c) => c.id === id)!
}

export type ChannelCounts = Record<ChannelId, number>

export function emptyCounts(): ChannelCounts {
  return { mail: 0, chat: 0, messages: 0, documents: 0, outlook: 0, word: 0 }
}

export function sumCounts(c: ChannelCounts): number {
  return CHANNEL_IDS.reduce((a, id) => a + c[id], 0)
}

/** Busiest first; a tie keeps the colour-slot order so rows don't flicker. */
export function channelsByVolume(today: ChannelCounts): Channel[] {
  return [...CHANNELS].sort((a, b) => today[b.id] - today[a.id] || a.slot - b.slot)
}

// ─── mail flow (mail_intakes.state) ─────────────────────────────────────────

/** Every state a mail can be in once a place has been settled. */
export const PLACED_STATES = [
  'placed',
  'filing',
  'parsing',
  'understanding',
  'proposed',
  'working',
  'delivered',
  'approved',
  'done',
] as const

/**
 * One row of today's mail, reduced to the markers the flow needs. The loader
 * groups by exactly these three columns, so `count` is how many share them.
 */
export type MailStateRow = {
  state: string
  understood: boolean
  delivered: boolean
  count: number
}

export type MailFlow = {
  /** Every mail except the ones sorted out as noise or dismissed by a person. */
  relevant: number
  /** A place is settled (PLACED_STATES). */
  placed: number
  /** Clerkr has read and understood it (`understanding` is set). */
  understood: number
  /** Clerkr started on a deliverable (working / delivered, or a deliverable exists). */
  started: number
  /** A deliverable exists (`deliverable_ref` is set). */
  delivered: number
  /** Waiting for a lawyer's Godkend on the proposal. */
  awaitingApproval: number
  unknownSender: number
  uncertain: number
  noise: number
  failed: number
}

/**
 * Today's mail as a flow. Each step is a subset of the one before it — that is
 * what lets the panel draw them as one shrinking bar — and every step is read
 * off a column the pipeline actually writes, never inferred from a state's
 * position in the list (a mail can go `filing → done` without ever being
 * understood, so `done` alone proves nothing past "placed").
 */
export function mailFlow(rows: readonly MailStateRow[]): MailFlow {
  const f: MailFlow = {
    relevant: 0,
    placed: 0,
    understood: 0,
    started: 0,
    delivered: 0,
    awaitingApproval: 0,
    unknownSender: 0,
    uncertain: 0,
    noise: 0,
    failed: 0,
  }
  const placedSet = new Set<string>(PLACED_STATES)
  for (const r of rows) {
    if (r.state === 'noise') f.noise += r.count
    if (r.state !== 'noise' && r.state !== 'dismissed') f.relevant += r.count
    if (r.state === 'unknown_sender') f.unknownSender += r.count
    if (r.state === 'uncertain') f.uncertain += r.count
    if (r.state === 'failed') f.failed += r.count
    if (r.state === 'proposed') f.awaitingApproval += r.count
    if (!placedSet.has(r.state)) continue
    f.placed += r.count
    if (r.understood) f.understood += r.count
    const started = r.state === 'working' || r.state === 'delivered' || r.delivered
    if (r.understood && started) f.started += r.count
    if (r.understood && r.delivered) f.delivered += r.count
  }
  return f
}

/**
 * The feed's title for a mail, read off its state. One line per arrival, so
 * what Clerkr did with the mail lives in the title rather than in a chip.
 */
export function mailTitle(state: string): string {
  switch (state) {
    case 'unknown_sender':
      return 'Mail fra ukendt afsender'
    case 'uncertain':
      return 'Mail med usikker placering'
    case 'failed':
      return 'Mail kunne ikke behandles'
    case 'noise':
      return 'Mail sorteret fra'
    case 'dismissed':
      return 'Mail afvist'
    case 'placed':
    case 'filing':
    case 'parsing':
      return 'Mail placeret i projekt'
    case 'understanding':
      return 'Mail læses'
    case 'proposed':
      return 'Mail venter på godkendelse'
    case 'working':
      return 'Clerkr arbejder på en mail'
    case 'delivered':
      return 'Leverance klar fra en mail'
    case 'approved':
      return 'Mail godkendt, det sidste gøres færdigt'
    case 'done':
      return 'Mail færdig'
    default:
      return 'Mail modtaget'
  }
}

// ─── the snapshot ───────────────────────────────────────────────────────────

export type LivePerson = {
  id: string
  name: string
  org: string
  module: string
  isLive: boolean
  lastSeen: string
}

/**
 * One line in Seneste: the channel's square, a title, a name and the time.
 * It names the event and who — never a mail subject, a chat title or any other
 * content: this board hangs on a screen in the office, and client content does
 * not belong on it.
 */
export type FeedItem = {
  id: string
  channel: ChannelId
  title: string
  /** The person, or their office when the row has no person. */
  name: string
  at: string
}

export type OpsSnapshot = {
  /** Server clock, ISO. The view's relative times read this on first paint. */
  now: string
  /** Night theme: 19:00–07:00 Copenhagen time. */
  night: boolean
  /** Today (Copenhagen) per channel. */
  today: ChannelCounts
  /** Rolling 24 hourly buckets per channel, oldest first, ending with the current hour. */
  last24: Record<ChannelId, number[]>
  /** Every channel from yesterday's 00:00 to this time yesterday. */
  yesterdaySoFar: number
  /** Last 30 days incl. today, oldest first. */
  days: { date: string; total: number; weekend: boolean }[]
  mail: MailFlow
  tasks: { created: number; done: number }
  /** Agent runs today, and this week Monday–Sunday (future days 0). */
  agentRuns: { today: number; week: number[]; weekday: number }
  /** Rolling 24 h, like the board has always measured them. */
  chat: { avgMs: number | null; firstTokenMs: number | null }
  spend: { costUsd: number; costPrevUsd: number; tokens: number }
  live: LivePerson[]
  feed: FeedItem[]
}

// ─── the sentence ───────────────────────────────────────────────────────────

/**
 * The words that open the board, as parts so the view can roll the numbers
 * and bold them. Rule, not prose: the three busiest channels in volume order,
 * then what Clerkr did with the mail, then who is on.
 */
export type SentencePart = { text: string } | { value: number }

export function sentence(s: Pick<OpsSnapshot, 'today' | 'mail' | 'live'>): SentencePart[] {
  const total = sumCounts(s.today)
  if (total === 0) {
    return [{ text: 'Der er ikke kommet noget ind endnu i dag.' }, ...whoIsOn(s.live)]
  }
  const top = channelsByVolume(s.today)
    .filter((c) => s.today[c.id] > 0)
    .slice(0, 3)
  const parts: SentencePart[] = [
    { text: 'I dag er ' },
    { value: total },
    { text: ' ting kommet ind: ' },
  ]
  top.forEach((c, i) => {
    if (i > 0) parts.push({ text: i === top.length - 1 ? ' og ' : ', ' })
    parts.push({ value: s.today[c.id] }, { text: ` ${c.noun}` })
  })
  parts.push({ text: '.' })
  if (s.mail.placed > 0) {
    parts.push({ text: ' Clerkr har placeret ' }, { value: s.mail.placed }, { text: ' mails' })
    if (s.mail.started > 0) {
      parts.push({ text: ' og er gået i gang med ' }, { value: s.mail.started }, { text: '.' })
    } else {
      parts.push({ text: '.' })
    }
  }
  return [...parts, ...whoIsOn(s.live)]
}

function whoIsOn(live: readonly LivePerson[]): SentencePart[] {
  const on = live.filter((p) => p.isLive)
  if (on.length === 0) return [{ text: ' Ingen er på lige nu.' }]
  const offices = new Set(on.map((p) => p.org)).size
  return [
    { text: ' ' },
    { value: on.length },
    { text: ' er på lige nu' },
    ...(offices > 1
      ? [{ text: ', fra ' }, { value: offices }, { text: ' kontorer.' }]
      : [{ text: '.' }]),
  ]
}

// ─── small rules the view shares ────────────────────────────────────────────

/** Heat level 0–4 for one day, relative to the busiest weekday in the window. */
export function heatLevel(total: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (total <= 0 || max <= 0) return 0
  const r = total / max
  return r < 0.25 ? 1 : r < 0.5 ? 2 : r < 0.75 ? 3 : 4
}

/** Signed whole-percent change, or null when there is nothing to compare to. */
export function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

/** Friendly module label from a normalized page path (UsageTracker collapses
 *  ids to `[id]` before it ever reaches usage_event.page_path). */
export function pathLabel(path: string | null): string {
  if (!path) return 'Ukendt'
  if (path.startsWith('/gennemgang')) return 'Gennemgang'
  if (path.startsWith('/chat')) return 'Chat'
  if (path.startsWith('/matters')) return 'Sagsoverblik'
  // /flows was renamed /agenter (T4.1); usage_event rows from before the
  // rename are the same module and keep aggregating under one label.
  if (path.startsWith('/agenter') || path.startsWith('/flows')) return 'Agenter'
  if (path.startsWith('/drafts')) return 'Kladder'
  if (path.startsWith('/documents')) return 'Dokumenter'
  if (path.startsWith('/clients')) return 'Klienter'
  if (path.startsWith('/leverancer')) return 'Leverancer'
  if (path.startsWith('/dashboard')) return 'Dashboard'
  if (path.startsWith('/workspace')) return 'Projekter'
  if (path.startsWith('/opgave')) return 'Opgaver'
  if (path.startsWith('/beskeder')) return 'Beskeder'
  if (path.startsWith('/kalender')) return 'Kalender'
  if (path.startsWith('/noter')) return 'Noter'
  if (path.startsWith('/outlook')) return 'Outlook'
  if (path.startsWith('/word')) return 'Word'
  return path
}
