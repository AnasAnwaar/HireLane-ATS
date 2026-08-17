import { ArrowRight, Check, Lock, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { Feature } from "@/server/billing/entitlements";

type Meta = { title: string; plan: string; blurb: string; benefits: string[] };

const FEATURE_META: Record<Feature, Meta> = {
  integrations: {
    title: "Channel integrations",
    plan: "Basic",
    blurb: "Connect job boards and accounts to post openings and sync candidates automatically.",
    benefits: ["One-click posting to job boards", "Automatic candidate sync", "Connected account management"],
  },
  ai_posts: {
    title: "AI job-post generation",
    plan: "Basic",
    blurb: "Turn a role into a polished, on-brand job post in seconds — no blank page.",
    benefits: ["Draft posts from a job title", "Tailored tone & length", "Channel-ready variants"],
  },
  ai_screening: {
    title: "AI screening & match reports",
    plan: "Premium",
    blurb: "Rank applicants against the role with explainable match reports, so you shortlist faster.",
    benefits: ["Automatic candidate ranking", "Explainable match reports", "Re-rank as criteria change"],
  },
  ai_assessments: {
    title: "AI assessments & grading",
    plan: "Premium",
    blurb: "Generate role-specific assessments and let AI grade them with proctoring insight.",
    benefits: ["Role-specific test generation", "Automatic grading", "Proctoring & integrity signals"],
  },
};

/**
 * Wrap a feature-gated screen. When `locked`, the real content is replaced by a
 * tempting upgrade prompt instead of rendering (so gated functionality never
 * runs); when unlocked, children render normally. `locked` is derived from the
 * org's entitlements — which a platform super-admin controls via plan edits and
 * assignments (CP-28).
 */
export function FeatureGate({
  locked,
  feature,
  children,
}: {
  locked: boolean;
  feature: Feature;
  children: ReactNode;
}) {
  if (!locked) return <>{children}</>;
  return <UpgradeHero feature={feature} />;
}

export function UpgradeHero({ feature }: { feature: Feature }) {
  const meta = FEATURE_META[feature];
  return (
    <div className="mx-auto max-w-2xl py-8">
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary-soft/60 via-background to-background p-8 shadow-card">
        <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-background/70 px-3 py-1 text-xs font-medium text-primary">
            <Lock className="size-3" /> {meta.plan} feature
          </span>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight">{meta.title}</h2>
          <p className="mt-2 text-muted-foreground">{meta.blurb}</p>

          <ul className="mt-5 grid gap-2 sm:grid-cols-2">
            {meta.benefits.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <Check className="size-3" />
                </span>
                {b}
              </li>
            ))}
          </ul>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/admin/billing"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5"
            >
              <Sparkles className="size-4" /> Upgrade to {meta.plan}
              <ArrowRight className="size-4" />
            </Link>
            <span className="text-xs text-muted-foreground">
              Your current plan doesn&apos;t include this — upgrade to unlock it instantly.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
