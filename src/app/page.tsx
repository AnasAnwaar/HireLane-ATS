import {
  ArrowRight,
  BrainCircuit,
  Check,
  ClipboardCheck,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScoreRing } from "@/components/ui/score-ring";

const FEATURES = [
  {
    icon: Share2,
    title: "Publish once, everywhere",
    body: "One requisition becomes platform-native, SEO-optimised posts for LinkedIn, Indeed and Rozee.pk. Edit any variant, then publish everywhere in a click.",
  },
  {
    icon: BrainCircuit,
    title: "Screening that shows its work",
    body: "Every applicant is ranked against your actual requirements, with the CV line behind each score. The agent recommends — a human always decides.",
  },
  {
    icon: ClipboardCheck,
    title: "Tests written in minutes",
    body: "Generate an assessment from the job description or write it yourself. MCQs auto-score; written answers get a suggested grade you confirm.",
  },
  {
    icon: ShieldCheck,
    title: "Integrity you can defend",
    body: "Proctored sessions capture tab switches, second faces and anomalies — then hand you an evidence timeline, not a verdict.",
  },
  {
    icon: Users,
    title: "One record per candidate",
    body: "Match report, test results, flags, interviews, notes and scorecards on a single profile with an append-only history.",
  },
  {
    icon: SlidersHorizontal,
    title: "Your rules, not ours",
    body: "Every permission in the platform is a toggle your own admin controls — down to who may see a salary band or proctoring footage.",
  },
];

const STEPS = [
  { n: "01", title: "Describe the role once", body: "Fill the requisition — title, requirements, salary band, screening questions." },
  { n: "02", title: "Publish to every board", body: "AI writes a tuned post per platform. Review, edit, publish or schedule." },
  { n: "03", title: "Let the agent rank", body: "Applicants arrive scored and explained, deduplicated across channels." },
  { n: "04", title: "Assess and interview", body: "Proctored tests and built-in video rounds, all logged to the profile." },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <div aria-hidden className="brand-rule h-1 w-full" />
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-6">
          <BrandMark />
          <nav className="ml-8 hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">
              Features
            </a>
            <a href="#how" className="transition-colors hover:text-foreground">
              How it works
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            <Button variant="ghost" size="sm" asChild>
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
        <section className="relative overflow-hidden bg-hero-wash">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-dot-grid text-foreground/[0.07] [mask-image:radial-gradient(50rem_28rem_at_50%_0%,black,transparent)]"
          />
          <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-20 text-center sm:pt-24">
            <Badge variant="default" className="mb-6" dot>
              AI-assisted recruitment
            </Badge>

            <h1 className="mx-auto max-w-3xl text-balance text-4xl font-semibold leading-[1.08] sm:text-[3.4rem]">
              <span className="text-gradient-brand">
                From “we need a person” to “we hired the right person”
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-xl text-pretty text-[1.0625rem] leading-relaxed text-muted-foreground">
              Post to every job board, screen every applicant, run proctored tests and
              interviews, and keep one auditable record per candidate — in a single tool your
              whole hiring team can actually use.
            </p>

            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Button size="lg" asChild>
                <Link href="/signup">
                  Create your workspace <ArrowRight />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/dashboard">See the dashboard</Link>
              </Button>
            </div>

            <ul className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              {["No credit card", "Set up in minutes", "Your own permission rules"].map(
                (item) => (
                  <li key={item} className="flex items-center gap-1.5">
                    <Check className="size-4 text-success" />
                    {item}
                  </li>
                ),
              )}
            </ul>

            {/* Product preview */}
            <div className="mx-auto mt-16 max-w-3xl">
              <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card-lg">
                <div className="flex items-center gap-2 border-b border-border bg-muted/60 px-4 py-2.5">
                  <span className="flex gap-1.5">
                    <span className="size-2.5 rounded-full bg-destructive/40" />
                    <span className="size-2.5 rounded-full bg-warning/50" />
                    <span className="size-2.5 rounded-full bg-success/40" />
                  </span>
                  <span className="mx-auto text-xs text-muted-foreground">
                    Senior React Developer · 348 applicants
                  </span>
                </div>
                <div className="divide-y divide-border text-left">
                  {[
                    { name: "Ayesha Khan", score: 94, note: "8/8 must-haves · 6 yrs React", status: "Strong fit", variant: "success" as const },
                    { name: "Bilal Ahmed", score: 88, note: "7/8 must-haves · 5 yrs React", status: "Strong fit", variant: "success" as const },
                    { name: "Usman Tariq", score: 67, note: "5/8 must-haves · gap 2023–24", status: "Possible fit", variant: "warning" as const },
                  ].map((row) => (
                    <div key={row.name} className="flex items-center gap-4 px-4 py-3.5">
                      <ScoreRing score={row.score} size={40} />
                      <Avatar name={row.name} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{row.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{row.note}</p>
                      </div>
                      <Badge variant={row.variant} dot>
                        {row.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl px-6 py-24">
          <div className="mb-12 max-w-2xl">
            <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.09em] text-primary">
              What it does
            </p>
            <h2 className="text-3xl font-semibold">
              Six things an ordinary ATS makes you do by hand
            </h2>
          </div>

          <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="group bg-card p-7 transition-colors hover:bg-accent/40"
              >
                <span className="mb-4 flex size-10 items-center justify-center rounded-xl bg-sand text-sand-foreground transition-transform group-hover:scale-105 group-hover:bg-primary group-hover:text-primary-foreground">
                  <feature.icon className="size-[1.15rem]" />
                </span>
                <h3 className="mb-2 font-semibold">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="border-y border-border bg-muted/40">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <div className="mb-12 max-w-2xl">
              <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.09em] text-primary">
                How it works
              </p>
              <h2 className="text-3xl font-semibold">Four steps, one tool</h2>
            </div>

            <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step) => (
                <li key={step.n} className="relative">
                  <span className="mb-3 block font-mono text-sm font-bold text-primary">
                    {step.n}
                  </span>
                  <span
                    aria-hidden
                    className="mb-4 block h-px w-full bg-gradient-to-r from-primary/50 to-transparent"
                  />
                  <h3 className="mb-1.5 font-semibold">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-6 py-24">
          <div className="relative overflow-hidden rounded-3xl border border-border bg-card px-8 py-16 text-center shadow-card-md">
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-hero-wash" />
            <div className="relative">
              <h2 className="mx-auto max-w-lg text-balance text-3xl font-semibold">
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
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8">
          <BrandMark />
          <p className="text-xs text-muted-foreground">
            Build in progress — see BUILD-CHECKLIST.md for current status.
          </p>
        </div>
      </footer>
    </div>
  );
}
