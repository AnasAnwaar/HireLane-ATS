import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Landing point for every emailed link — signup confirmation, magic link,
 * password recovery, invitation.
 *
 * Supabase sends either a PKCE `code` or a `token_hash` + `type` pair depending
 * on the flow, so handle both.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  // Never redirect off-site based on a query parameter.
  const requested = searchParams.get("next") ?? "/dashboard";
  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/dashboard";

  // Signup confirmation and invites earn the branded "verified" screen; magic
  // links / password recovery go straight to their destination.
  const isConfirmation = type === "signup" || type === "invite" || next === "/setup";
  const onSuccess = isConfirmation
    ? `${origin}/verified?status=success&next=${encodeURIComponent(next)}`
    : `${origin}${next}`;
  const onFailure = `${origin}/verified?status=error`;

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return NextResponse.redirect(error ? onFailure : onSuccess);
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as "signup" | "recovery" | "invite" | "email_change" | "magiclink",
      token_hash: tokenHash,
    });
    return NextResponse.redirect(error ? onFailure : onSuccess);
  }

  return NextResponse.redirect(onFailure);
}
