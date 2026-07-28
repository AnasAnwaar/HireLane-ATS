"use client";

import { Loader2, Lock, Trash2, Users2, Crown } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import type { NoteVisibility } from "@/types/database";
import type { CandidateNoteView } from "@/server/candidates/queries";
import { addNoteAction, deleteNoteAction } from "@/server/candidates/note-actions";

const VIS_META: Record<
  NoteVisibility,
  { label: string; icon: React.ComponentType<{ className?: string }>; hint: string }
> = {
  private: { label: "Private", icon: Lock, hint: "Only you (and admins)" },
  team: { label: "Team", icon: Users2, hint: "The hiring team" },
  management: { label: "Management", icon: Crown, hint: "Leads & management" },
};

export function NotesSection({
  candidateId,
  notes,
  canAdd,
}: {
  candidateId: string;
  notes: CandidateNoteView[];
  canAdd: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = React.useState("");
  const [visibility, setVisibility] = React.useState<NoteVisibility>("team");
  const [pending, setPending] = React.useState(false);

  async function submit() {
    if (!body.trim()) return;
    setPending(true);
    const fd = new FormData();
    fd.set("body", body);
    fd.set("visibility", visibility);
    const result = await addNoteAction(candidateId, null, fd);
    setPending(false);
    if (result.ok) {
      setBody("");
      toast.success("Note added.");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function remove(noteId: string) {
    const result = await deleteNoteAction(noteId, candidateId);
    if (result.ok) {
      toast.success("Note removed.");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {canAdd && (
          <div className="space-y-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder="Add a note — what stood out, next steps, concerns…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                {(Object.keys(VIS_META) as NoteVisibility[]).map((v) => {
                  const M = VIS_META[v];
                  const active = visibility === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setVisibility(v)}
                      title={M.hint}
                      className={
                        active
                          ? "inline-flex items-center gap-1 rounded-md border border-primary bg-primary-soft px-2 py-1 text-xs font-medium text-primary"
                          : "inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
                      }
                    >
                      <M.icon className="size-3" />
                      {M.label}
                    </button>
                  );
                })}
              </div>
              <Button size="sm" onClick={submit} disabled={pending || !body.trim()}>
                {pending && <Loader2 className="animate-spin" />}
                Add note
              </Button>
            </div>
          </div>
        )}

        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        ) : (
          <ul className="space-y-3">
            {notes.map((n) => {
              const M = VIS_META[n.visibility];
              return (
                <li key={n.id} className="flex gap-3">
                  <Avatar name={n.authorName} size="sm" />
                  <div className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{n.authorName}</span>
                      <Badge variant="outline" className="text-[0.625rem]">
                        <M.icon className="size-2.5" /> {M.label}
                      </Badge>
                      <span>{formatDate(n.createdAt)}</span>
                      {n.isOwn && (
                        <button
                          onClick={() => remove(n.id)}
                          className="ml-auto text-muted-foreground transition-colors hover:text-destructive"
                          aria-label="Delete note"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{n.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
