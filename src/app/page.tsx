import {
  ArrowRight,
  BrainCircuit,
  ClipboardCheck,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { HiringFunnel } from "@/components/landing/hiring-funnel";
import { ProductShowcase } from "@/components/landing/product-showcase";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Hirelane — AI-assisted applicant tracking",
  description:
    "Publish to every job board, screen every applicant with explainable AI, run proctored assessments and interviews, and keep one auditable record per candidate.",
};

const FEATURES = [
  {
    icon: Share2,
    title: "Publish once, everywhere",
    body: "One requisition becomes platform-native, SEO-optimised posts for LinkedIn, Indeed and Rozee.pk — reviewed and published in a click.",
    tint: "oklch(0.955 0.032 28)",
    ink: "oklch(0.55 0.2 27)",
  },
  {
    icon: BrainCircuit,
    title: "Screening that shows its work",
    body: "Every applicant is ranked against your real requirements, with the CV line behind each score. The agent recommends; a human always decides.",
    tint: "oklch(0.95 0.035 250)",
    ink: "oklch(0.52 0.15 255)",
  },
  {
    icon: ClipboardCheck,
    title: "Assessments in minutes",
    body: "Generate a test from the job description or write your own. MCQs auto-score; written answers get a suggested grade you confirm.",
    tint: "oklch(0.955 0.045 160)",
    ink: "oklch(0.5 0.12 160)",
  },
  {
    icon: ShieldCheck,
    title: "Integrity you can defend",
    body: "Proctored sessions capture tab-switches, second faces and anomalies — then hand you an evidence timeline, never a verdict.",
    tint: "oklch(0.955 0.05 80)",
    ink: "oklch(0.55 0.13 65)",
  },
  {
    icon: Users,
    title: "One record per candidate",
    body: "Match report, tests, flags, interviews, notes and scorecards on a single profile behind an append-only history.",
    tint: "oklch(0.95 0.04 300)",
    ink: "oklch(0.52 0.16 300)",
  },
  {
    icon: SlidersHorizontal,
    title: "Your rules, not ours",
    body: "Every permission is a toggle your own admin controls — down to who may see a salary band or proctoring footage.",
    tint: "oklch(0.95 0.045 195)",
    ink: "oklch(0.5 0.11 195)",
  },
];

const STEPS = [
  { n: "01", title: "Describe the role once", body: "Title, requirements, salary band, screening questions — entered a single time." },
  { n: "02", title: "Publish to every board", body: "AI writes a tuned post per platform. Review, edit, then publish or schedule." },
  { n: "03", title: "Let the agent rank", body: "Applicants arrive scored and explained, deduplicated across every channel." },
  { n: "04", title: "Assess, interview, hire", body: "Proctored tests and built-in video rounds — all logged to the candidate’s record." },
];

