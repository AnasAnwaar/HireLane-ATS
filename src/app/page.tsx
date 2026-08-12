import {
  ArrowRight,
  BrainCircuit,
  Check,
  ClipboardCheck,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { HiringFunnel } from "@/components/landing/hiring-funnel";
import { AppWindow, MatchReportScreen, ScreeningScreen } from "@/components/landing/product-frame";
import { Reveal } from "@/components/landing/reveal";
import { ContactForm } from "@/components/landing/contact-form";
import { Spotlight, SpotlightCard } from "@/components/landing/spotlight";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "HireLane — AI-assisted applicant tracking",
  description:
    "Publish to every job board, screen every applicant with explainable AI, run proctored assessments and interviews, and keep one auditable record per candidate.",
};

const FEATURES = [
  {
    icon: Share2,
    title: "Publish once, everywhere",
    body: "One requisition becomes platform-native, SEO-optimised posts for LinkedIn, Indeed and Rozee.pk — reviewed and published in a click.",
  },
  {
    icon: BrainCircuit,
    title: "Screening that shows its work",
    body: "Every applicant is ranked against your real requirements, with the CV line behind each score. The agent recommends; a human always decides.",
  },
  {
    icon: ClipboardCheck,
    title: "Assessments in minutes",
    body: "Generate a test from the job description or write your own. MCQs auto-score; written answers get a suggested grade you confirm.",
  },
  {
    icon: ShieldCheck,
    title: "Integrity you can defend",
    body: "Proctored sessions capture tab-switches, second faces and anomalies — then hand you an evidence timeline, never a verdict.",
  },
  {
    icon: Users,
    title: "One record per candidate",
    body: "Match report, tests, flags, interviews, notes and scorecards on a single profile behind an append-only history.",
  },
  {
    icon: SlidersHorizontal,
    title: "Your rules, not ours",
    body: "Every permission is a toggle your own admin controls — down to who may see a salary band or proctoring footage.",
  },
];

const STEPS = [
  { n: "01", title: "Describe the role once", body: "Title, requirements, salary band, screening questions — entered a single time." },
  { n: "02", title: "Publish to every board", body: "AI writes a tuned post per platform. Review, edit, then publish or schedule." },
  { n: "03", title: "Let the agent rank", body: "Applicants arrive scored and explained, deduplicated across every channel." },
  { n: "04", title: "Assess, interview, hire", body: "Proctored tests and built-in video rounds — all logged to the candidate’s record." },
];

const TRUST_AVATARS = ["Ayesha Khan", "Bilal Ahmed", "Hina Raza", "Usman Tariq", "Sara Malik"];

const CHANNELS = ["LinkedIn", "Indeed", "Rozee.pk", "Glassdoor", "Bayt", "Facebook Jobs", "X", "Careers Page"];

const PRICING = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    tagline: "For a solo recruiter getting started.",
    cta: "Start free",
    features: [
      { t: "1 user (admin only)", ok: true },
      { t: "Up to 5 job openings", ok: true },
      { t: "Applicant tracking & pipeline", ok: true },
      { t: "Channel / account integrations", ok: false },
      { t: "AI features", ok: false },
    ],
  },
  {
    name: "Basic",
    price: "$49",
    period: "/ month",
    tagline: "For a small team posting and screening.",
    cta: "Choose Basic",
    features: [
      { t: "3 seats (admin + 2)", ok: true },
      { t: "Unlimited job openings", ok: true },
      { t: "Channel & account integrations", ok: true },
      { t: "AI job-post generation", ok: true },
      { t: "AI screening & assessments", ok: false },
    ],
  },
  {
    name: "Premium",
    price: "$149",
    period: "/ month",
    popular: true,
    tagline: "For teams that want the full AI stack.",
    cta: "Choose Premium",
    features: [
      { t: "Up to 10 seats", ok: true },
      { t: "Everything in Basic", ok: true },
      { t: "AI screening & match reports", ok: true },
      { t: "AI assessments + grading", ok: true },
      { t: "Proctoring & interview tooling", ok: true },
    ],
  },
  {
    name: "Custom",
    price: "Let’s talk",
    period: "",
    custom: true,
    tagline: "For agencies & enterprises with bespoke needs.",
    cta: "Get in touch",
    features: [
      { t: "Unlimited seats & openings", ok: true },
      { t: "Everything in Premium", ok: true },
      { t: "SSO, custom roles & audit exports", ok: true },
      { t: "Dedicated onboarding & support", ok: true },
      { t: "Custom integrations, SLAs & pricing", ok: true },
    ],
  },
];

