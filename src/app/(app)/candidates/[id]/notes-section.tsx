"use client";

import { AtSign, Crown, Loader2, Lock, Reply, Trash2, Users2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatDate } from "@/lib/utils";
import type { NoteVisibility } from "@/types/database";
import type { CandidateNoteView } from "@/server/candidates/queries";
import { addNoteAction, deleteNoteAction } from "@/server/candidates/note-actions";

export type TeamMember = { id: string; name: string };

const VIS_META: Record<NoteVisibility, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  private: { label: "Private", icon: Lock },
  team: { label: "Team", icon: Users2 },
  management: { label: "Management", icon: Crown },
};

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Render note text with @mentions highlighted. */
function MentionText({ body, names }: { body: string; names: string[] }) {
  if (names.length === 0) return <>{body}</>;
  const re = new RegExp(`@(${names.map(escapeRe).join("|")})`, "g");
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (m.index > last) out.push(body.slice(last, m.index));
    out.push(
      <span key={m.index} className="font-medium text-primary">
        @{m[1]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  out.push(body.slice(last));
  return <>{out}</>;
}

export function NotesSection({
  candidateId,
  notes,
  canAdd,
  canMention,
  teamMembers,
}: {
  candidateId: string;
  notes: CandidateNoteView[];
  canAdd: boolean;
  canMention: boolean;
  teamMembers: TeamMember[];
}) {
  const router = useRouter();
  const [filter, setFilter] = React.useState<NoteVisibility | "all">("all");
  const [replyTo, setReplyTo] = React.useState<string | null>(null);

  const threads = notes.filter((n) => !n.parentId);
  const repliesByParent = React.useMemo(() => {
    const map = new Map<string, CandidateNoteView[]>();
    for (const n of notes) {
      if (n.parentId) map.set(n.parentId, [...(map.get(n.parentId) ?? []), n]);
    }
    for (const list of map.values()) list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return map;
  }, [notes]);

  const shown = filter === "all" ? threads : threads.filter((n) => n.visibility === filter);

  async function remove(noteId: string) {
    const r = await deleteNoteAction(noteId, candidateId);
    if (r.ok) {
      toast.success("Note removed.");
      router.refresh();
    } else toast.error(r.error);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Notes & discussion</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {canAdd && (
          <Composer
            candidateId={candidateId}
            canMention={canMention}
            teamMembers={teamMembers}
            onDone={() => router.refresh()}
          />
        )}

        {threads.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
              <span className="mr-0.5 text-xs text-muted-foreground">Show:</span>
              {(["all", "private", "team", "management"] as const).map((f) => {
                const count = f === "all" ? threads.length : threads.filter((n) => n.visibility === f).length;
                const label = f === "all" ? "All" : VIS_META[f].label;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs",
                      filter === f
                        ? "border-primary bg-primary-soft font-medium text-primary"
                        : "border-border text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {label}
                    <span className="tabular-nums opacity-70">{count}</span>
                  </button>
                );
              })}
            </div>

            <ul className="space-y-4">
              {shown.map((n) => {
                const M = VIS_META[n.visibility];
                const replies = repliesByParent.get(n.id) ?? [];
                return (
                  <li key={n.id}>
                    <NoteRow note={n} onRemove={remove} />
                    {(replies.length > 0 || replyTo === n.id) && (
                      <div className="ml-6 mt-2 space-y-2 border-l border-border pl-4">
                        {replies.map((r) => (
                          <NoteRow key={r.id} note={r} onRemove={remove} compact />
                        ))}
                        {replyTo === n.id && (
                          <Composer
                            candidateId={candidateId}
                            parentId={n.id}
                            canMention={canMention}
                            teamMembers={teamMembers}
                            placeholder="Write a reply…"
                            onDone={() => {
                              setReplyTo(null);
                              router.refresh();
                            }}
                          />
                        )}
                      </div>
                    )}
                    {canAdd && replyTo !== n.id && (
                      <button
                        type="button"
                        onClick={() => setReplyTo(n.id)}
                        className="ml-6 mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Reply className="size-3" /> Reply
                        {replies.length > 0 && <span className="opacity-70">· {replies.length}</span>}
                      </button>
                    )}
                    <span className="sr-only">{M.label}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function NoteRow({
  note,
  onRemove,
  compact,
}: {
  note: CandidateNoteView;
  onRemove: (id: string) => void;
  compact?: boolean;
}) {
  const M = VIS_META[note.visibility];
  return (
    <div className="flex gap-3">
      <Avatar name={note.authorName} size="sm" />
      <div className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{note.authorName}</span>
          {!compact && (
            <Badge variant="outline" className="text-[0.625rem]">
              <M.icon className="size-2.5" /> {M.label}
            </Badge>
          )}
          <span>{formatDate(note.createdAt)}</span>
          {note.isOwn && (
            <button
              onClick={() => onRemove(note.id)}
              className="ml-auto text-muted-foreground transition-colors hover:text-destructive"
              aria-label="Delete note"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
        <p className="mt-1 whitespace-pre-wrap text-sm">
          <MentionText body={note.body} names={note.mentions.map((m) => m.name)} />
        </p>
      </div>
    </div>
  );
}

function Composer({
  candidateId,
  parentId,
  canMention,
  teamMembers,
  placeholder = "Add a note — what stood out, next steps, concerns…",
  onDone,
}: {
  candidateId: string;
  parentId?: string;
  canMention: boolean;
  teamMembers: TeamMember[];
  placeholder?: string;
  onDone: () => void;
}) {
  const [body, setBody] = React.useState("");
  const [visibility, setVisibility] = React.useState<NoteVisibility>("team");
  const [mentions, setMentions] = React.useState<TeamMember[]>([]);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  function addMention(m: TeamMember) {
    setBody((b) => `${b}${b && !b.endsWith(" ") ? " " : ""}@${m.name} `);
    setMentions((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    setPickerOpen(false);
  }

  async function submit() {
    if (!body.trim()) return;
    setPending(true);
    const fd = new FormData();
    fd.set("body", body);
    fd.set("visibility", visibility);
    if (parentId) fd.set("parentId", parentId);
    // Keep only mentions still present in the text.
    const active = mentions.filter((m) => body.includes(`@${m.name}`));
    fd.set("mentions", JSON.stringify(active.map((m) => ({ membership_id: m.id, name: m.name }))));
    const r = await addNoteAction(candidateId, null, fd);
    setPending(false);
    if (r.ok) {
      setBody("");
      setMentions([]);
      toast.success(r.message ?? "Added.");
      onDone();
    } else toast.error(r.error);
  }

  return (
    <div className="space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={parentId ? 2 : 3}
        placeholder={placeholder}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {!parentId &&
            (Object.keys(VIS_META) as NoteVisibility[]).map((v) => {
              const M = VIS_META[v];
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVisibility(v)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs",
                    visibility === v
                      ? "border-primary bg-primary-soft font-medium text-primary"
                      : "border-border text-muted-foreground hover:bg-accent",
                  )}
                >
                  <M.icon className="size-3" /> {M.label}
                </button>
              );
            })}
          {canMention && teamMembers.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setPickerOpen((o) => !o)}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
              >
                <AtSign className="size-3" /> Mention
              </button>
              {pickerOpen && (
                <div className="absolute bottom-full z-20 mb-1 max-h-52 w-52 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
                  {teamMembers.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => addMention(m)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <Avatar name={m.name} size="sm" /> {m.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <Button size="sm" onClick={submit} disabled={pending || !body.trim()}>
          {pending && <Loader2 className="animate-spin" />}
          {parentId ? "Reply" : "Add note"}
        </Button>
      </div>
    </div>
  );
}
