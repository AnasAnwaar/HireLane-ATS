"use client";

import { Briefcase, Loader2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { attachLibraryTestToOpeningAction } from "@/server/assessments/library-actions";

/**
 * Copy a library assessment into a job role. Picks the opening, clones the
 * template into a fresh draft test there, and jumps to it for review/publish.
 */
export function UseInRoleButton({
  templateId,
  openings,
}: {
  templateId: string;
  openings: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);

  const filtered = q.trim()
    ? openings.filter((o) => o.title.toLowerCase().includes(q.trim().toLowerCase()))
    : openings;

  async function attach(openingId: string) {
    setBusy(openingId);
    const r = await attachLibraryTestToOpeningAction(templateId, openingId);
    setBusy(null);
    if (r.ok) {
      toast.success("Added to the role as a draft — review and publish.");
      setOpen(false);
      router.push(`/openings/${openingId}/tests/${r.testId}`);
    } else {
      toast.error(r.error);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Use in a role
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add to a job role</DialogTitle>
            <DialogDescription>
              A copy is added to the opening as a draft. Editing it there won&rsquo;t change this
              library assessment.
            </DialogDescription>
          </DialogHeader>

          {openings.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No open roles yet — create a job opening first.
            </p>
          ) : (
            <>
              {openings.length > 6 && (
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search openings…"
                    className="pl-8"
                    autoFocus
                  />
                </div>
              )}
              <div className="max-h-72 space-y-1 overflow-y-auto">
                {filtered.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    disabled={busy !== null}
                    onClick={() => attach(o.id)}
                    className="flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left text-sm transition-colors hover:border-primary/30 hover:bg-accent disabled:opacity-60"
                  >
                    {busy === o.id ? (
                      <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                    ) : (
                      <Briefcase className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate font-medium">{o.title}</span>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="py-4 text-center text-sm text-muted-foreground">No openings match.</p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
