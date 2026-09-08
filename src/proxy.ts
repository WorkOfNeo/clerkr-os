import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Metadata documents an MCP client fetches to discover an OAuth authorization
// server (RFC 9728 / RFC 8414), plus the default endpoints it falls back to
// when that metadata is missing (MCP spec 2025-06-18 §2.3.2). The prefixes
// also match the issuer-path-appended forms, e.g.
// `/.well-known/oauth-protected-resource/api/mcp`.
const OAUTH_METADATA_PREFIXES = [
  "/.well-known/oauth-authorization-server",
  "/.well-known/oauth-protected-resource",
  "/.well-known/openid-configuration",
];
const OAUTH_DEFAULT_ENDPOINTS = new Set(["/authorize", "/token", "/register"]);

function isOAuthDiscoveryPath(pathname: string): boolean {
  return (
    OAUTH_METADATA_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    OAUTH_DEFAULT_ENDPOINTS.has(pathname)
  );
}

// `/api/mcp` MUST be in this allowlist or unauthenticated MCP requests get
// 307'd to /signin and MCP clients surface that as "couldn't reach server"
// (wiki cmozdixrh000lqa15qapcherk). The bearer-token check inside the MCP
// route is the real security boundary for that path.
//
// `/api/attachments/[id]` is deliberately NOT here: it serves screenshot bytes
// that can contain client matter, so it stays behind the session cookie.
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // We run no OAuth authorization server — MCP auth is a static bearer token,
  // sent either in the Authorization header or in the /api/mcp/<token> URL.
  // Discovery therefore has to 404 so clients conclude "no OAuth here" and
  // stay on token auth. While these 307'd to /signin instead, Claude.ai read
  // the sign-in page as an authorization server, tried Dynamic Client
  // Registration against it, and refused to connect with "Couldn't register
  // with <name>'s sign-in service" — even though the token request itself was
  // succeeding. Checked before the allowlist so it can't be re-shadowed.
  if (isOAuthDiscoveryPath(pathname)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const isPublic =
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/mcp") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/signin" ||
    pathname === "/signup" ||
    // PWA install assets MUST be reachable without a session. iOS fetches the
    // manifest and the apple-touch-icon with no credentials, so behind the
    // cookie they 307 to /signin, Safari receives an HTML page where it wanted
    // an image, and "Add to Home Screen" falls back to a grey letter — which
    // is exactly what happened. The manifest never loading also means
    // `display: standalone` never applies, and a service worker must be
    // fetchable at its own scope to register at all.
    //
    // Safe to expose, unlike /api/attachments and /api/documents: these are
    // branding files and a push-only worker with no secrets in them.
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname.startsWith("/icons/");

  if (isPublic) return NextResponse.next();

  const session = getSessionCookie(req, { cookiePrefix: "clerkr-internal" });
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/signin";
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
