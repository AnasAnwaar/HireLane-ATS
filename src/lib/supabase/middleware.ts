import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { clientEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/** Routes reachable without a session. Everything else requires auth. */
const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  // Reached with a session, but before it is fully authenticated / activated,
  // so they must not be treated as protected app routes.
  "/set-password",
  "/mfa",
  "/auth",
  "/invite",
  "/apply",
  "/candidate",
  // Self-authenticating endpoints — they verify their own caller (Stripe
  // webhook signature, cron Bearer secret) and must NOT be bounced to /login,
  // which would 307 the request and swallow the event.
  "/api/stripe",
  "/api/cron",
];

function isPublic(pathname: string) {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

/**
 * Refreshes the Supabase session on every request and redirects unauthenticated
 * users away from protected routes.
 *
 * Note this is a convenience gate, not the security boundary — real enforcement
 * lives in RLS and the server-side permission checks (CP-4).
 */
export async function updateSession(request: NextRequest) {
  // Optional dedicated host for the super-admin portal (CP-28). When PLATFORM_HOST
  // is configured (e.g. admin.yourdomain.com once a custom domain exists), that
  // host serves ONLY the portal, and /platform is hidden everywhere else. Dormant
  // — a no-op — until the env var is set, so the vercel.app domain is unaffected.
  const platformHost = process.env.PLATFORM_HOST?.toLowerCase();
  if (platformHost) {
    const host = (request.headers.get("host") ?? "").toLowerCase();
    const onPlatformHost = host === platformHost;
    const p = request.nextUrl.pathname;
    // Auth flows must stay reachable on the platform host so an admin can sign
    // in; everything else (including "/") maps to the portal. Note isPublic("/")
    // is true, so we can't reuse it here — the landing page must NOT pass through.
    const isAuthPath = ["/login", "/signup", "/forgot-password", "/reset-password", "/set-password", "/mfa", "/auth"].some(
      (a) => p === a || p.startsWith(`${a}/`),
    );
    if (onPlatformHost && !p.startsWith("/platform") && !p.startsWith("/_next") && !p.startsWith("/api") && !isAuthPath) {
      // The platform host serves only the portal. Map any non-portal path to the
      // portal home (so post-login redirects like /dashboard land on /platform,
      // not a 404). The portal's own links already use /platform/* hrefs.
      const url = request.nextUrl.clone();
      url.pathname = "/platform";
      return NextResponse.rewrite(url);
    }
    if (!onPlatformHost && p.startsWith("/platform")) {
      return new NextResponse("Not found", { status: 404 });
    }
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Must be getUser(), not getSession() — getUser revalidates the JWT with
  // Supabase, whereas getSession trusts a cookie the client could have forged.
  //
  // If Supabase is unreachable (or not yet configured locally) we fall back to
  // "no user" rather than 500-ing every route. Protected routes then redirect
  // to login, which fails safe.
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    user = null;
  }

  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
