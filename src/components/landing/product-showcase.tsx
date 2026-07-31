import { Check, Flag, Sparkles } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { ScoreRing } from "@/components/ui/score-ring";

/**
 * A high-fidelity product mockup for the landing page — a browser-framed
 * pipeline board built from the real UI primitives (avatars, score rings),
 * with floating glass cards for depth. Purely presentational.
 */

type Card = { name: string; role: string; score: number; flagged?: boolean };

const COLUMNS: { title: string; accent: string; cards: Card[] }[] = [
  {
    title: "Applied",
    accent: "oklch(0.55 0.02 265)",
    cards: [
      { name: "Sara Malik", role: "Frontend Dev", score: 52 },
      { name: "Omar Farooq", role: "React Engineer", score: 61 },
    ],
  },
  {
    title: "Screened",
    accent: "oklch(0.55 0.15 255)",
    cards: [
      { name: "Usman Tariq", role: "Full-stack", score: 67 },
      { name: "Zoya Iqbal", role: "UI Engineer", score: 73 },
    ],
  },
  {
    title: "Shortlisted",
    accent: "oklch(0.62 0.14 70)",
    cards: [
      { name: "Hina Raza", role: "React Developer", score: 81, flagged: true },
    ],
  },
  {
    title: "Interview",
    accent: "oklch(0.55 0.13 160)",
    cards: [
      { name: "Ayesha Khan", role: "Sr. React Eng.", score: 94 },
      { name: "Bilal Ahmed", role: "Frontend Lead", score: 88 },
    ],
  },
];

export function ProductShowcase() {
  return (
    <div className="relative">
      {/* Browser frame */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card-lg ring-1 ring-black/[0.02]">
        <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-2.5">
          <span className="flex gap-1.5">
            <span className="size-3 rounded-full bg-destructive/40" />
            <span className="size-3 rounded-full bg-warning/50" />
            <span className="size-3 rounded-full bg-success/40" />
          </span>
          <span className="mx-auto hidden rounded-md bg-background px-3 py-1 text-xs text-muted-foreground sm:block">
            app.hirelane.com / openings / senior-react / pipeline
          </span>
        </div>

        <div className="p-5">
          {/* Board header */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold tracking-tight">Senior React Developer</p>
              <p className="text-xs text-muted-foreground">348 applicants · Lahore · Hybrid</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary">
              <Sparkles className="size-3" /> AI-ranked
            </span>
          </div>

          {/* Kanban */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {COLUMNS.map((col) => (
              <div key={col.title} className="rounded-xl bg-muted/40 p-2.5">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="flex items-center gap-1.5 text-xs font-semibold">
                    <span className="size-1.5 rounded-full" style={{ background: col.accent }} />
                    {col.title}
                  </span>
                  <span className="text-xs text-muted-foreground">{col.cards.length}</span>
                </div>
                <div className="space-y-2">
                  {col.cards.map((c) => (
                    <div
                      key={c.name}
                      className="flex items-center gap-2.5 rounded-lg border border-border bg-card p-2.5 shadow-xs"
                    >
                      <ScoreRing score={c.score} size={34} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1 truncate text-xs font-medium">
                          {c.name}
                          {c.flagged && <Flag className="size-2.5 shrink-0 text-warning" />}
                        </p>
                        <p className="truncate text-[0.6875rem] text-muted-foreground">{c.role}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Floating accent cards */}
      <div className="glass absolute -left-4 top-16 hidden w-52 rotate-[-4deg] rounded-xl border border-border p-3 shadow-card-md md:block">
        <div className="flex items-center gap-2.5">
          <Avatar name="Ayesha Khan" size="sm" />
          <div className="min-w-0">
            <p className="truncate text-xs font-medium">Ayesha Khan</p>
            <p className="text-[0.625rem] text-muted-foreground">8/8 must-haves matched</p>
          </div>
          <ScoreRing score={94} size={30} />
        </div>
      </div>

      <div className="glass absolute -right-4 bottom-10 hidden w-56 rotate-[3deg] rounded-xl border border-border p-3 shadow-card-md md:block">
        <p className="mb-2 text-xs font-medium">Published to</p>
        <div className="flex flex-wrap gap-1.5">
          {["LinkedIn", "Indeed", "Rozee.pk"].map((p) => (
            <span
              key={p}
              className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[0.625rem] font-medium text-success"
            >
              <Check className="size-2.5" /> {p}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
