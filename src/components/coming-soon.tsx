import { Sparkles, type LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";

/**
 * Placeholder for a navigation destination whose checkpoint hasn't shipped yet.
 * Keeps the sidebar link from 404-ing and previews what's coming, so the app
 * reads as "in progress" rather than broken.
 */
export function ComingSoon({
  icon: Icon,
  title,
  tagline,
  milestone,
  capabilities,
}: {
  icon: LucideIcon;
  title: string;
  tagline: string;
  milestone: string;
  capabilities: string[];
}) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-6 py-16 text-center">
      <span className="relative flex size-14 items-center justify-center rounded-2xl border border-border bg-card shadow-card">
        <Icon className="size-7 text-primary" />
        <span className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full border border-border bg-background">
          <Sparkles className="size-3 text-primary" />
        </span>
      </span>

      <Badge variant="secondary" className="mt-5">
        Coming soon · {milestone}
      </Badge>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{tagline}</p>

      <ul className="mt-6 w-full space-y-2 text-left">
        {capabilities.map((c) => (
          <li
            key={c}
            className="flex items-start gap-2.5 rounded-lg border border-border bg-card p-3 text-sm shadow-card"
          >
            <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
            <span>{c}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
