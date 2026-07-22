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

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);

    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("That link has expired or has already been used.")}`,
    );
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as "signup" | "recovery" | "invite" | "email_change" | "magiclink",
      token_hash: tokenHash,
    });
    if (!error) return NextResponse.redirect(`${origin}${next}`);

    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("That link has expired or has already been used.")}`,
    );
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent("That link was not valid.")}`,
  );
}
