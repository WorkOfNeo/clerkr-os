// NEO Ledger link helpers. No Prisma here, so the card panel can validate a
// pasted link on the client with the same rule the server enforces.
//
// NEO Ledger has no public API and no webhooks — deliberately, see its
// `ledger://contract`. So Clerkr OS never calls it: a card only REMEMBERS its
// share link, and an agent that holds both MCPs reads the plan with Ledger's
// `get_plan` and writes the progress here with `sync_card_from_ledger`.

/**
 * A master-plan share link, `https://<host>/share/<token>`. Anything else is
 * refused rather than stored: the link is rendered as an anchor on the card,
 * and https-only is what keeps a pasted `javascript:` URL from becoming one.
 */
export function parseLedgerShareUrl(input: string): { url: string; token: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const match = parsed.pathname.match(/^\/share\/([A-Za-z0-9_-]{8,})\/?$/);
  if (!match) return null;
  return { url: `${parsed.origin}/share/${match[1]}`, token: match[1] };
}

/**
 * The key two titles are compared on when a subtask has no Ledger id yet.
 * Case, punctuation and spacing are ignored ("TU.2 · Overblik" matches
 * "tu 2 overblik"), but nothing fuzzier than that: a wrong match ticks work
 * that isn't done, which is worse than leaving a line for a person to link.
 */
export function ledgerMatchKey(title: string): string {
  return title
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
