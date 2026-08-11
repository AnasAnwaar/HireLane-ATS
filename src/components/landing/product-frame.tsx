import { Check, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Dark, stylised mockups of the real portal screens (AI screening list + match
 * report) for the landing page. Built in the LP's dark theme so they read as
 * cohesive product shots — the Linear approach — rather than clashing light
 * screenshots.
 */

export function AppWindow({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "hairline overflow-hidden rounded-xl border border-white/10 bg-[#0c0b0e]/95 shadow-2xl",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.03] px-4 py-2.5">
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
        </span>
        <span className="ml-2 truncate text-xs text-zinc-400">{title}</span>
      </div>
      <div className="p-3.5 sm:p-4">{children}</div>
    </div>
  );
}

const BAND: Record<string, { chip: string; label: string; ring: string }> = {
  strong: { chip: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/25", label: "Strong fit", ring: "#34d399" },
  possible: { chip: "bg-amber-500/15 text-amber-300 ring-amber-500/25", label: "Possible", ring: "#fbbf24" },
  weak: { chip: "bg-zinc-500/15 text-zinc-400 ring-zinc-500/25", label: "Weak fit", ring: "#a1a1aa" },
};

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("");
}

function Ring({ score, band }: { score: number; band: string }) {
  const c = 2 * Math.PI * 15;
  const off = c * (1 - score / 100);
  return (
    <span className="relative inline-flex size-9 shrink-0 items-center justify-center">
      <svg width="36" height="36" className="-rotate-90">
        <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3" className="stroke-white/10" />
        <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3" strokeLinecap="round" stroke={BAND[band].ring} strokeDasharray={c} strokeDashoffset={off} />
      </svg>
      <span className="absolute text-[0.6875rem] font-semibold tabular-nums" style={{ color: BAND[band].ring }}>
        {score}
      </span>
    </span>
  );
}

const CANDIDATES = [
  { name: "Ayesha Khan", role: "Senior React Engineer", score: 92, band: "strong", stage: "Interview" },
  { name: "Usman Tariq", role: "Full-stack Engineer", score: 86, band: "strong", stage: "Screened" },
  { name: "Bilal Ahmed", role: "Frontend Developer", score: 74, band: "possible", stage: "Test sent" },
  { name: "Hina Raza", role: "React Developer", score: 62, band: "possible", stage: "Shortlisted" },
  { name: "Sara Malik", role: "Junior Frontend Dev", score: 35, band: "weak", stage: "Applied" },
];

export function ScreeningScreen() {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-white">Applicants</p>
          <p className="text-[0.6875rem] text-zinc-500">Senior React Developer · 5 people</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-2 py-1 text-[0.625rem] font-medium text-primary ring-1 ring-primary/25">
          <Sparkles className="size-3" /> Re-rank all
        </span>
      </div>
      <div className="space-y-1.5">
        {CANDIDATES.map((c) => (
          <div key={c.name} className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-zinc-700 to-zinc-800 text-[0.625rem] font-semibold text-zinc-200 ring-1 ring-white/10">
              {initials(c.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-zinc-100">{c.name}</p>
              <p className="truncate text-[0.625rem] text-zinc-500">{c.role}</p>
            </div>
            <span className={cn("hidden rounded-full px-2 py-0.5 text-[0.5625rem] font-medium ring-1 sm:inline", BAND[c.band].chip)}>
              {BAND[c.band].label}
            </span>
            <span className="hidden w-16 text-right text-[0.625rem] text-zinc-500 md:inline">{c.stage}</span>
            <Ring score={c.score} band={c.band} />
          </div>
        ))}
      </div>
    </div>
  );
}

const MUST = [
  { t: "React", ev: "Skill + 'Senior React Engineer'" },
  { t: "TypeScript", ev: "Design systems in TS" },
  { t: "5+ years frontend", ev: "6 years experience" },
  { t: "State management", ev: "Redux · state-heavy dashboards" },
];
const CRITERIA = [
  { k: "Skills", v: 90 },
  { k: "Experience", v: 95 },
  { k: "Qualification", v: 85 },
];

export function MatchReportScreen() {
  return (
    <div>
      <div className="mb-3.5 flex items-center gap-3">
        <Ring score={92} band="strong" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">Ayesha Khan</p>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[0.5625rem] font-medium text-emerald-300 ring-1 ring-emerald-500/25">
            Strong fit
          </span>
        </div>
        <span className="ml-auto text-[0.625rem] text-zinc-600">Match report</span>
      </div>

      <div className="mb-3.5 space-y-2">
        {CRITERIA.map((c) => (
          <div key={c.k}>
            <div className="flex justify-between text-[0.625rem]">
              <span className="text-zinc-400">{c.k}</span>
              <span className="tabular-nums text-zinc-500">{c.v}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
              <div className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary" style={{ width: `${c.v}%` }} />
            </div>
          </div>
        ))}
      </div>

      <p className="mb-2 text-[0.5625rem] font-semibold uppercase tracking-wide text-zinc-500">Must-have coverage</p>
      <div className="space-y-1.5">
        {MUST.map((m) => (
          <div key={m.t} className="flex items-start gap-2">
            <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
              <Check className="size-2.5" />
            </span>
            <p className="text-[0.6875rem] leading-tight">
              <span className="font-medium text-zinc-200">{m.t}</span>{" "}
              <span className="text-zinc-500">— {m.ev}</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