const chrome = "bg-gradient-to-b from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent";

export default function LandingPage() {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-[#09090b] text-zinc-100">
      {/* Ambient red bloom + subtle grid on near-black */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          backgroundImage:
            "radial-gradient(48rem 34rem at 78% -8%, oklch(0.55 0.24 27 / 0.28), transparent 60%)," +
            "radial-gradient(42rem 30rem at 8% 12%, oklch(0.45 0.2 25 / 0.18), transparent 62%)," +
            "radial-gradient(40rem 40rem at 50% 118%, oklch(0.5 0.22 27 / 0.16), transparent 60%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 opacity-[0.35] [mask-image:radial-gradient(60rem_40rem_at_50%_0%,black,transparent)]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px)," +
            "linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "3.5rem 3.5rem",
        }}
      />
      {/* Fine film grain for texture */}
      <div aria-hidden className="bg-grain pointer-events-none fixed inset-0 -z-10 opacity-[0.05] mix-blend-soft-light" />
      <div aria-hidden className="brand-rule h-1 w-full" />

      {/* Nav */}
      <header
        className="sticky top-0 z-40 border-b border-white/10 backdrop-blur-xl"
        style={{ background: "linear-gradient(90deg, rgba(30,14,15,0.82), rgba(12,10,11,0.7) 44%)" }}
      >
        <div className="mx-auto flex h-16 max-w-7xl 2xl:max-w-[88rem] items-center gap-3 px-6">
          <BrandMark onDark />
          <nav className="ml-8 hidden items-center gap-7 text-sm text-zinc-400 md:flex">
            <a href="#features" className="transition-colors hover:text-white">Features</a>
            <a href="#how" className="transition-colors hover:text-white">How it works</a>
            <a href="#flow" className="transition-colors hover:text-white">The pipeline</a>
            <a href="#pricing" className="transition-colors hover:text-white">Pricing</a>
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="ghost" size="sm" className="hidden text-zinc-300 hover:bg-white/10 hover:text-white sm:inline-flex" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button size="sm" className="shadow-[0_0_20px_-4px_oklch(0.55_0.24_27_/_0.7)]" asChild>
              <Link href="/signup">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          {/* Warm red-black wash + a horizontal neon streak — echoes the logo's
              own studio backdrop so the mark reads as native to the section. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              background:
                "radial-gradient(70% 80% at 82% 42%, #2a1010 0%, #170a0b 40%, transparent 72%)",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-[36%] -z-10 h-px opacity-70"
            style={{
              background:
                "linear-gradient(90deg, transparent, oklch(0.62 0.24 27 / 0.55) 45%, oklch(0.62 0.24 27 / 0.55) 60%, transparent)",
              boxShadow: "0 0 26px 4px oklch(0.55 0.24 27 / 0.35)",
            }}
          />
          <div className="mx-auto grid max-w-7xl 2xl:max-w-[88rem] items-center gap-10 px-5 py-14 sm:px-6 sm:py-16 lg:grid-cols-[1.02fr_0.98fr] lg:py-24 2xl:gap-16 2xl:py-28">
            <div>
              <span className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <Sparkles className="size-3" /> AI-assisted recruitment
              </span>
              <h1 className="text-balance text-[2.1rem] font-semibold leading-[1.08] tracking-tight sm:text-[3rem] sm:leading-[1.04] xl:text-[3.6rem] 2xl:text-[4.25rem]">
                <span className={chrome}>Every applicant,</span>
                <br />
                <span
                  className="text-primary"
                  style={{ textShadow: "0 0 28px oklch(0.55 0.24 27 / 0.55)" }}
                >
                  down to the right hire.
                </span>
              </h1>
              <p className="mt-6 max-w-lg text-pretty text-base leading-relaxed text-zinc-400 sm:text-[1.0625rem] 2xl:text-lg">
                Post to every job board, screen every applicant with explainable AI, run proctored
                assessments and interviews, and keep one auditable record per candidate — in a
                single tool your whole hiring team can use.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Button size="lg" className="shadow-[0_0_28px_-6px_oklch(0.55_0.24_27_/_0.8)]" asChild>
                  <Link href="/signup">
                    Create your workspace <ArrowRight />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" className="border-white/20 bg-white/[0.03] text-white hover:border-white/30 hover:bg-white/[0.08] hover:text-white" asChild>
                  <Link href="#flow">See the pipeline</Link>
                </Button>
              </div>

              {/* Trust */}
              <div className="mt-9 flex items-center gap-4">
                <div className="flex -space-x-2.5">
                  {TRUST_AVATARS.map((n) => (
                    <Avatar key={n} name={n} size="sm" className="ring-2 ring-[#09090b]" />
                  ))}
                </div>
                <div className="text-sm">
                  <div className="flex items-center gap-0.5 text-primary">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className="size-3.5 fill-current" />
                    ))}
                  </div>
                  <p className="text-zinc-500">Built for modern hiring teams</p>
                </div>
              </div>
            </div>

            {/* Product showpiece — a dark mockup of the AI screening list, tilted
                like a Linear product shot. */}
            <div className="relative mx-auto w-full max-w-[38rem] [perspective:1800px]">
              <div
                aria-hidden
                className="pointer-events-none absolute -inset-10 -z-10"
                style={{
                  background:
                    "radial-gradient(50% 48% at 56% 42%, oklch(0.55 0.24 27 / 0.3), transparent 68%)",
                }}
              />
              <div style={{ transform: "rotateY(-8deg) rotateX(3deg)" }}>
                <AppWindow title="hirelane.app · Applicants">
                  <ScreeningScreen />
                </AppWindow>
              </div>
            </div>
          </div>
        </section>

        {/* Channels marquee */}
        <section className="border-y border-white/10 py-9">
          <p className="mb-6 text-center text-[0.6875rem] font-medium uppercase tracking-[0.2em] text-zinc-600">
            One requisition, published to every board
          </p>
          <div className="relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
            <div className="marquee-track flex w-max items-center gap-14 pr-14">
              {[...CHANNELS, ...CHANNELS].map((c, i) => (
                <span key={i} className="whitespace-nowrap text-lg font-semibold tracking-tight text-zinc-500/80">
                  {c}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Stat strip */}
        <section className="border-b border-white/10 bg-white/[0.02]">
          <div className="mx-auto grid max-w-7xl 2xl:max-w-[88rem] divide-y divide-white/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {[
              { stat: "One post", label: "publishes to every job board" },
              { stat: "0–100 score", label: "explained with cited CV evidence" },
              { stat: "One record", label: "per candidate, fully auditable" },
            ].map((s) => (
              <div key={s.stat} className="px-6 py-9 text-center">
                <p className={`text-2xl font-semibold tracking-tight ${chrome}`}>{s.stat}</p>
                <p className="mt-1 text-sm text-zinc-500">{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <Spotlight id="features" className="mx-auto max-w-7xl 2xl:max-w-[88rem] px-6 py-24" size="44rem" color="oklch(0.55 0.24 27 / 0.1)">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-primary">
              What it does
            </p>
            <h2 className={`text-3xl font-semibold tracking-tight sm:text-[2.5rem] 2xl:text-[3rem] ${chrome}`}>
              Six things an ordinary ATS makes you do by hand
            </h2>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <SpotlightCard
                key={feature.title}
                className="hairline group rounded-2xl border border-white/10 bg-white/[0.03] p-7 hover:border-primary/30"
              >
                <div className="relative">
                  <span className="mb-5 inline-flex size-12 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary transition-transform group-hover/card:scale-105 group-hover/card:shadow-[0_0_22px_-4px_oklch(0.55_0.24_27_/_0.7)]">
                    <feature.icon className="size-[1.3rem]" />
                  </span>
                  <h3 className="mb-2 font-semibold tracking-tight text-white">{feature.title}</h3>
                  <p className="text-sm leading-relaxed text-zinc-400">{feature.body}</p>
                </div>
              </SpotlightCard>
            ))}
          </div>
        </Spotlight>

        {/* Match report product shot */}
        <section className="mx-auto max-w-7xl 2xl:max-w-[88rem] px-6 py-24">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <Reveal>
              <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-primary">
                Explainable screening
              </p>
              <h2 className={`text-3xl font-semibold tracking-tight sm:text-[2.5rem] 2xl:text-[3rem] ${chrome}`}>
                See the reasoning behind every score
              </h2>
              <p className="mt-4 max-w-md text-zinc-400">
                Each applicant is ranked against your real requirements — must-have coverage,
                experience, qualifications — with the CV evidence behind every point. Retune the
                weights, override the verdict; a human always decides.
              </p>
              <ul className="mt-6 space-y-2.5 text-sm text-zinc-300">
                {["Weighted score you can re-tune per opening", "Cited evidence for every match and gap", "Human override, recorded and reversible"].map((t) => (
                  <li key={t} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" /> {t}
                  </li>
                ))}
              </ul>
              <Button className="mt-7 shadow-[0_0_28px_-6px_oklch(0.55_0.24_27_/_0.8)]" asChild>
                <Link href="/signup">Screen your pipeline <ArrowRight /></Link>
              </Button>
            </Reveal>
            <Reveal delay={120} className="relative [perspective:1800px]">
              <div
                aria-hidden
                className="pointer-events-none absolute -inset-10 -z-10"
                style={{ background: "radial-gradient(50% 48% at 45% 42%, oklch(0.55 0.24 27 / 0.26), transparent 68%)" }}
              />
              <div style={{ transform: "rotateY(8deg) rotateX(3deg)" }}>
                <AppWindow title="hirelane.app · Match report">
                  <MatchReportScreen />
                </AppWindow>
              </div>
            </Reveal>
          </div>
        </section>

        {/* The pipeline — animated funnel band */}
        <Spotlight
          id="flow"
          className="relative overflow-hidden border-y border-white/10 bg-white/[0.02]"
          size="40rem"
          color="oklch(0.55 0.24 27 / 0.16)"
        >
          {/* deep red gradient glow anchored behind the funnel */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-0"
            style={{
              background:
                "radial-gradient(46rem 34rem at 78% 55%, oklch(0.5 0.22 27 / 0.22), transparent 62%)",
            }}
          />
          <div className="relative mx-auto grid max-w-7xl 2xl:max-w-[88rem] items-center gap-8 px-6 py-20 lg:grid-cols-2 lg:py-24">
            <div>
              <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-primary">
                Applicants → shortlist → hire
              </p>
              <h2 className={`text-3xl font-semibold tracking-tight sm:text-[2.5rem] 2xl:text-[3rem] ${chrome}`}>
                Thousands in. The right one out.
              </h2>
              <p className="mt-4 max-w-md text-zinc-400">
                Every channel funnels into one scored, deduplicated pipeline. The agent ranks and
                explains; you move candidates through your stages — and every note, test and
                interview lands on a single auditable record.
              </p>
              <Button className="mt-7 shadow-[0_0_28px_-6px_oklch(0.55_0.24_27_/_0.8)]" asChild>
                <Link href="/signup">Start hiring smarter <ArrowRight /></Link>
              </Button>
            </div>
            <div className="relative mx-auto aspect-square w-full max-w-[22rem] sm:max-w-[30rem] lg:h-[32rem] lg:aspect-auto lg:max-w-none">
              <div aria-hidden className="pointer-events-none absolute inset-0 rounded-full bg-primary/20 blur-3xl" />
              {/* reflective floor glow under the funnel */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-8 bottom-6 h-24 rounded-[50%] blur-2xl"
                style={{ background: "oklch(0.55 0.24 27 / 0.35)" }}
              />
              <HiringFunnel />
            </div>
          </div>
        </Spotlight>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-7xl 2xl:max-w-[88rem] px-6 py-24">
          <Reveal className="mb-14 max-w-2xl">
            <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-primary">
              How it works
            </p>
            <h2 className={`text-3xl font-semibold tracking-tight sm:text-[2.5rem] 2xl:text-[3rem] ${chrome}`}>
              Four steps, one tool
            </h2>
          </Reveal>

          <ol className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <Reveal
                as="li"
                key={step.n}
                delay={i * 90}
                className="hairline relative rounded-2xl border border-white/10 bg-white/[0.03] p-6"
              >
                <span className="inline-flex size-9 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 font-mono text-sm font-bold text-primary">
                  {step.n}
                </span>
                <h3 className="mb-1.5 mt-4 font-semibold tracking-tight text-white">{step.title}</h3>
                <p className="text-sm leading-relaxed text-zinc-400">{step.body}</p>
              </Reveal>
            ))}
          </ol>
        </section>

        {/* Pricing */}
        <Spotlight id="pricing" className="relative overflow-hidden border-y border-white/10 bg-white/[0.02]" size="42rem">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-72"
            style={{ background: "radial-gradient(38rem 18rem at 50% -20%, oklch(0.55 0.24 27 / 0.28), transparent 65%)" }}
          />
          <div className="relative mx-auto max-w-7xl 2xl:max-w-[88rem] px-6 py-24">
            <div className="mx-auto mb-14 max-w-2xl text-center">
              <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-primary">
                Pricing
              </p>
              <h2 className={`text-3xl font-semibold tracking-tight sm:text-[2.5rem] 2xl:text-[3rem] ${chrome}`}>
                Start free. Scale when you hire.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-zinc-400">
                Every plan is self-serve. Upgrade, downgrade or add extra seats any time — no calls,
                no lock-in.
              </p>
            </div>

            <div className="mx-auto grid max-w-6xl items-stretch gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {PRICING.map((plan) => {
                const popular = "popular" in plan && plan.popular;
                const custom = "custom" in plan && plan.custom;
                return (
                  <div key={plan.name} className="relative">
                    {popular && (
                      <span className="absolute -top-3 left-1/2 z-20 -translate-x-1/2 rounded-full border border-primary/40 bg-primary px-3 py-0.5 text-[0.6875rem] font-semibold text-primary-foreground shadow-[0_0_18px_-2px_oklch(0.55_0.24_27_/_0.9)]">
                        Most popular
                      </span>
                    )}
                    <SpotlightCard
                      className={
                        "hairline flex h-full flex-col rounded-2xl border p-7 " +
                        (popular
                          ? "border-primary/50 bg-gradient-to-b from-primary/[0.14] to-white/[0.02] shadow-[0_0_60px_-12px_oklch(0.55_0.24_27_/_0.6)]"
                          : "border-white/10 bg-white/[0.03] hover:border-white/20")
                      }
                    >
                      <div className="relative flex flex-1 flex-col">
                        <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
                        <p className="mt-1 text-sm text-zinc-400">{plan.tagline}</p>
                        <div className="mt-5 flex items-baseline gap-1.5">
                          <span
                            className={`${custom ? "text-2xl" : "text-4xl"} font-bold tracking-tight ${chrome}`}
                          >
                            {plan.price}
                          </span>
                          {plan.period && <span className="text-sm text-zinc-500">{plan.period}</span>}
                        </div>

                        <ul className="mt-6 flex-1 space-y-3 text-sm">
                          {plan.features.map((f) => (
                            <li key={f.t} className="flex items-start gap-2.5">
                              {f.ok ? (
                                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                              ) : (
                                <X className="mt-0.5 size-4 shrink-0 text-zinc-600" />
                              )}
                              <span className={f.ok ? "text-zinc-200" : "text-zinc-500"}>{f.t}</span>
                            </li>
                          ))}
                        </ul>

                        <Button
                          size="lg"
                          variant={popular ? "default" : "outline"}
                          className={
                            "mt-8 w-full " +
                            (popular
                              ? "shadow-[0_0_28px_-6px_oklch(0.55_0.24_27_/_0.8)]"
                              : "border-white/20 bg-white/[0.03] text-white hover:border-white/30 hover:bg-white/[0.08] hover:text-white")
                          }
                          asChild
                        >
                          <Link href={custom ? "#contact" : "/signup"}>{plan.cta}</Link>
                        </Button>
                      </div>
                    </SpotlightCard>
                  </div>
                );
              })}
            </div>

            <p className="mt-8 text-center text-sm text-zinc-500">
              Need more than 10 seats? Add extra seats to any paid plan for a per-seat fee. Billing
              is secured by Stripe.
            </p>
          </div>
        </Spotlight>

        {/* CTA */}
        <section className="mx-auto max-w-7xl 2xl:max-w-[88rem] px-6 py-24">
          <div className="hairline relative overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-b from-white/[0.06] to-transparent px-8 py-16 text-center">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  "radial-gradient(36rem 20rem at 50% -30%, oklch(0.55 0.24 27 / 0.35), transparent 60%)",
              }}
            />
            <div className="relative">
              <h2 className={`mx-auto max-w-lg text-balance text-3xl font-semibold tracking-tight sm:text-[2.5rem] 2xl:text-[3rem] ${chrome}`}>
                Set up your company workspace today
              </h2>
              <p className="mx-auto mt-4 max-w-md text-zinc-400">
                You define the roles, the permissions and the workflow. We handle everything between
                the job post and the offer.
              </p>
              <Button size="lg" className="mt-8 shadow-[0_0_28px_-6px_oklch(0.55_0.24_27_/_0.8)]" asChild>
                <Link href="/signup">
                  Get started free <ArrowRight />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Contact */}
        <section id="contact" className="scroll-mt-24 border-t border-white/10 bg-white/[0.02]">
          <div className="mx-auto grid max-w-6xl gap-10 px-6 py-24 lg:grid-cols-2 lg:gap-16">
            <div>
              <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-primary">
                Contact
              </p>
              <h2 className={`text-3xl font-semibold tracking-tight sm:text-[2.5rem] ${chrome}`}>
                Questions? Let&rsquo;s talk.
              </h2>
              <p className="mt-4 max-w-md text-zinc-400">
                Curious about a custom plan, a demo of every feature, or how HireLane fits your team?
                Send a note and we&rsquo;ll get back to you.
              </p>
              <ul className="mt-8 space-y-3 text-sm text-zinc-300">
                <li className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">✦</span>
                  Tailored plans for agencies & enterprises
                </li>
                <li className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">◎</span>
                  A guided walkthrough of the full AI stack
                </li>
                <li className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">◈</span>
                  Answers on security, roles & integrations
                </li>
              </ul>
            </div>
            <ContactForm />
          </div>
        </section>
      </main>

      <footer className="relative overflow-hidden border-t border-white/10">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-0"
          style={{ background: "radial-gradient(56rem 22rem at 50% 135%, oklch(0.5 0.22 27 / 0.28), transparent 64%)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-70"
          style={{ background: "linear-gradient(90deg, transparent, oklch(0.62 0.24 27 / 0.5), transparent)" }}
        />
        <Spotlight className="relative" size="32rem" color="oklch(0.55 0.24 27 / 0.1)">
          <div className="mx-auto max-w-7xl 2xl:max-w-[88rem] px-6 py-14">
            <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
              <div>
                <BrandMark onDark />
                <p className="mt-3 max-w-xs text-sm text-zinc-500">
                  AI-assisted applicant tracking — from job post to hire.
                </p>
              </div>
              <nav className="flex flex-wrap gap-x-10 gap-y-3 text-sm text-zinc-400">
                <a href="#features" className="transition-colors hover:text-white">Features</a>
                <a href="#flow" className="transition-colors hover:text-white">Pipeline</a>
                <a href="#pricing" className="transition-colors hover:text-white">Pricing</a>
                <Link href="/login" className="transition-colors hover:text-white">Sign in</Link>
                <Link href="/signup" className="transition-colors hover:text-white">Get started</Link>
              </nav>
            </div>
            <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6">
              <p className="text-xs text-zinc-600">
                © {new Date().getFullYear()} HireLane · AI-assisted applicant tracking
              </p>
              <p className="text-xs text-zinc-600">Built for modern hiring teams</p>
            </div>
          </div>
        </Spotlight>
      </footer>
    </div>
  );
}
