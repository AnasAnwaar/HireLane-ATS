import { Briefcase, MapPin } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { Badge } from "@/components/ui/badge";
import { createAdminClient } from "@/lib/supabase/server";
import {
  EMPLOYMENT_LABELS,
  WORK_MODE_LABELS,
  experienceLabel,
} from "@/lib/openings-display";

import { ApplyForm } from "./apply-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ openingId: string }>;
}) {
  const { openingId } = await params;
  const admin = createAdminClient();
  const { data } = await admin
    .from("job_openings")
    .select("title, organizations(name)")
    .eq("id", openingId)
    .maybeSingle();
  const org = data?.organizations?.name;
  return { title: data ? `Apply · ${data.title}${org ? ` · ${org}` : ""}` : "Apply" };
}

/**
 * Public application page. Unauthenticated — the applicant never touches the DB
 * directly; the admin client reads only the safe public fields of an OPEN
 * opening, and submission goes through the validated server action.
 */
export default async function ApplyPage({
  params,
  searchParams,
}: {
  params: Promise<{ openingId: string }>;
  searchParams: Promise<{ src?: string }>;
}) {
  const { openingId } = await params;
  const { src } = await searchParams;

  const admin = createAdminClient();
  const { data: opening } = await admin
    .from("job_openings")
    .select(
      "id, title, status, description, employment_type, work_mode, location, experience_min, experience_max, organizations(name)",
    )
    .eq("id", openingId)
    .maybeSingle();

  const orgName = opening?.organizations?.name ?? "this company";
  const open = opening && opening.status === "open";

  const { data: questions } = open
    ? await admin
        .from("screening_questions")
        .select("id, question, required")
        .eq("job_opening_id", openingId)
        .order("sort_order")
    : { data: [] };

  return (
    <div className="min-h-dvh bg-background">
      <div aria-hidden className="brand-rule h-1 w-full" />
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-6">
          <BrandMark />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        {!open ? (
          <div className="rounded-xl border border-border bg-card p-10 text-center shadow-card">
            <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
              <Briefcase className="size-6 text-muted-foreground" />
            </span>
            <h1 className="text-xl font-semibold">This position isn&rsquo;t accepting applications</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              The role may have been filled or closed. Please check {orgName}&rsquo;s careers page
              for current openings.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <p className="text-sm text-muted-foreground">{orgName} is hiring</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">{opening.title}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{EMPLOYMENT_LABELS[opening.employment_type]}</Badge>
                <Badge variant="secondary">{WORK_MODE_LABELS[opening.work_mode]}</Badge>
                {opening.location && (
                  <Badge variant="outline">
                    <MapPin className="size-3" /> {opening.location}
                  </Badge>
                )}
                {experienceLabel(opening.experience_min, opening.experience_max) && (
                  <Badge variant="outline">
                    {experienceLabel(opening.experience_min, opening.experience_max)}
                  </Badge>
                )}
              </div>
              {opening.description && (
                <p className="mt-5 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
                  {opening.description}
                </p>
              )}
            </div>

            <ApplyForm
              openingId={opening.id}
              source={src ?? "careers-page"}
              questions={questions ?? []}
            />
          </>
        )}
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        Powered by Hirelane
      </footer>
    </div>
  );
}
