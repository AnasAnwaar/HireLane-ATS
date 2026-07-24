"use server";

import { createAdminClient } from "@/lib/supabase/server";
import {
  ALLOWED_CV_TYPES,
  MAX_CV_BYTES,
  applySchema,
} from "@/lib/validation/apply";
import { toFieldErrors, type ActionResult } from "@/lib/validation/auth";

/**
 * Public application submission (spec §UC-3).
 *
 * The applicant is unauthenticated, so this runs with the admin client and is
 * the ONLY sanctioned write path for them — every value is validated here and
 * the organisation is derived from the opening, never from the client. There is
 * deliberately no `anon` RLS on the applicant tables; this action is the gate.
 */
export async function submitApplicationAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const openingId = String(formData.get("openingId") || "");
  const source = String(formData.get("source") || "careers-page").slice(0, 60);

  const parsed = applySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please correct the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const admin = createAdminClient();

  // The opening must exist and be open — no applying to drafts or closed roles.
  const { data: opening } = await admin
    .from("job_openings")
    .select("id, organization_id, status")
    .eq("id", openingId)
    .maybeSingle();

  if (!opening || opening.status !== "open") {
    return {
      ok: false,
      error: "This position is no longer accepting applications.",
    };
  }

  const orgId = opening.organization_id;
  const d = parsed.data;

  // Dedup by (org, email): one identity per person. Re-applying updates the
  // existing candidate rather than creating a duplicate.
  const { data: existing } = await admin
    .from("candidates")
    .select("id")
    .eq("organization_id", orgId)
    .eq("email", d.email)
    .maybeSingle();

  let candidateId = existing?.id;

  const candidateFields = {
    full_name: d.fullName,
    phone: d.phone || null,
    location: d.location || null,
    headline: d.headline || null,
    years_experience: d.yearsExperience,
    linkedin_url: d.linkedinUrl || null,
    portfolio_url: d.portfolioUrl || null,
  };

  if (candidateId) {
    await admin.from("candidates").update(candidateFields).eq("id", candidateId);
  } else {
    const { data: created, error } = await admin
      .from("candidates")
      .insert({ organization_id: orgId, email: d.email, ...candidateFields })
      .select("id")
      .single();
    if (error || !created) {
      return { ok: false, error: "Something went wrong submitting your application." };
    }
    candidateId = created.id;
  }

  // One application per candidate per opening (spec R1). A repeat submission is
  // treated as an update, not a duplicate or an error.
  const { data: existingApp } = await admin
    .from("applications")
    .select("id")
    .eq("candidate_id", candidateId)
    .eq("job_opening_id", openingId)
    .maybeSingle();

  let applicationId = existingApp?.id;

  if (applicationId) {
    await admin
      .from("applications")
      .update({ cover_note: d.coverNote || null, source })
      .eq("id", applicationId);
  } else {
    const { data: app, error } = await admin
      .from("applications")
      .insert({
        organization_id: orgId,
        candidate_id: candidateId,
        job_opening_id: openingId,
        source,
        cover_note: d.coverNote || null,
        stage: "applied",
      })
      .select("id")
      .single();
    if (error || !app) {
      return { ok: false, error: "Something went wrong submitting your application." };
    }
    applicationId = app.id;
  }

  // Optional CV upload.
  const cv = formData.get("cv");
  if (cv instanceof File && cv.size > 0) {
    if (cv.size > MAX_CV_BYTES) {
      return { ok: false, error: "Your CV is larger than 10 MB. Please upload a smaller file." };
    }
    if (!ALLOWED_CV_TYPES.includes(cv.type)) {
      return { ok: false, error: "Please upload your CV as a PDF or Word document." };
    }

    const ext = cv.name.split(".").pop()?.toLowerCase() ?? "pdf";
    // Path is prefixed with the org id — storage RLS keys read access off it.
    const storagePath = `${orgId}/${candidateId}/cv-${Date.now()}.${ext}`;

    const { error: uploadError } = await admin.storage
      .from("candidate-documents")
      .upload(storagePath, cv, { contentType: cv.type, upsert: false });

    if (!uploadError) {
      await admin.from("documents").insert({
        organization_id: orgId,
        candidate_id: candidateId,
        application_id: applicationId,
        kind: "cv",
        storage_path: storagePath,
        file_name: cv.name.slice(0, 200),
        file_size: cv.size,
        mime_type: cv.type,
      });
    }
    // A failed CV upload doesn't fail the whole application — the candidate is
    // still recorded and can be asked for their CV later.
  }

  return {
    ok: true,
    message: "Application received. Thank you — we'll be in touch.",
  };
}
