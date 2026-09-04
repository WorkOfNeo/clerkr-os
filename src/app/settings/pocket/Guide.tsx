import Link from "next/link";

// The written guide on /settings/pocket.
//
// It is long on purpose. Setting this up means moving a secret between two
// dashboards, in an order that matters, and picking the right events out of a
// list of thirteen — every one of which is a place to get stuck with no error
// message, because a webhook that was never created looks exactly like one
// that works and has nothing to say yet. The troubleshooting table at the
// bottom is the important half: it maps what you can actually see on this page
// onto what to do about it.

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

type Verdict = "required" | "optional" | "skip";

const VERDICT_STYLE: Record<Verdict, string> = {
  required: "bg-foreground text-background",
  optional: "bg-secondary text-secondary-foreground",
  skip: "bg-destructive/10 text-destructive",
};

const VERDICT_LABEL: Record<Verdict, string> = {
  required: "Subscribe",
  optional: "Optional",
  skip: "Leave off",
};

const EVENTS: { name: string; verdict: Verdict; note: string }[] = [
  {
    name: "summary.completed",
    verdict: "required",
    note: "Fires once the transcript, summary and action items all exist. This is the one that files a meeting — with only this ticked, everything works.",
  },
  {
    name: "transcript.edited",
    verdict: "optional",
    note: "You corrected the transcript in Pocket. Updates the meeting body here to match.",
  },
  {
    name: "speakers.labeled",
    verdict: "optional",
    note: "You put real names to the speakers. Updates the body and the attendee list.",
  },
  {
    name: "summary.regenerated",
    verdict: "optional",
    note: "You asked Pocket for a fresh summary. Re-files and re-reads the meeting.",
  },
  {
    name: "summary.updated · action_items.regenerated · translation.completed",
    verdict: "optional",
    note: "Smaller re-runs. They refresh the meeting text but deliberately do not re-run the AI — use “Propose again” on the meeting when you want that.",
  },
  {
    name: "transcription.completed",
    verdict: "skip",
    note: "Arrives before the summary exists, so it would file a half-empty meeting that the next delivery has to repair.",
  },
  {
    name: "recording.created · recording.merged",
    verdict: "skip",
    note: "Fire before there is anything worth reading.",
  },
  {
    name: "recording.deleted",
    verdict: "skip",
    note: "Ignored even if you subscribe. Deleting audio in Pocket is not a decision to erase a meeting here that may already have tickets hanging off it.",
  },
];

