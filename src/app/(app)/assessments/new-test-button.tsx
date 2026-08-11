"use client";

import { Briefcase, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/**
 * Hub-level entry point for authoring a test. A test belongs to a job opening
 * (its questions draft from that opening's requirements), so this picks the
 * opening and hands off to its Tests page where the manual / AI create dialogs
 * live.
 */
export function NewTestButton({ openings }: { openings: { id: string; title: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");

  const filtered = q.trim()
    ? openings.filter((o) => o.title.toLowerCase().includes(q.trim().toLowerCase()))
    : openings;

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus /> New test
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New test</DialogTitle>
            <DialogDescription>
              Choose the opening this test is for — you can author it by hand or generate it with AI
              on the next screen.
            </DialogDescription>
          </DialogHeader>

          {openings.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Create a job opening first — tests are built from an opening&rsquo;s requirements.
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
                    onClick={() => {
                      setOpen(false);
                      router.push(`/openings/${o.id}/tests`);
                    }}
                    className="flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left text-sm transition-colors hover:border-primary/30 hover:bg-accent"
                  >
                    <Briefcase className="size-4 shrink-0 text-muted-foreground" />
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
