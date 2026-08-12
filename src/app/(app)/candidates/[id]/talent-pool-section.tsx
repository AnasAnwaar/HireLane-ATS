"use client";

import { Bookmark, BookmarkCheck, Loader2, Plus, Tag, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  addToOpeningAction,
  toggleTalentPoolAction,
  updateCandidateTagsAction,
} from "@/server/candidates/talent-actions";

const selectClass =
  "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function TalentPoolSection({
  candidateId,
  inPool,
  tags: initialTags,
  openings,
  canPool,
  canEditTags,
  canAdd,
}: {
  candidateId: string;
  inPool: boolean;
  tags: string[];
  openings: { id: string; title: string }[];
  canPool: boolean;
  canEditTags: boolean;
  canAdd: boolean;
}) {
  const router = useRouter();
  const [tags, setTags] = React.useState<string[]>(initialTags);
  const [tagInput, setTagInput] = React.useState("");
  const [openingId, setOpeningId] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);

  async function togglePool() {
    setBusy("pool");
    const r = await toggleTalentPoolAction(candidateId, !inPool);
    setBusy(null);
    if (r.ok) {
      toast.success(r.message ?? "Saved.");
      router.refresh();
    } else toast.error(r.error);
  }

  async function saveTags(next: string[]) {
    setTags(next);
    const r = await updateCandidateTagsAction(candidateId, next);
    if (!r.ok) {
      toast.error(r.error);
      router.refresh();
    }
  }

  function addTag() {
    const t = tagInput.trim();
    if (!t || tags.includes(t)) return;
    setTagInput("");
    void saveTags([...tags, t]);
  }

  async function addToOpening() {
    if (!openingId) return;
    setBusy("add");
    const r = await addToOpeningAction(candidateId, openingId);
    setBusy(null);
    if (r.ok) {
      toast.success(r.message ?? "Added.");
      setOpeningId("");
      router.refresh();
    } else toast.error(r.error);
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Talent pool</CardTitle>
        {canPool && (
          <Button variant={inPool ? "default" : "outline"} size="sm" onClick={togglePool} disabled={busy !== null}>
            {busy === "pool" ? (
              <Loader2 className="animate-spin" />
            ) : inPool ? (
              <BookmarkCheck />
            ) : (
              <Bookmark />
            )}
            {inPool ? "In talent pool" : "Add to pool"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Tags */}
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Tag className="size-3" /> Tags
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {tags.length === 0 && !canEditTags && <span className="text-sm text-muted-foreground">No tags.</span>}
            {tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs">
                {t}
                {canEditTags && (
                  <button
                    onClick={() => saveTags(tags.filter((x) => x !== t))}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`Remove ${t}`}
                  >
                    <X className="size-3" />
                  </button>
                )}
              </span>
            ))}
            {canEditTags && (
              <span className="inline-flex items-center gap-1">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                  placeholder="Add tag…"
                  className={cn("h-7 w-28 text-xs")}
                />
              </span>
            )}
          </div>
        </div>

        {/* Cross-opening reuse */}
        {canAdd && openings.length > 0 && (
          <div className="border-t border-border pt-4">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Consider for another opening</p>
            <div className="flex flex-wrap items-center gap-2">
              <select value={openingId} onChange={(e) => setOpeningId(e.target.value)} className={cn(selectClass, "min-w-0 flex-1")}>
                <option value="">Select an opening…</option>
                {openings.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title}
                  </option>
                ))}
              </select>
              <Button size="sm" onClick={addToOpening} disabled={busy !== null || !openingId}>
                {busy === "add" ? <Loader2 className="animate-spin" /> : <Plus />}
                Add
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