export function EventTable() {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <tbody>
          {EVENTS.map((e) => (
            <tr key={e.name} className="border-b border-hairline last:border-b-0 align-top">
              <td className="w-[38%] px-3 py-2.5">
                <span className="font-mono text-[11.5px] leading-5">{e.name}</span>
              </td>
              <td className="w-[92px] px-2 py-2.5">
                <span
                  className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wide ${VERDICT_STYLE[e.verdict]}`}
                >
                  {VERDICT_LABEL[e.verdict]}
                </span>
              </td>
              <td className="px-3 py-2.5 text-xs leading-5 text-muted-foreground">
                {e.note}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TROUBLE: { symptom: string; cause: React.ReactNode }[] = [
  {
    symptom: "The connection below still says “Nothing received yet”",
    cause: (
      <>
        Pocket never reached us. Check the destination URL in Pocket matches
        step 1 exactly (no trailing slash, <Code>https</Code> not{" "}
        <Code>http</Code>), that the webhook is enabled, and that{" "}
        <Code>summary.completed</Code> is ticked. Pocket&rsquo;s own webhook
        screen shows its delivery attempts &mdash; if it shows none, the problem
        is on that side.
      </>
    ),
  },
  {
    symptom: "“Last delivery failed: Signature check failed (mismatch)”",
    cause: (
      <>
        Pocket reached us but the secret doesn&rsquo;t match. Rotate the signing
        secret in Pocket, then paste the new one into step 3 using the same
        account email &mdash; that replaces it in place.
      </>
    ),
  },
  {
    symptom: "“Signature check failed (stale)”",
    cause: (
      <>
        The delivery was more than five minutes old, which is how a replayed
        request is turned away. A one-off after a retry storm is harmless. If it
        happens every time, this server&rsquo;s clock is wrong.
      </>
    ),
  },
  {
    symptom: "A delivery landed, but no meeting appeared",
    cause: (
      <>
        The recording carried no transcript and no summary yet &mdash; usually a
        very short clip, or an event other than{" "}
        <Code>summary.completed</Code>. The connection counts a delivery but
        files nothing, on purpose. Record thirty seconds of speech and try
        again.
      </>
    ),
  },
  {
    symptom: "The meeting is there, but there are no cards on it",
    cause: (
      <>
        Reading happens a few seconds after the recording lands &mdash; give it a
        moment and reload. If it stays empty, either{" "}
        <Code>OPENAI_API_KEY</Code> isn&rsquo;t set, or the reviewer judged
        everything already covered. Open the meeting: its reasoning is shown
        above the cards, and &ldquo;Propose again&rdquo; re-reads it.
      </>
    ),
  },
  {
    symptom: "The same recording arrived twice",
    cause: (
      <>
        It can&rsquo;t become two meetings &mdash; recordings are matched on
        their Pocket id, so a repeat delivery updates the one that exists.
        Seeing the delivery count climb after an edit in Pocket is the system
        working.
      </>
    ),
  },
  {
    symptom: "Everything worked, then stopped after a redeploy",
    cause: (
      <>
        Check the connection isn&rsquo;t paused, and that the URL in Pocket still
        points at this app. Connections and their secrets live in the database
        and survive deploys.
      </>
    ),
  },
];

export function Troubleshooting() {
  return (
    <div className="divide-y divide-hairline overflow-hidden rounded-lg border border-border">
      {TROUBLE.map((t) => (
        <div key={t.symptom} className="space-y-1 p-4">
          <p className="text-sm font-medium">{t.symptom}</p>
          <p className="text-xs leading-5 text-muted-foreground">{t.cause}</p>
        </div>
      ))}
    </div>
  );
}

export function Pipeline() {
  const stages = [
    {
      title: "Pocket finishes processing",
      body: "You stop the recording. Pocket transcribes it, writes a summary and pulls out action items, then posts all three here. Nothing happens until it is done — a recording still uploading has not been sent.",
    },
    {
      title: "A meeting is created",
      body: "It holds Pocket's summary, the action items Pocket spotted, and the full transcript with speakers. It appears under Meetings straight away, before any AI has read it.",
    },
    {
      title: "The reviewer agent reads it",
      body: "It searches what already exists, then proposes decisions, feature ideas, action items and open questions — each with one line saying why it kept it, and a warning when something looks like a duplicate of a feature or ticket you already have.",
    },
    {
      title: "You accept what is real",
      body: "Cards are editable before you accept them. Accepting an action item can send it straight to the ticket queue. Nothing reaches the feature library or the tickets until you do — a recording can never file work on its own.",
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

export function GoodToKnow() {
  const items: { q: string; a: React.ReactNode }[] = [
    {
      q: "I lost the signing secret",
      a: (
        <>
          Pocket shows it once and cannot show it again. Rotate it on the webhook
          in Pocket to get a new one, then paste that into step 3 with the same
          account email. Nothing here needs deleting first.
        </>
      ),
    },
    {
      q: "Pause or remove?",
      a: (
        <>
          <strong className="font-medium text-foreground">Pause</strong> keeps the
          secret and quietly drops deliveries &mdash; right for a holiday, or a
          run of recordings you don&rsquo;t want filed.{" "}
          <strong className="font-medium text-foreground">Remove</strong> forgets
          the secret, so coming back means rotating in Pocket. Meetings already
          filed are untouched either way.
        </>
      ),
    },
    {
      q: "Several people with a Pocket each",
      a: (
        <>
          Add one connection per person. Each has its own secret and decides who
          the meetings are filed under. Everyone paste the same URL from step 1
          &mdash; deliveries are told apart by their signature.
        </>
      ),
    },
    {
      q: "Who can see a recording once it lands?",
      a: (
        <>
          Everyone signed in. This is a single-tenant tool: meetings, tickets and
          the wiki are shared by the whole team. Keep anything you would not
          share with colleagues off the device.
        </>
      ),
    },
    {
      q: "I deleted the recording in Pocket",
      a: (
        <>
          The meeting stays. By then it may have decisions, features and tickets
          attached, and deleting audio is not a decision to erase those. Delete
          the meeting from its own page &mdash; the dialog there says exactly
          what will go with it.
        </>
      ),
    },
    {
      q: "Can I test without recording anything?",
      a: (
        <>
          Yes. Use Pocket&rsquo;s &ldquo;send test payload&rdquo; button, or from
          a checkout run{" "}
          <Code>npm run probe:pocket -- --secret &lt;secret&gt;</Code>, which
          sends a correctly-signed sample and explains what came back.
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
