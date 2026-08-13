"use client";

import { Check, Copy, CreditCard, ExternalLink, Loader2, Sparkles, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ActionResult } from "@/lib/validation/auth";
import { cn } from "@/lib/utils";
import {
  changePlanAction,
  createBillingPortalSessionAction,
  createCheckoutSessionAction,
} from "@/server/billing/actions";

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
  stripeEnabled,
}: {
  currentPlan: string;
  organization: string;
  usage: { seatsUsed: number; seatCap: number | null; openingsUsed: number; openingCap: number | null };
  features: Record<"integrations" | "ai_posts" | "ai_screening" | "ai_assessments", boolean>;
  stripeEnabled: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [busy, setBusy] = React.useState<string | null>(null);
  const current = PLANS.find((p) => p.key === currentPlan);

  // Toast the outcome of a returning Stripe Checkout, then scrub the query.
  const checkout = searchParams.get("checkout");
  React.useEffect(() => {
    if (!checkout) return;
    if (checkout === "success") toast.success("Payment received — your plan is being activated.");
    else if (checkout === "cancelled") toast.info("Checkout cancelled — no changes made.");
    router.replace("/admin/billing");
  }, [checkout, router]);

  /** Follow a redirect, or toast the result of a direct action. */
  function resolve(r: ActionResult) {
    if (r.ok && r.redirectTo) {
      window.location.assign(r.redirectTo);
      return;
    }
    if (r.ok) {
      toast.success(r.message ?? "Done.");
      router.refresh();
    } else toast.error(r.error);
  }

  async function switchPlan(plan: Plan) {
    if (plan.custom) {
      toast.info("Custom plans are arranged with our team — get in touch to set one up.");
      return;
    }
    setBusy(plan.key);
    let r: ActionResult;
    if (!stripeEnabled) {
      r = await changePlanAction(plan.key); // no payment configured — direct switch
    } else if (plan.key === "free") {
      r = await createBillingPortalSessionAction(); // cancel/downgrade in the portal
    } else {
      r = await createCheckoutSessionAction(plan.key); // hosted Stripe Checkout
    }
    setBusy(null);
    resolve(r);
  }

  async function openPortal() {
    setBusy("portal");
    const r = await createBillingPortalSessionAction();
    setBusy(null);
    resolve(r);
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
          <div className="flex items-center gap-3">
            <Badge variant="success" dot>
              Active
            </Badge>
            {stripeEnabled && (
              <Button variant="outline" size="sm" onClick={openPortal} disabled={busy !== null}>
                {busy === "portal" ? <Loader2 className="animate-spin" /> : <ExternalLink />}
                Manage billing
              </Button>
            )}
          </div>
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

      {/* Test-card picker (test mode only) */}
      {stripeEnabled && <TestCards />}

      {/* Seats add-on */}
      <Card className="flex flex-wrap items-center gap-4 p-5">
        <div className="min-w-0 flex-1">
          <p className="font-medium">Need more seats?</p>
          <p className="text-sm text-muted-foreground">
            Add extra seats to any paid plan for a per-seat monthly fee.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={busy !== null}
          onClick={() =>
            stripeEnabled
              ? openPortal()
              : toast.info("Add your Stripe keys to manage seats and payment.")
          }
        >
          {stripeEnabled ? "Manage in portal" : "Add seats"}
        </Button>
      </Card>

      <p className="text-xs text-muted-foreground">
        {stripeEnabled
          ? "Paid plans go through Stripe Checkout (test mode — use card 4242 4242 4242 4242, any future date & CVC). Downgrades, cancellations and invoices live in the billing portal."
          : "Stripe isn't configured, so switching plans applies immediately without payment. Add your Stripe keys and run npm run stripe:setup to enable real checkout."}
      </p>
    </div>
  );
}

/** Stripe test cards. Numbers only — Checkout is hosted, so paste one there. */
const TEST_CARDS: { number: string; label: string; tone: "ok" | "warn" | "bad" }[] = [
  { number: "4242 4242 4242 4242", label: "Visa · payment succeeds", tone: "ok" },
  { number: "5555 5555 5555 4444", label: "Mastercard · succeeds", tone: "ok" },
  { number: "4000 0025 0000 3155", label: "Requires 3-D Secure auth", tone: "warn" },
  { number: "4000 0000 0000 9995", label: "Declined · insufficient funds", tone: "bad" },
  { number: "4000 0000 0000 0002", label: "Declined · generic", tone: "bad" },
];

function TestCards() {
  const [copied, setCopied] = React.useState<string | null>(null);

  async function copy(number: string) {
    try {
      await navigator.clipboard.writeText(number.replace(/\s/g, ""));
      setCopied(number);
      toast.success("Card number copied — paste it into Stripe Checkout.");
    } catch {
      toast.error("Couldn't copy — select and copy the number manually.");
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <CreditCard className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">Test cards</h2>
        <Badge variant="secondary">Test mode</Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Copy a number, start Checkout, and paste it in. Use any future expiry date, any 3-digit CVC,
        and any postal code.
      </p>
      <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
        {TEST_CARDS.map((c) => (
          <li key={c.number} className="flex items-center gap-3 p-3">
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                c.tone === "ok" ? "bg-success" : c.tone === "warn" ? "bg-warning" : "bg-destructive",
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-sm tabular-nums">{c.number}</p>
              <p className="text-xs text-muted-foreground">{c.label}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => copy(c.number)}>
              {copied === c.number ? <Check className="text-success" /> : <Copy />}
              {copied === c.number ? "Copied" : "Copy"}
            </Button>
          </li>
        ))}
      </ul>
    </Card>
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
