import "server-only";

import { headers } from "next/headers";

import { clientEnv } from "@/lib/env";

/**
 * Absolute base URL of the current request, derived from the request's own
 * origin / forwarded host. Use it to build links that get sent elsewhere (email
 * confirmations, password resets, Stripe redirects) so they always point back to
 * the domain the user is actually on — not whatever NEXT_PUBLIC_APP_URL happens
 * to be set to. Falls back to the env var, then localhost.
 */
export async function requestBaseUrl(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin.replace(/\/$/, "");
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const proto = h.get("x-forwarded-proto") ?? "https";
    return `${proto}://${host}`;
  }
  return clientEnv.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}
