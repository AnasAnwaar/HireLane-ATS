import { Check } from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";

const POINTS = [
  "Publish one requisition to every job board",
  "Applicants ranked with cited evidence, not guesswork",
  "Proctored assessments with a defensible audit trail",
  "Every permission configured by you, not us",
];

/**
 * Split layout for all unauthenticated auth screens: form on the left, brand
 * panel on the right (hidden below lg, where it would only cost scroll).
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <div className="flex w-full flex-col lg:w-[52%]">
        <header className="flex h-16 items-center px-6 sm:px-10">
          <Link href="/" aria-label="Hirelane home">
            <BrandMark />
          </Link>
        </header>

        <main className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-[26rem]">{children}</div>
        </main>

        <footer className="px-6 py-6 text-xs text-muted-foreground sm:px-10">
          © {new Date().getFullYear()} Hirelane
        </footer>
      </div>

      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden bg-sidebar lg:flex lg:w-[48%]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-dot-grid text-sidebar-foreground/[0.09]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 top-1/4 size-[28rem] rounded-full bg-primary/25 blur-3xl"
        />

        <div className="relative flex flex-col justify-center px-14 xl:px-20">
          <div aria-hidden className="brand-rule mb-10 h-1 w-24 rounded-full" />

          <h2 className="max-w-md text-balance text-3xl font-semibold leading-tight text-sidebar-foreground xl:text-4xl">
            From &ldquo;we need a person&rdquo; to &ldquo;we hired the right person&rdquo;
          </h2>

          <ul className="mt-10 space-y-4">
            {POINTS.map((point) => (
              <li key={point} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary">
                  <Check className="size-3 text-primary-foreground" />
                </span>
                <span className="text-sm text-sidebar-foreground/85">{point}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
