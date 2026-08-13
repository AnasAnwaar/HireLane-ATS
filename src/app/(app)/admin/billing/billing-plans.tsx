"use client";

import { Check, CreditCard, Loader2, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { changePlanAction } from "@/server/billing/actions";

type Feature = { t: string; ok: boolean };
type Plan = {
  key: string;
  name: string;
  price: string;
  period: string;
  tagline: string;
  popular?: boolean;
  custom?: boolean;
  features: Feature[];
};

const PLANS: Plan[] = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    tagline: "For a solo recruiter getting started.",
    features: [
      { t: "1 user (admin only)", ok: true },
      { t: "Up to 5 job openings", ok: true },
      { t: "Applicant tracking & pipeline", ok: true },
      { t: "Channel / account integrations", ok: false },
      { t: "AI features", ok: false },
    ],
  },
  {
    key: "basic",
    name: "Basic",
    price: "$49",
    period: "/ month",
    tagline: "For a small team posting and screening.",
    features: [
      { t: "3 seats (admin + 2)", ok: true },
      { t: "Unlimited job openings", ok: true },
      { t: "Channel & account integrations", ok: true },
      { t: "AI job-post generation", ok: true },
      { t: "AI screening & assessments", ok: false },
    ],
  },
  {
    key: "premium",
    name: "Premium",
    price: "$149",
    period: "/ month",
    popular: true,
    tagline: "For teams that want the full AI stack.",
    features: [
      { t: "Up to 10 seats", ok: true },
      { t: "Everything in Basic", ok: true },
      { t: "AI screening & match reports", ok: true },
      { t: "AI assessments + grading", ok: true },
      { t: "Proctoring & interview tooling", ok: true },
    ],
  },
  {
    key: "custom",
    name: "Custom",
    price: "Let’s talk",
    period: "",
    custom: true,
    tagline: "Bespoke limits & all features — assigned by our team.",
    features: [
      { t: "Unlimited seats & openings", ok: true },
      { t: "Everything in Premium", ok: true },
      { t: "SSO, custom roles & audit exports", ok: true },
      { t: "Dedicated onboarding & support", ok: true },
      { t: "Custom integrations, SLAs & pricing", ok: true },
    ],
  },
];

export function BillingPlans({
  currentPlan,
  organization,
  usage,
  features,
}: {
  currentPlan: string;
  organization: string;
  usage: { seatsUsed: number; seatCap: number | null; openingsUsed: number; openingCap: number | null };
  features: Record<"integrations" | "ai_posts" | "ai_screening" | "ai_assessments", boolean>;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const current = PLANS.find((p) => p.key === currentPlan);

  async function switchPlan(plan: Plan) {
    if (plan.custom) {
      toast.info("Custom plans are arranged with our team — get in touch to set one up.");
      return;
    }
    setBusy(plan.key);
    const r = await changePlanAction(plan.key);
    setBusy(null);
    if (r.ok) {
      toast.success(r.message ?? "Plan updated.");
      router.refresh();
    } else toast.error(r.error);
  }

  const cap = (n: number | null) => (n == null ? "∞" : n);
  type Feat = "integrations" | "ai_posts" | "ai_screening" | "ai_assessments";
  const FEATURE_ROWS: { key: Feat; label: string }[] = [
    { key: "integrations", label: "Channel integrations" },
    { key: "ai_posts", label: "AI job-post generation" },
    { key: "ai_screening", label: "AI screening & match reports" },
    { key: "ai_assessments", label: "AI assessments & grading" },
  ];

  return (
    <div className="space-y-8">
      {/* Current plan + usage */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <CreditCard className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">Current plan · {organization}</p>
            <p className="text-lg font-semibold">
              {current?.name ?? currentPlan} plan
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {current?.price} {current?.period}
              </span>
            </p>
          </div>
          <Badge variant="success" dot>
            Active
          </Badge>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Meter label="Seats" used={usage.seatsUsed} total={usage.seatCap} />
          <Meter label="Job openings" used={usage.openingsUsed} total={usage.openingCap} />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {FEATURE_ROWS.map((f) => (
            <span
              key={f.key}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                features[f.key]
                  ? "border-success/30 bg-success-soft text-success"
                  : "border-border bg-muted/40 text-muted-foreground",
              )}
            >
              {features[f.key] ? <Check className="size-3" /> : <X className="size-3" />}
              {f.label}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Locked features and limits are enforced server-side — not just hidden. Current caps:{" "}
          {cap(usage.seatCap)} seats · {cap(usage.openingCap)} openings.
        </p>
      </Card>

      {/* Plan grid */}
      <div>
        <h2 className="text-sm font-semibold">Change plan</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Upgrade any time. Prorated, no lock-in — billing secured by Stripe.
        </p>
        <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((plan) => {
            const isCurrent = plan.key === currentPlan;
            return (
              <Card
                key={plan.key}
                className={cn(
                  "relative flex flex-col p-5",
                  plan.popular && "border-primary/40 shadow-card",
                )}
              >
                {plan.popular && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-2.5 py-0.5 text-[0.625rem] font-semibold text-primary-foreground">
                    Most popular
                  </span>
                )}
                <div className="flex-1">
                  <h3 className="text-base font-semibold">{plan.name}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">{plan.tagline}</p>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className={cn("font-bold tracking-tight", plan.custom ? "text-xl" : "text-3xl")}>
                      {plan.price}
                    </span>
                    {plan.period && <span className="text-xs text-muted-foreground">{plan.period}</span>}
                  </div>
                  <ul className="mt-4 space-y-2 text-sm">
                    {plan.features.map((f) => (
                      <li key={f.t} className="flex items-start gap-2">
                        {f.ok ? (
                          <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                        ) : (
                          <X className="mt-0.5 size-4 shrink-0 text-muted-foreground/50" />
                        )}
                        <span className={f.ok ? "" : "text-muted-foreground"}>{f.t}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <Button
                  className="mt-5 w-full"
                  variant={isCurrent ? "outline" : plan.popular ? "default" : "outline"}
                  disabled={isCurrent || busy !== null}
                  onClick={() => switchPlan(plan)}
                >
                  {busy === plan.key && <Loader2 className="animate-spin" />}
                  {isCurrent ? (
                    "Current plan"
                  ) : plan.custom ? (
                    <>
                      <Sparkles /> Contact us
                    </>
                  ) : (
                    `Switch to ${plan.name}`
                  )}
                </Button>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Seats add-on */}
      <Card className="flex flex-wrap items-center gap-4 p-5">
        <div className="min-w-0 flex-1">
          <p className="font-medium">Need more seats?</p>
          <p className="text-sm text-muted-foreground">
            Add extra seats to any paid plan for a per-seat monthly fee.
          </p>
        </div>
        <Button variant="outline" onClick={() => toast.info("Seat management arrives with Stripe billing (CP-27).")}>
          Add seats
        </Button>
      </Card>

      <p className="text-xs text-muted-foreground">
        Switching plans is live and takes effect immediately (no payment in test mode). Checkout,
        invoices and seat purchases arrive with Stripe (CP-27).
      </p>
    </div>
  );
}

function Meter({ label, used, total }: { label: string; used: number; total: number | null }) {
  const pct = total ? Math.min(100, (used / total) * 100) : Math.min(100, used > 0 ? 30 : 0);
  const over = total != null && used >= total;
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">
          {used} / {total == null ? "∞" : total}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", over ? "bg-destructive" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