const TRUST_AVATARS = ["Ayesha Khan", "Bilal Ahmed", "Hina Raza", "Usman Tariq", "Sara Malik"];

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <div aria-hidden className="brand-rule h-1 w-full" />

      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl 2xl:max-w-[88rem] items-center gap-3 px-6">
          <BrandMark />
          <nav className="ml-8 hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#product" className="transition-colors hover:text-foreground">Product</a>
            <a href="#features" className="transition-colors hover:text-foreground">Features</a>
            <a href="#how" className="transition-colors hover:text-foreground">How it works</a>
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/signup">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-hero-wash" />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-grid-lines [mask-image:radial-gradient(56rem_36rem_at_60%_10%,black,transparent)]"
          />

          <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-5 py-14 sm:px-6 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-24 2xl:max-w-[88rem] 2xl:gap-16 2xl:py-32">
            <div>
              <Badge variant="default" dot className="mb-5">
                <Sparkles className="size-3" /> AI-assisted recruitment
              </Badge>
              <h1 className="text-balance text-[2.05rem] font-semibold leading-[1.08] tracking-tight sm:text-[3rem] sm:leading-[1.04] xl:text-[3.6rem] 2xl:text-[4.25rem]">
                Every applicant,
                <br />
                <span className="text-gradient-brand">down to the right hire.</span>
              </h1>
              <p className="mt-5 max-w-lg text-pretty text-base leading-relaxed text-muted-foreground sm:mt-6 sm:text-[1.0625rem] 2xl:text-lg">
                Post to every job board, screen every applicant with explainable AI, run proctored
                assessments and interviews, and keep one auditable record per candidate — in a
                single tool your whole hiring team can use.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Button size="lg" asChild>
                  <Link href="/signup">
                    Create your workspace <ArrowRight />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="#product">See the product</Link>
                </Button>
              </div>

              {/* Trust */}
              <div className="mt-9 flex items-center gap-4">
                <div className="flex -space-x-2.5">
                  {TRUST_AVATARS.map((n) => (
                    <Avatar
                      key={n}
                      name={n}
                      size="sm"
                      className="ring-2 ring-background"
                    />
                  ))}
                </div>
                <div className="text-sm">
                  <div className="flex items-center gap-0.5 text-warning">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className="size-3.5 fill-current" />
                    ))}
                  </div>
                  <p className="text-muted-foreground">Built for modern hiring teams</p>
                </div>
              </div>
            </div>

            {/* 3D funnel */}
            <div className="relative mx-auto aspect-square w-full max-w-[20rem] sm:max-w-[28rem] lg:aspect-auto lg:h-[30rem] lg:max-w-[34rem] 2xl:h-[40rem]">
              <div aria-hidden className="pointer-events-none absolute inset-0 rounded-full bg-primary/10 blur-3xl" />
              <HiringFunnel />
              <div className="pointer-events-none absolute inset-x-0 bottom-2 text-center">
                <span className="glass rounded-full border border-border/60 px-3 py-1 text-xs font-medium text-muted-foreground">
                  Applicants → shortlist → hire
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Product showcase */}
        <section id="product" className="relative overflow-hidden border-y border-border">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-mesh opacity-70" />
          <div className="relative mx-auto max-w-7xl 2xl:max-w-[88rem] px-6 py-24">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-primary">
                The whole pipeline, one screen
              </p>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-[2.5rem] 2xl:text-[3rem]">
                See every candidate move from applied to hired
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
                Applicants arrive scored and explained. Drag them through your stages, and every
                note, test and interview lands on one auditable record.
              </p>
            </div>

            <div className="mx-auto max-w-4xl 2xl:max-w-5xl">
              <ProductShowcase />
            </div>
          </div>
        </section>

        {/* Stat strip */}
        <section className="border-b border-border bg-card">
          <div className="mx-auto grid max-w-7xl 2xl:max-w-[88rem] divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {[
              { stat: "One post", label: "publishes to every job board" },
              { stat: "0–100 score", label: "explained with cited CV evidence" },
              { stat: "One record", label: "per candidate, fully auditable" },
            ].map((s) => (
              <div key={s.stat} className="px-6 py-9 text-center">
                <p className="text-2xl font-semibold tracking-tight">{s.stat}</p>
                <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-7xl 2xl:max-w-[88rem] px-6 py-24">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-primary">
              What it does
            </p>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-[2.5rem] 2xl:text-[3rem]">
              Six things an ordinary ATS makes you do by hand
            </h2>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="group rounded-2xl border border-border bg-card p-7 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-card-md"
              >
                <span
                  className="mb-5 inline-flex size-12 items-center justify-center rounded-xl transition-transform group-hover:scale-105"
                  style={{ backgroundColor: feature.tint, color: feature.ink }}
                >
                  <feature.icon className="size-[1.3rem]" />
                </span>
                <h3 className="mb-2 font-semibold tracking-tight">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="border-y border-border bg-muted/40">
          <div className="mx-auto max-w-7xl 2xl:max-w-[88rem] px-6 py-24">
            <div className="mb-14 max-w-2xl">
              <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-primary">
                How it works
              </p>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-[2.5rem] 2xl:text-[3rem]">
                Four steps, one tool
              </h2>
            </div>

            <ol className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step) => (
                <li key={step.n} className="relative rounded-2xl border border-border bg-card p-6 shadow-card">
                  <span className="inline-flex size-9 items-center justify-center rounded-lg bg-primary-soft font-mono text-sm font-bold text-primary">
                    {step.n}
                  </span>
                  <h3 className="mb-1.5 mt-4 font-semibold tracking-tight">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-7xl 2xl:max-w-[88rem] px-6 py-24">
          <div className="relative overflow-hidden rounded-3xl border border-border bg-card px-8 py-16 text-center shadow-card-md">
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-cta-animated opacity-80" />
            <div className="relative">
              <h2 className="mx-auto max-w-lg text-balance text-3xl font-semibold tracking-tight sm:text-[2.5rem] 2xl:text-[3rem]">
                Set up your company workspace today
              </h2>
              <p className="mx-auto mt-4 max-w-md text-muted-foreground">
                You define the roles, the permissions and the workflow. We handle everything
                between the job post and the offer.
              </p>
              <Button size="lg" className="mt-8" asChild>
                <Link href="/signup">
                  Get started free <ArrowRight />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl 2xl:max-w-[88rem] flex-wrap items-center justify-between gap-4 px-6 py-8">
          <BrandMark />
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Hirelane · AI-assisted applicant tracking
          </p>
        </div>
      </footer>
    </div>
  );
}
