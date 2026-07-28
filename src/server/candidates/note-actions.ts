"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/validation/auth";
import type { NoteVisibility } from "@/types/database";
import { authorize } from "@/server/auth/authorize";
import { getSessionContext } from "@/server/auth/session";

const noteSchema = z.object({
  body: z.string().trim().min(1, "Write something").max(10000),
  visibility: z.enum(["private", "team", "management"]),
});

/** Add a note to a candidate (spec §UC-6). */
export async function addNoteAction(
  candidateId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };

  const auth = await authorize("profile.add_note");
  if (!auth.ok) return auth;

  const parsed = noteSchema.safeParse({
    body: formData.get("body"),
    visibility: formData.get("visibility"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("candidate_notes").insert({
    organization_id: session.organizationId,
    candidate_id: candidateId,
    author_membership_id: session.membershipId,
    body: parsed.data.body,
    visibility: parsed.data.visibility as NoteVisibility,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/candidates/${candidateId}`);
  return { ok: true, message: "Note added." };
}

export async function deleteNoteAction(
  noteId: string,
  candidateId: string,
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Your session has expired." };

  const supabase = await createClient();
  // RLS allows deleting only your own note with the edit-own permission.
  const { error } = await supabase.from("candidate_notes").delete().eq("id", noteId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/candidates/${candidateId}`);
  return { ok: true, message: "Note removed." };
}

/**
 * A short-lived signed URL to download a candidate document.
 *
 * Gated on applicants.view_profile here, then generated with the admin client
 * because Storage signed-URL creation runs as the service role. The document
 * row is re-checked through RLS first, so a caller who can't see the candidate
 * can't mint a URL.
 */
export async function getDocumentUrlAction(documentId: string): Promise<
  { ok: true; url: string; fileName: string } | { ok: false; error: string }
> {
  const auth = await authorize("applicants.view_profile");
  if (!auth.ok) return auth;

  const supabase = await createClient();
  // RLS scopes this to documents the caller may see.
  const { data: doc } = await supabase
    .from("documents")
    .select("storage_path, file_name")
    .eq("id", documentId)
    .maybeSingle();

  if (!doc) return { ok: false, error: "Document not found or not accessible." };

  const admin = createAdminClient();
  const { data: signed, error } = await admin.storage
    .from("candidate-documents")
    .createSignedUrl(doc.storage_path, 300); // 5 minutes

  if (error || !signed) return { ok: false, error: "Couldn't generate a download link." };

  return { ok: true, url: signed.signedUrl, fileName: doc.file_name };
}
