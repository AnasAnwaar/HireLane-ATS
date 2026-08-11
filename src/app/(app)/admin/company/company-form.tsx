"use client";

import { Building2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useActionState } from "react";
import { toast } from "sonner";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/validation/auth";
import type { Organization } from "@/types/database";

import { LogoUpload } from "./logo-upload";

const textareaClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";

export function CompanyForm({
  org,
  canEdit,
  action,
}: {
  org: Organization;
  canEdit: boolean;
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);

  // Live preview state.
  const [name, setName] = React.useState(org.name);
  const [tagline, setTagline] = React.useState(org.tagline ?? "");
  const [logoUrl, setLogoUrl] = React.useState(org.logo_url ?? "");
  const [color, setColor] = React.useState(org.brand_color ?? "#4f46e5");
  const [logoOk, setLogoOk] = React.useState(true);

  React.useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? "Saved.");
      router.refresh();
    }
  }, [state, router]);

  const fe = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const validColor = /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#4f46e5";

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        {state && !state.ok && !Object.keys(fe).length && (
          <Alert variant="destructive">{state.error}</Alert>
        )}

        <Section title="Identity" description="How your company is named across the portal.">
          <Field id="name" label="Company name" required error={fe.name} className="sm:col-span-2">
            <Input
              name="name"
              defaultValue={org.name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Inc."
              required
              disabled={!canEdit}
            />
          </Field>
          <Field id="tagline" label="Tagline" error={fe.tagline} className="sm:col-span-2">
            <Input
              name="tagline"
              defaultValue={org.tagline ?? ""}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="Hiring the best engineers in the region"
              disabled={!canEdit}
            />
          </Field>
          <div className="sm:col-span-2 space-y-1.5">
            <label htmlFor="description" className="text-sm font-medium">
              About
            </label>
            <textarea
              id="description"
              name="description"
              defaultValue={org.description ?? ""}
              rows={4}
              placeholder="A short description candidates will see on your careers page and job posts."
              className={textareaClass}
              disabled={!canEdit}
            />
            {fe.description && <p className="text-xs font-medium text-destructive">{fe.description}</p>}
          </div>
          <Field id="industry" label="Industry" error={fe.industry}>
            <Input name="industry" defaultValue={org.industry ?? ""} placeholder="Software" disabled={!canEdit} />
          </Field>
          <Field id="website" label="Website" error={fe.website}>
            <Input name="website" defaultValue={org.website ?? ""} placeholder="https://acme.com" disabled={!canEdit} />
          </Field>
        </Section>

        <Section title="Branding" description="Your logo and accent colour.">
          <div className="sm:col-span-2 space-y-1.5">
            <label className="text-sm font-medium">Logo</label>
            <LogoUpload
              orgId={org.id}
              value={logoUrl}
              onChange={(url) => {
                setLogoUrl(url);
                setLogoOk(true);
              }}
              disabled={!canEdit}
            />
            {fe.logo_url && <p className="text-xs font-medium text-destructive">{fe.logo_url}</p>}
          </div>
          <Field id="brand_color" label="Brand colour" error={fe.brand_color}>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Brand colour picker"
                value={validColor}
                onChange={(e) => setColor(e.target.value)}
                disabled={!canEdit}
                className="size-9 shrink-0 cursor-pointer rounded-md border border-input bg-background"
              />
              <Input
                name="brand_color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="#4f46e5"
                disabled={!canEdit}
              />
            </div>
          </Field>
          <Field id="careers_url" label="Careers page" error={fe.careers_url}>
            <Input name="careers_url" defaultValue={org.careers_url ?? ""} placeholder="https://acme.com/careers" disabled={!canEdit} />
          </Field>
        </Section>

        <Section title="Localization" description="Regional defaults that flow into new openings.">
          <Field id="timezone" label="Timezone" error={fe.timezone} required>
            <Input name="timezone" defaultValue={org.timezone} placeholder="UTC" required disabled={!canEdit} />
          </Field>
          <Field id="currency" label="Currency" error={fe.currency} required hint="3-letter ISO code">
            <Input name="currency" defaultValue={org.currency} maxLength={3} placeholder="USD" required disabled={!canEdit} />
          </Field>
          <Field id="locale" label="Locale" error={fe.locale} required>
            <Input name="locale" defaultValue={org.locale} placeholder="en" required disabled={!canEdit} />
          </Field>
        </Section>

        <Section title="Candidate email" description="The sender candidates see on portal emails.">
          <Field id="email_from_name" label="From name" error={fe.email_from_name}>
            <Input name="email_from_name" defaultValue={org.email_from_name ?? ""} placeholder="Acme Talent Team" disabled={!canEdit} />
          </Field>
          <Field id="email_reply_to" label="Reply-to address" error={fe.email_reply_to}>
            <Input name="email_reply_to" type="email" defaultValue={org.email_reply_to ?? ""} placeholder="talent@acme.com" disabled={!canEdit} />
          </Field>
        </Section>

        {canEdit && (
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Save changes
            </Button>
          </div>
        )}
      </div>

      {/* Live brand preview */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Preview
        </p>
        <Card className="overflow-hidden">
          <div className="h-16" style={{ backgroundColor: validColor }} />
          <div className="-mt-8 px-5 pb-5">
            <span className="flex size-16 items-center justify-center overflow-hidden rounded-xl border border-border bg-card shadow-card">
              {logoUrl && logoOk ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt=""
                  className="size-full object-contain p-1.5"
                  onError={() => setLogoOk(false)}
                />
              ) : (
                <Building2 className="size-7 text-muted-foreground" />
              )}
            </span>
            <p className="mt-3 truncate text-lg font-semibold">{name || "Your company"}</p>
            {tagline && <p className="mt-0.5 text-sm text-muted-foreground">{tagline}</p>}
            <div className="mt-4">
              <span
                className="inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium text-white"
                style={{ backgroundColor: validColor }}
              >
                View openings
              </span>
            </div>
          </div>
        </Card>
        <p className="mt-2 text-xs text-muted-foreground">
          This is how your brand appears on candidate-facing pages.
        </p>
      </div>
    </form>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </Card>
  );
}
