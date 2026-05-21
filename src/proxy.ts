import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// `/api/mcp` MUST be in this allowlist or unauthenticated MCP requests get
// 307'd to /signin and MCP clients surface that as "couldn't reach server"
// (wiki cmozdixrh000lqa15qapcherk). The bearer-token check inside the MCP
// route is the real security boundary for that path.
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic =
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/mcp") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/signin" ||
    pathname === "/signup";

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
