import { NextResponse, type NextRequest } from "next/server";

/**
 * Lightweight UX gate ONLY (Next.js "proxy" convention, formerly "middleware").
 *
 * This merely checks for the presence of the session cookie and redirects
 * unauthenticated visitors away from protected routes. It does NOT validate the
 * session (no DB access — runs on the edge runtime).
 *
 * All real authorization is enforced server-side in layouts/actions/helpers
 * (requireUser, requireAdminAccess, requirePermission). A present-but-invalid
 * cookie is still rejected there.
 */

// Must match SESSION_COOKIE_NAME in src/lib/auth/session.ts. Hardcoded here to
// avoid pulling server-only/Prisma modules into the edge bundle.
const SESSION_COOKIE_NAME = "ht_session";

const PROTECTED_PREFIXES = ["/dashboard", "/admin", "/change-password"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (!isProtected) return NextResponse.next();

  if (request.cookies.has(SESSION_COOKIE_NAME)) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/change-password/:path*"],
};
