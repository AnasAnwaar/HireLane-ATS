"use client";

import { Check, Copy, CreditCard, Loader2, Minus, Plus, Sparkles, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ActionResult } from "@/lib/validation/auth";
import { cn } from "@/lib/utils";
import {
  cancelSubscriptionAction,
  changePlanAction,
  reconcileSubscriptionAction,
  switchPlanStripeAction,
  updateSeatsAction,
} from "@/server/billing/actions";

import { EmbeddedCheckoutModal } from "./embedded-checkout";

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
  testMode,
  addonSeats,
  seatsSupported,
  hasSubscription,
  status,
}: {
  currentPlan: string;
  organization: string;
  usage: { seatsUsed: number; seatCap: number | null; openingsUsed: number; openingCap: number | null };
  features: Record<"integrations" | "ai_posts" | "ai_screening" | "ai_assessments", boolean>;
  stripeEnabled: boolean;
  testMode: boolean;
  addonSeats: number;
  seatsSupported: boolean;
  hasSubscription: boolean;
  status: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [checkoutPlan, setCheckoutPlan] = React.useState<string | null>(null);
  const current = PLANS.find((p) => p.key === currentPlan);

  // Over-limit state: more members/openings than the plan allows (e.g. after a
  // downgrade). Existing data keeps working, but new invites/openings are blocked
  // server-side — surface it with a path forward instead of a bare red bar.
  const overSeats = usage.seatCap != null && usage.seatsUsed > usage.seatCap;
  const overOpenings = usage.openingCap != null && usage.openingsUsed > usage.openingCap;
  const overLimit = overSeats || overOpenings;

  // On a returning (embedded) Checkout, reconcile the plan from Stripe directly
  // so it flips immediately — without depending on webhook delivery (which can't
  // reach localhost). Then scrub the query.
  const checkout = searchParams.get("checkout");
  React.useEffect(() => {
    if (!checkout) return;
    if (checkout === "complete" || checkout === "success") {
      void (async () => {
        const r = await reconcileSubscriptionAction();
        if (r.ok) toast.success("Payment received — your plan is now active.");
        else toast.error(r.error);
        router.replace("/admin/billing");
        router.refresh();
      })();
    } else if (checkout === "cancelled") {
      toast.info("Checkout cancelled — no changes made.");
      router.replace("/admin/billing");
    }
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
    // First subscription needs card entry → open embedded Checkout in a modal
    // (stays on our domain, no redirect).
    if (stripeEnabled && plan.key !== "free" && !hasSubscription) {
      setCheckoutPlan(plan.key);
      return;
    }

    setBusy(plan.key);
    let r: ActionResult;
    if (!stripeEnabled) {
      r = await changePlanAction(plan.key); // no payment configured — direct switch
    } else if (plan.key === "free") {
      r = await cancelSubscriptionAction(); // in-app cancel → dashboard, no Stripe redirect
    } else {
      r = await switchPlanStripeAction(plan.key); // in-app plan swap on the card on file
    }
    setBusy(null);
    resolve(r);
  }

  async function cancelSub() {
    if (!confirm("Cancel your subscription? You'll move to the Free plan and lose paid features.")) return;
    setBusy("cancel");
    const r = await cancelSubscriptionAction();
    setBusy(null);
    resolve(r);
  }

  const cap = (n: number | null) => (n == null ? "∞" : n);
  type Feat = "integrations" | "ai_posts" | "ai_screening" | "ai_assessments";
  const FEATURE_ROWS: { key: Feat; label: string }[] = [
    { key: "ai_posts", label: "AI job-post generation" },
    { key: "ai_screening", label: "AI screening & match reports" },
    { key: "ai_assessments", label: "AI assessments & grading" },
  ];

  return (
    <div className="space-y-8">
      {checkoutPlan && (
        <EmbeddedCheckoutModal planKey={checkoutPlan} onClose={() => setCheckoutPlan(null)} />
      )}

      {status === "past_due" && (
        <div className="rounded-lg border border-destructive/40 bg-destructive-soft p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
              <CreditCard className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-destructive">Your last payment failed</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                We couldn&apos;t charge your card, so your subscription is past due. Update your
                payment method to keep your plan active — otherwise it may be cancelled.
              </p>
              {stripeEnabled && current && !current.custom && current.key !== "free" && (
                <Button size="sm" className="mt-3" onClick={() => setCheckoutPlan(current.key)}>
                  <CreditCard /> Update payment
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {overLimit && (
        <div className="rounded-lg border border-destructive/30 bg-destructive-soft/50 p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
              <X className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-destructive">
                You&apos;re over your {current?.name ?? currentPlan} plan limits
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {overSeats && (
                  <>
                    You have <strong>{usage.seatsUsed}</strong> members but this plan includes{" "}
                    <strong>{usage.seatCap}</strong> seat{usage.seatCap === 1 ? "" : "s"}.{" "}
                  </>
                )}
                {overOpenings && (
                  <>
                    You have <strong>{usage.openingsUsed}</strong> active openings but this plan
                    allows <strong>{usage.openingCap}</strong>.{" "}
                  </>
                )}
                Everyone keeps working, but you can&apos;t add more until you upgrade
                {overSeats ? " or remove members" : " or close some openings"}.
              </p>
              <div className="mt-3">
                <Button
                  size="sm"
                  onClick={() => document.getElementById("change-plan")?.scrollIntoView({ behavior: "smooth" })}
                >
                  <Sparkles /> Upgrade plan
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {stripeEnabled && testMode && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning-soft px-4 py-2.5 text-sm text-warning-foreground">
          <CreditCard className="size-4 shrink-0" />
          <span>
            <strong>Test mode.</strong> Payments use Stripe test cards — no real money moves. Going
            live needs production keys (and, from Pakistan, a Merchant-of-Record).
          </span>
        </div>
      )}

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
            {stripeEnabled && hasSubscription && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={cancelSub}
                disabled={busy !== null}
              >
                {busy === "cancel" ? <Loader2 className="animate-spin" /> : <X />}
                Cancel subscription
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
      <div id="change-plan">
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
      <SeatControl initial={addonSeats} supported={seatsSupported} stripeEnabled={stripeEnabled} />

      <p className="text-xs text-muted-foreground">
        {stripeEnabled
          ? "Your first subscription uses Stripe Checkout for card entry (test mode — card 4242 4242 4242 4242, any future date & CVC). Plan switches and cancellation then happen right here, no redirect."
          : "Stripe isn't configured, so switching plans applies immediately without payment. Add your Stripe keys and run npm run stripe:setup to enable real checkout."}
      </p>
    </div>
  );
}

/** Extra-seat purchase — a quantity-based Stripe subscription item. */
function SeatControl({
  initial,
  supported,
  stripeEnabled,
}: {
  initial: number;
  supported: boolean;
  stripeEnabled: boolean;
}) {
  const router = useRouter();
  const [qty, setQty] = React.useState(initial);
  const [saved, setSaved] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const dirty = qty !== saved;

  async function save() {
    setBusy(true);
    const r = await updateSeatsAction(qty);
    setBusy(false);
    if (r.ok) {
      setSaved(qty);
      toast.success(r.message ?? "Seats updated.");
      router.refresh();
    } else toast.error(r.error);
  }

  return (
    <Card className="flex flex-wrap items-center gap-4 p-5">
      <div className="min-w-0 flex-1">
        <p className="font-medium">Extra seats</p>
        <p className="text-sm text-muted-foreground">
          {supported
            ? "Add seats beyond your plan's included limit — billed per seat, prorated."
            : stripeEnabled
              ? "Extra seats are available once you're on a paid plan."
              : "Add your Stripe keys to buy extra seats."}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-lg border border-border">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-r-none"
            disabled={!supported || busy || qty <= 0}
            onClick={() => setQty((n) => Math.max(0, n - 1))}
            aria-label="Fewer seats"
          >
            <Minus />
          </Button>
          <span className="w-10 text-center text-sm font-medium tabular-nums" aria-live="polite">
            {qty}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-l-none"
            disabled={!supported || busy || qty >= 50}
            onClick={() => setQty((n) => Math.min(50, n + 1))}
            aria-label="More seats"
          >
            <Plus />
          </Button>
        </div>
        <Button disabled={!supported || busy || !dirty} onClick={save}>
          {busy && <Loader2 className="animate-spin" />}
          {dirty ? "Update seats" : "Saved"}
        </Button>
      </div>
    </Card>
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
