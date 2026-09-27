import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

// Public paths that never require authentication.
const PUBLIC_PATHS = ["/login", "/api/auth/login"];

// The MCP endpoint authenticates itself via an `Authorization: Bearer <token>`
// header (see lib/mcp/auth.ts), not the `gate_ai_session` cookie. It must not
// be blocked by (or rely on) the cookie-presence gate below, which is meant
// only for the browser app.
const MCP_PATH_PREFIX = "/api/mcp";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const isStaticAsset =
    pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname.startsWith("/public");
  const isMcp = pathname === MCP_PATH_PREFIX || pathname.startsWith(MCP_PATH_PREFIX + "/");

  if (isPublic || isStaticAsset || isMcp) {
    return NextResponse.next();
  }

  // Middleware runs on the Edge runtime, where we cannot safely query
  // Prisma/Postgres. We do a lightweight cookie-presence check here to
  // avoid rendering protected pages without any session cookie at all.
  // The REAL authorization check (validating the session against the
  // database and expiry) happens server-side in every page/API route via
  // getCurrentUser()/requireUser() from lib/auth/session.ts.
  const hasSessionCookie = request.cookies.has(SESSION_COOKIE_NAME);

  if (!hasSessionCookie) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};