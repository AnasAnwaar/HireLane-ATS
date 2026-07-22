"use client";

import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Loader2,
  Plus,
  Rocket,
  Trash2,
  Users,
  UsersRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  completeOnboardingAction,
  saveCompanyProfileAction,
  saveDepartmentsAction,
  sendInvitationsAction,
} from "@/server/onboarding/actions";

type Role = { id: string; name: string; key: string };

type Org = {
  name: string;
  industry: string | null;
  website: string | null;
  timezone: string;
  currency: string;
};

const STEPS = [
  { title: "Company", description: "Basic details", icon: Building2 },
  { title: "Departments", description: "How you're organised", icon: UsersRound },
  { title: "Your team", description: "Invite colleagues", icon: Users },
  { title: "Done", description: "Start hiring", icon: Rocket },
];

const TIMEZONES = [
  "UTC",
  "Asia/Karachi",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "Australia/Sydney",
];

const CURRENCIES = ["USD", "PKR", "AED", "GBP", "EUR", "INR", "SAR", "AUD"];

const SUGGESTED_DEPARTMENTS = [
  "Engineering",
  "Product",
  "Design",
  "Sales",
  "Marketing",
  "Operations",
  "People",
  "Finance",
];

export function OnboardingWizard({ org, roles }: { org: Org; roles: Role[] }) {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [departments, setDepartments] = React.useState<string[]>([]);
  const [invites, setInvites] = React.useState([{ email: "", roleId: "" }]);

  // Default invitees to a non-owner role so the first pick is never "Owner".
  const defaultRoleId = React.useMemo(
    () => roles.find((r) => r.key === "recruiter")?.id ?? roles[0]?.id ?? "",
    [roles],
  );

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, onDone?: () => void) {
    setPending(true);
    setError(null);
    const result = await fn();
    setPending(false);

    if (!result.ok) {
      setError(result.error ?? "Something went wrong.");
      return;
    }
    onDone?.();
  }

  function submitCompany(formData: FormData) {
    void run(
      () => saveCompanyProfileAction(null, formData),
      () => setStep(1),
    );
  }

  function submitDepartments() {
    const formData = new FormData();
    for (const name of departments) formData.append("department", name);
    void run(
      () => saveDepartmentsAction(null, formData),
      () => setStep(2),
    );
  }

  function submitInvites() {
    const formData = new FormData();
    for (const invite of invites) {
      if (!invite.email.trim()) continue;
      formData.append("inviteEmail", invite.email.trim());
      formData.append("inviteRole", invite.roleId || defaultRoleId);
    }
    void run(
      () => sendInvitationsAction(null, formData),
      () => setStep(3),
    );
  }

  function finish() {
    void run(completeOnboardingAction, () => router.push("/dashboard"));
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* Stepper */}
      <ol className="mb-10 flex items-center gap-2">
        {STEPS.map((s, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <li key={s.title} className="flex flex-1 items-center gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors",
                    done && "border-primary bg-primary text-primary-foreground",
                    active && "border-primary text-primary",
                    !done && !active && "border-border text-muted-foreground",
                  )}
                >
                  {done ? <Check className="size-4" /> : i + 1}
                </span>
                <span className="hidden min-w-0 sm:block">
                  <span
                    className={cn(
                      "block truncate text-sm font-medium",
                      active ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {s.title}
                  </span>
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    "h-px flex-1 transition-colors",
                    done ? "bg-primary" : "bg-border",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>

      {error && (
        <Alert variant="destructive" className="mb-6">
          {error}
        </Alert>
      )}

      {/* Step 1 — company profile */}
      {step === 0 && (
        <form action={submitCompany} className="space-y-5">
          <header>
            <h1 className="text-2xl font-semibold tracking-tight">
              Tell us about {org.name}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              This shapes date, salary and currency formatting across the product.
            </p>
          </header>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="industry" label="Industry">
              <Input name="industry" defaultValue={org.industry ?? ""} placeholder="Software" />
            </Field>
            <Field id="website" label="Website">
              <Input
                name="website"
                defaultValue={org.website ?? ""}
                placeholder="https://acme.com"
              />
            </Field>
            <Field id="timezone" label="Time zone" required>
              <select
                name="timezone"
                defaultValue={org.timezone}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="currency" label="Currency" required>
              <select
                name="currency"
                defaultValue={org.currency}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Continue <ArrowRight />
            </Button>
          </div>
        </form>
      )}

      {/* Step 2 — departments */}
      {step === 1 && (
        <div className="space-y-5">
          <header>
            <h1 className="text-2xl font-semibold tracking-tight">Departments</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Used by the <strong>Department</strong> permission scope, so a team lead can be
              limited to their own area. You can add more later.
            </p>
          </header>

          <div className="flex flex-wrap gap-2">
            {SUGGESTED_DEPARTMENTS.map((name) => {
              const selected = departments.includes(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() =>
                    setDepartments((prev) =>
                      selected ? prev.filter((d) => d !== name) : [...prev, name],
                    )
                  }
                  aria-pressed={selected}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm transition-colors",
                    selected
                      ? "border-primary bg-primary-soft font-medium text-primary"
                      : "border-border hover:border-primary/40 hover:bg-accent/50",
                  )}
                >
                  {selected && <Check className="mr-1 inline size-3" />}
                  {name}
                </button>
              );
            })}
          </div>

          {departments.filter((d) => !SUGGESTED_DEPARTMENTS.includes(d)).length > 0 && (
            <ul className="space-y-2">
              {departments
                .filter((d) => !SUGGESTED_DEPARTMENTS.includes(d))
                .map((name) => (
                  <li
                    key={name}
                    className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm"
                  >
                    <span className="flex-1">{name}</span>
                    <button
                      type="button"
                      onClick={() => setDepartments((prev) => prev.filter((d) => d !== name))}
                      className="text-muted-foreground transition-colors hover:text-destructive"
                      aria-label={`Remove ${name}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
            </ul>
          )}

          <CustomDepartmentInput
            onAdd={(name) =>
              setDepartments((prev) => (prev.includes(name) ? prev : [...prev, name]))
            }
          />

          <div className="flex justify-between gap-2 pt-2">
            <Button variant="ghost" onClick={() => setStep(0)} disabled={pending}>
              <ArrowLeft /> Back
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)} disabled={pending}>
                Skip
              </Button>
              <Button onClick={submitDepartments} disabled={pending}>
                {pending && <Loader2 className="animate-spin" />}
                Continue <ArrowRight />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3 — invite the team */}
      {step === 2 && (
        <div className="space-y-5">
          <header>
            <h1 className="text-2xl font-semibold tracking-tight">Invite your team</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Assign a starting role. Every permission behind these roles is yours to change
              in the admin portal.
            </p>
          </header>

          <ul className="space-y-2">
            {invites.map((invite, index) => (
              <li key={index} className="flex gap-2">
                <Input
                  type="email"
                  placeholder="colleague@company.com"
                  value={invite.email}
                  aria-label={`Invitee ${index + 1} email`}
                  onChange={(e) =>
                    setInvites((prev) =>
                      prev.map((row, i) =>
                        i === index ? { ...row, email: e.target.value } : row,
                      ),
                    )
                  }
                />
                <select
                  value={invite.roleId || defaultRoleId}
                  aria-label={`Invitee ${index + 1} role`}
                  onChange={(e) =>
                    setInvites((prev) =>
                      prev.map((row, i) =>
                        i === index ? { ...row, roleId: e.target.value } : row,
                      ),
                    )
                  }
                  className="h-9 w-44 shrink-0 rounded-md border border-input bg-background px-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {roles
                    .filter((r) => r.key !== "owner")
                    .map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                </select>
                {invites.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove invitee ${index + 1}`}
                    onClick={() => setInvites((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setInvites((prev) => [...prev, { email: "", roleId: "" }])}
          >
            <Plus /> Add another
          </Button>

          <div className="flex justify-between gap-2 pt-2">
            <Button variant="ghost" onClick={() => setStep(1)} disabled={pending}>
              <ArrowLeft /> Back
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(3)} disabled={pending}>
                Skip
              </Button>
              <Button onClick={submitInvites} disabled={pending}>
                {pending && <Loader2 className="animate-spin" />}
                Continue <ArrowRight />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Step 4 — done */}
      {step === 3 && (
        <div className="text-center">
          <span className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-primary-soft">
            <Rocket className="size-7 text-primary" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">
            {org.name} is ready
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Your workspace is set up. Post your first opening, or head to the admin portal to
            fine-tune who can do what.
          </p>

          <div className="mt-8 flex justify-center gap-2">
            <Button variant="outline" onClick={() => setStep(2)} disabled={pending}>
              <ArrowLeft /> Back
            </Button>
            <Button onClick={finish} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Go to dashboard <ArrowRight />
            </Button>
          </div>
        </div>
      )}

      {step < 3 && (
        <p className="mt-8 text-center text-xs text-muted-foreground">
          You can leave and finish this later — we&rsquo;ll bring you back here.
        </p>
      )}
    </div>
  );
}

function CustomDepartmentInput({ onAdd }: { onAdd: (name: string) => void }) {
  const [value, setValue] = React.useState("");

  function add() {
    const name = value.trim();
    if (!name) return;
    onAdd(name);
    setValue("");
  }

  return (
    <div className="flex gap-2">
      <Input
        placeholder="Add another department"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
      />
      <Button type="button" variant="outline" onClick={add}>
        <Plus /> Add
      </Button>
    </div>
  );
}
