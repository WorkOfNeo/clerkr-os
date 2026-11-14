import { NextResponse, type NextRequest } from "next/server";

import { NUMBERS_COOKIE, NUMBERS_COOKIE_PATH, findLiveLink, touchLink } from "@/lib/numbers/access";

/**
 * Opens a share link: swaps the token in the address for an httpOnly cookie
 * scoped to /numbers, then redirects there — so the token sits in the address
 * bar for exactly one request and the bookmark people keep is plain /numbers.
 *
 * SameSite=Lax, not Strict: a link opened from a chat app is a cross-site
 * navigation, and Chrome does not send a Strict cookie on the redirect that
 * follows it. The board is GET-only with no actions, so Lax gives nothing away.
 */

export const dynamic = "force-dynamic";

const YEAR_S = 365 * 24 * 60 * 60;

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await findLiveLink(token);
  const base = new URL(req.url);

  if (!link) {
    const res = NextResponse.redirect(new URL("/numbers/unavailable", base), 303);
    res.cookies.delete({ name: NUMBERS_COOKIE, path: NUMBERS_COOKIE_PATH });
    noLeak(res);
    return res;
  }

  await touchLink(link.id);
  const maxAge = link.expiresAt
    ? Math.max(60, Math.floor((link.expiresAt.getTime() - Date.now()) / 1000))
    : YEAR_S;

  const res = NextResponse.redirect(new URL("/numbers", base), 303);
  res.cookies.set({
    name: NUMBERS_COOKIE,
    value: token,
    httpOnly: true,
    secure: base.protocol === "https:",
    sameSite: "lax",
    path: NUMBERS_COOKIE_PATH,
    maxAge,
  });
  noLeak(res);
  return res;
}

function noLeak(res: NextResponse) {
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
}
