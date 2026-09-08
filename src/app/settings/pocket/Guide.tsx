import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";

// The written guide on /settings/pocket.
//
// It is long on purpose. The thing someone most needs to understand here is
// not the click path — it is WHY it is built as a pull with a tag filter and
// not as a webhook, because that is the difference between recordings of other
// clients reaching this server and never leaving Pocket. Someone deciding
// whether to point a recorder at their working day deserves to see that
// spelled out rather than inferred.

export function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[12px] text-secondary-foreground">
      {children}
    </code>
  );
}

export function Step({
  n,
  title,
  lede,
  children,
}: {
  n: number;
  title: string;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-[12px] font-semibold text-background">
          {n}
        </span>
        <div>
          <h2 className="text-base font-semibold leading-6">{title}</h2>
          {lede && <p className="mt-0.5 text-xs text-muted-foreground">{lede}</p>}
        </div>
      </div>
      <div className="space-y-3 pl-[34px]">{children}</div>
    </section>
  );
}

/**
 * The privacy explanation. This is the part worth reading twice, so it gets
 * its own panel rather than a paragraph in a wall of setup text.
 */
export function WhatLeavesPocket() {
  const rows = [
    {
      icon: EyeOff,
      tone: "muted" as const,
      title: "An untagged recording",
      body: "Never requested, never sent, never stored here. We ask Pocket only for recordings carrying your chosen tag, so a client call for someone else is not filtered out at this end — it is never fetched in the first place.",
    },
    {
      icon: Eye,
      tone: "muted" as const,
      title: "Browsing your recordings",
      body: "The browse page lists titles and dates only. Pocket returns no transcript and no summary when listing, so looking through what you have recorded moves no content of any conversation.",
    },
    {
      icon: Eye,
      tone: "strong" as const,
      title: "A tagged recording, or one you import by hand",
      body: "Only here is the full transcript and summary fetched, and only for that one recording. That is the single call in the whole integration that moves the content of a conversation.",
    },
  ];

  return (
    <div className="space-y-2.5 rounded-lg border border-border p-4">
      {rows.map((r) => (
        <div key={r.title} className="flex gap-3">
          <r.icon
            className={`mt-0.5 h-4 w-4 shrink-0 ${
              r.tone === "strong" ? "text-foreground" : "text-muted-foreground"
            }`}
          />
          <div>
            <p className="text-sm font-medium">{r.title}</p>
            <p className="text-xs leading-5 text-muted-foreground">{r.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Pipeline() {
  const stages = [
    {
      title: "You tag the recording in Pocket",
      body: "Anything without that tag is invisible to this integration. Forgot to tag one? The browse page lets you import it by hand — see step 5.",
    },
    {
      title: "Clerkr OS checks every ten minutes",
      body: "It asks Pocket for recordings carrying your tag since it last looked, and gets back titles and dates only. Anything already imported is skipped.",
    },
    {
      title: "New ones are fetched and filed",
      body: "The transcript and summary are pulled for those recordings alone, and each becomes a meeting holding Pocket's summary, the action items Pocket spotted, and the full transcript.",
    },
    {
      title: "The reviewer agent reads it",
      body: "It searches what already exists, then proposes decisions, feature ideas, action items and open questions — each with one line saying why, and a warning when something looks like a duplicate.",
    },
    {
      title: "You accept what is real",
      body: "Cards are editable before you accept them. Accepting an action item can send it straight to the ticket queue. Nothing reaches the feature library or the tickets until you do.",
    },
  ];

  return (
    <ol className="space-y-3">
      {stages.map((s, i) => (
        <li key={s.title} className="flex gap-3">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-secondary-foreground">
            {i + 1}
          </span>
          <div>
            <p className="text-sm font-medium">{s.title}</p>
            <p className="text-xs leading-5 text-muted-foreground">{s.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

const TROUBLE: { symptom: React.ReactNode; key: string; cause: React.ReactNode }[] = [
  {
    key: "no-tags",
    symptom: <>&ldquo;Nothing is syncing&rdquo; on the connection</>,
    cause: (
      <>
        No tags are selected, which is the safe default rather than a fault.
        Press <strong className="font-medium text-foreground">Choose tags</strong> and tick at
        least one. Until then nothing is fetched at all.
      </>
    ),
  },
  {
    key: "bad-key",
    symptom: <>&ldquo;Pocket rejected the API key&rdquo;</>,
    cause: (
      <>
        The key is wrong, revoked, or from a different account. Make a new one in Pocket under
        Settings &rarr; API keys and save it here against the same email &mdash; that replaces
        the old one.
      </>
    ),
  },
  {
    key: "none-imported",
    symptom: <>It checked, saw recordings, but imported none</>,
    cause: (
      <>
        They were already imported &mdash; a recording is matched on its Pocket id, so it can
        only ever become one meeting. The count reads
        &ldquo;checked N, imported 0&rdquo; when everything tagged is already here.
      </>
    ),
  },
  {
    key: "tagged-missing",
    symptom: <>A recording is tagged but never arrived</>,
    cause: (
      <>
        Check the tag ticked here is the same one you put on the recording, and that Pocket has
        finished processing &mdash; a recording still transcribing has no text to import yet.
        The sync looks back seven days on its first run and from its last check after that.
      </>
    ),
  },
  {
    key: "forgot-tag",
    symptom: <>I forgot to tag one</>,
    cause: (
      <>
        Use{" "}
        <Link href="/settings/pocket/browse" className="text-primary underline underline-offset-4">
          Browse recordings
        </Link>
        . It lists everything by title with no transcript fetched, and imports only the one you
        pick.
      </>
    ),
  },
  {
    key: "no-cards",
    symptom: <>The meeting is there but has no cards</>,
    cause: (
      <>
        Reading happens just after the import &mdash; give it a moment and reload. If it stays
        empty, either <Code>OPENAI_API_KEY</Code> isn&rsquo;t set, or the reviewer judged
        everything already covered. The meeting page shows its reasoning and has
        &ldquo;Propose again&rdquo;.
      </>
    ),
  },
];

export function Troubleshooting() {
  return (
    <div className="divide-y divide-hairline overflow-hidden rounded-lg border border-border">
      {TROUBLE.map((t) => (
        <div key={t.key} className="space-y-1 p-4">
          <p className="text-sm font-medium">{t.symptom}</p>
          <p className="text-xs leading-5 text-muted-foreground">{t.cause}</p>
        </div>
      ))}
    </div>
  );
}

export function GoodToKnow() {
  const items: { q: string; a: React.ReactNode }[] = [
    {
      q: "Why tags rather than something automatic?",
      a: (
        <>
          Because any rule guessing at relevance drops recordings silently, and a dropped
          meeting is invisible &mdash; you would never know to look for it. A tag is a decision
          you have already made, in Pocket, where you are looking at the recording anyway.
        </>
      ),
    },
    {
      q: "Why not a webhook?",
      a: (
        <>
          A webhook pushes <em>every</em> recording here and lets us sort it out afterwards, so
          another client&rsquo;s conversation would land on this server before anything decided
          to drop it. Pulling with a tag filter means it is never requested at all.
        </>
      ),
    },
    {
      q: "I lost the API key",
      a: (
        <>
          Make a new one in Pocket and save it here against the same email. Nothing needs
          deleting first, and the tags you picked are kept.
        </>
      ),
    },
    {
      q: "Pause or remove?",
      a: (
        <>
          <strong className="font-medium text-foreground">Pause</strong> keeps the key and the
          tags and just stops checking.{" "}
          <strong className="font-medium text-foreground">Remove</strong> forgets both. Meetings
          already imported are untouched either way.
        </>
      ),
    },
    {
      q: "Several people with a Pocket each",
      a: (
        <>
          Add one connection per person, each with their own API key and their own tags, filed
          under whoever should own the meetings.
        </>
      ),
    },
    {
      q: "Who can see a recording once it lands?",
      a: (
        <>
          Everyone signed in. This is a single-tenant tool &mdash; meetings, tickets and the
          wiki are shared by the whole team. That is exactly why the tag filter matters.
        </>
      ),
    },
    {
      q: "I deleted the recording in Pocket",
      a: (
        <>
          The meeting stays. By then it may have decisions, features and tickets attached.
          Delete it from its own page &mdash; the dialog there says what will go with it.
        </>
      ),
    },
    {
      q: "How far back does it look?",
      a: (
        <>
          Seven days on the very first check, then from the last time it ran. Anything older is
          imported by hand from the browse page.
        </>
      ),
    },
  ];

  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      {items.map((i) => (
        <div key={i.q} className="space-y-1">
          <dt className="text-sm font-medium">{i.q}</dt>
          <dd className="text-xs leading-5 text-muted-foreground">{i.a}</dd>
        </div>
      ))}
    </dl>
  );
}

export function MeetingsLink() {
  return (
    <Link href="/meetings" className="text-primary underline-offset-4 hover:underline">
      Meetings
    </Link>
  );
}
