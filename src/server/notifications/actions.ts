"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/server/auth/session";
import type { Notification } from "@/types/database";

export type NotificationView = {
  id: string;
  type: string;
  body: string | null;
  actorName: string;
  candidateId: string | null;
  candidateName: string | null;
  read: boolean;
  createdAt: string;
};

/** The caller's recent notifications + unread count (RLS scopes to them). */
export async function getMyNotificationsAction(): Promise<{
  items: NotificationView[];
  unread: number;
}> {
  const session = await getSessionContext();
  if (!session) return { items: [], unread: 0 };

  const db = await createClient();
  const { data: rows } = await db
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);
  const notes = (rows ?? []) as Notification[];
  if (notes.length === 0) return { items: [], unread: 0 };

  const actorIds = [...new Set(notes.map((n) => n.actor_membership_id).filter(Boolean))] as string[];
  const candidateIds = [...new Set(notes.map((n) => n.candidate_id).filter(Boolean))] as string[];
  const [{ data: actors }, { data: candidates }] = await Promise.all([
    actorIds.length
      ? db.from("memberships").select("id, profiles(full_name)").in("id", actorIds)
      : Promise.resolve({ data: [] as { id: string; profiles: { full_name?: string } | null }[] }),
    candidateIds.length
      ? db.from("candidates").select("id, full_name").in("id", candidateIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ]);
  const actorName = new Map(
    (actors ?? []).map((a) => [a.id, (a.profiles as { full_name?: string } | null)?.full_name || "Someone"]),
  );
  const candidateName = new Map((candidates ?? []).map((c) => [c.id, c.full_name]));

  return {
    items: notes.map((n) => ({
      id: n.id,
      type: n.type,
      body: n.body,
      actorName: n.actor_membership_id ? (actorName.get(n.actor_membership_id) ?? "Someone") : "Someone",
      candidateId: n.candidate_id,
      candidateName: n.candidate_id ? (candidateName.get(n.candidate_id) ?? "a candidate") : null,
      read: Boolean(n.read_at),
      createdAt: n.created_at,
    })),
    unread: notes.filter((n) => !n.read_at).length,
  };
}

/** Mark one notification read. */
export async function markNotificationReadAction(id: string): Promise<{ ok: boolean }> {
  const db = await createClient();
  const { error } = await db.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  return { ok: !error };
}

/** Mark all the caller's notifications read. */
export async function markAllNotificationsReadAction(): Promise<{ ok: boolean }> {
  const db = await createClient();
  const { error } = await db
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  return { ok: !error };
}
