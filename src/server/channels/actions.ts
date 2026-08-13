"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/validation/auth";
import { authorize } from "@/server/auth/authorize";
import { getSessionContext } from "@/server/auth/session";
import { requireFeature } from "@/server/billing/entitlements";

/**
 * Channel connections (spec §UC-1).
 *
 * Every external board is connected in ASSISTED mode for now — direct API
 * posting needs partner approval, so "connecting" records the channel as
 * available and publishing (CP-12) works by generating the post for the user to
 * copy across. When an OAuth flow is approved per platform, this action gains an
 * `oauth` branch; nothing else changes.
 */

async function guard(
  permission: "integrations.connect" | "integrations.disconnect",
): Promise<{ ok: true; organizationId: string; membershipId: string } | { ok: false; error: string }> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };
  const auth = await authorize(permission);
  if (!auth.ok) return auth;
  return { ok: true, organizationId: session.organizationId, membershipId: session.membershipId };
}

export async function connectChannelAction(
  channelKey: string,
  displayName?: string,
): Promise<ActionResult> {
  const g = await guard("integrations.connect");
  if (!g.ok) return g;
  const feat = await requireFeature(g.organizationId, "integrations");
  if (!feat.ok) return feat;

  const supabase = await createClient();

  // The channel must exist in the catalogue.
  const { data: channel } = await supabase
    .from("channels")
    .select("key")
    .eq("key", channelKey)
    .maybeSingle();
  if (!channel) return { ok: false, error: "Unknown channel." };

  // Upsert: a fresh connection, or reactivating a previously disconnected one.
  const { error } = await supabase.from("channel_connections").upsert(
    {
      organization_id: g.organizationId,
      channel_key: channelKey,
      mode: "assisted",
      status: "connected",
      display_name: displayName?.trim() || null,
      connected_by: g.membershipId,
      connected_at: new Date().toISOString(),
      disconnected_at: null,
    },
    { onConflict: "organization_id,channel_key" },
  );

  if (error) return { ok: false, error: error.message };

  await supabase.from("audit_log").insert({
    organization_id: g.organizationId,
    actor_membership_id: g.membershipId,
    action: "channel.connected",
    entity_type: "channel",
    entity_id: channelKey,
    summary: `Connected ${channelKey}`,
  });

  revalidatePath("/admin/integrations");
  return { ok: true, message: "Channel connected." };
}

export async function disconnectChannelAction(channelKey: string): Promise<ActionResult> {
  const g = await guard("integrations.disconnect");
  if (!g.ok) return g;

  const supabase = await createClient();
  const { error } = await supabase
    .from("channel_connections")
    .update({ status: "disconnected", disconnected_at: new Date().toISOString() })
    .eq("organization_id", g.organizationId)
    .eq("channel_key", channelKey);

  if (error) return { ok: false, error: error.message };

  await supabase.from("audit_log").insert({
    organization_id: g.organizationId,
    actor_membership_id: g.membershipId,
    action: "channel.disconnected",
    entity_type: "channel",
    entity_id: channelKey,
    summary: `Disconnected ${channelKey}`,
  });

  revalidatePath("/admin/integrations");
  return { ok: true, message: "Channel disconnected." };
}
