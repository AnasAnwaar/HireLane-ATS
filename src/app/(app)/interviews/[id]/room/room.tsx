"use client";

import { ArrowLeft, Code2, ExternalLink, MessageSquare, Save, Send, Users, Video } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { saveSharedNotesAction } from "@/server/interviews/actions";

type ChatMessage = { from: string; name: string; text: string; at: number };

/**
 * In-app interview room (CP-22). The live A/V happens in the external tool via
 * the video link; this adds real-time collaboration over Supabase Realtime —
 * presence, a shared code pad and chat — plus persisted shared notes. No media
 * server or TURN needed.
 */
export function InterviewRoom({
  interviewId,
  title,
  candidateName,
  videoLink,
  initialNotes,
  me,
}: {
  interviewId: string;
  title: string;
  candidateName: string;
  videoLink: string | null;
  initialNotes: string;
  me: string;
}) {
  const meId = React.useRef<string | null>(null);
  if (meId.current == null) meId.current = crypto.randomUUID();
  const channelRef = React.useRef<RealtimeChannel | null>(null);

  const [participants, setParticipants] = React.useState<string[]>([me]);
  const [code, setCode] = React.useState("");
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [draft, setDraft] = React.useState("");
  const [notes, setNotes] = React.useState(initialNotes);
  const [savingNotes, setSavingNotes] = React.useState(false);
  const chatEndRef = React.useRef<HTMLDivElement>(null);

  // Set up the realtime channel once.
  React.useEffect(() => {
    const supabase = createClient();
    const myId = meId.current!;
    const channel = supabase.channel(`interview-room:${interviewId}`, {
      config: { presence: { key: myId } },
    });
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "codepad" }, ({ payload }) => {
        if (payload.from !== myId) setCode(payload.value as string);
      })
      .on("broadcast", { event: "chat" }, ({ payload }) => {
        if (payload.from !== myId) setMessages((m) => [...m, payload as ChatMessage]);
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ name: string }>();
        const names = Object.values(state)
          .flat()
          .map((p) => p.name);
        setParticipants(names.length ? names : [me]);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") channel.track({ name: me });
      });

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [interviewId, me]);

  React.useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function onCodeChange(value: string) {
    setCode(value);
    channelRef.current?.send({
      type: "broadcast",
      event: "codepad",
      payload: { value, from: meId.current! },
    });
  }

  function sendChat() {
    const text = draft.trim();
    if (!text) return;
    const msg: ChatMessage = { from: meId.current!, name: me, text, at: Date.now() };
    setMessages((m) => [...m, msg]);
    channelRef.current?.send({ type: "broadcast", event: "chat", payload: msg });
    setDraft("");
  }

  async function saveNotes() {
    setSavingNotes(true);
    const r = await saveSharedNotesAction(interviewId, notes);
    setSavingNotes(false);
    if (r.ok) toast.success("Notes saved.");
    else toast.error(r.error);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
        <Link href={`/interviews/${interviewId}`} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
        </Link>
        <BrandMark />
        <div className="ml-2 min-w-0">
          <p className="truncate text-sm font-semibold">{candidateName}</p>
          <p className="truncate text-xs text-muted-foreground">{title}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
            <Users className="size-3.5" /> {participants.length}
          </span>
          {videoLink && (
            <Button asChild size="sm">
              <a href={videoLink} target="_blank" rel="noopener noreferrer">
                <Video /> Join video
              </a>
            </Button>
          )}
        </div>
      </header>

      <div className="grid flex-1 gap-4 p-4 sm:px-6 lg:grid-cols-[1fr_320px]">
        {/* Left: video placeholder + shared code pad + notes */}
        <div className="space-y-4">
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 py-10 text-center">
            <Video className="size-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Video runs in your call app</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {videoLink ? "Join the call, then collaborate here live." : "No video link was set for this interview."}
              </p>
            </div>
            {videoLink && (
              <Button asChild variant="outline" size="sm">
                <a href={videoLink} target="_blank" rel="noopener noreferrer">
                  <ExternalLink /> Open call
                </a>
              </Button>
            )}
          </div>

          <Panel icon={Code2} title="Shared code pad" hint="Live · everyone in the room sees edits">
            <textarea
              value={code}
              onChange={(e) => onCodeChange(e.target.value)}
              spellCheck={false}
              placeholder="// Live coding — shared with the panel in real time"
              className="h-56 w-full resize-none rounded-lg border border-input bg-[#0b0b0f] p-3 font-mono text-sm text-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </Panel>

          <Panel icon={Save} title="Shared notes" hint="Saved to the interview record">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Notes the panel keeps together…"
              className="w-full rounded-lg border border-input bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="mt-2 flex justify-end">
              <Button variant="outline" size="sm" onClick={saveNotes} disabled={savingNotes}>
                <Save /> {savingNotes ? "Saving…" : "Save notes"}
              </Button>
            </div>
          </Panel>
        </div>

        {/* Right: participants + chat */}
        <div className="flex flex-col gap-4">
          <Panel icon={Users} title={`In the room (${participants.length})`}>
            <div className="flex flex-wrap gap-1.5">
              {participants.map((p, i) => (
                <span key={i} className="rounded-full border border-border px-2.5 py-1 text-xs">
                  {p}
                </span>
              ))}
            </div>
          </Panel>

          <Panel icon={MessageSquare} title="Chat" className="flex flex-1 flex-col">
            <div className="flex-1 space-y-2 overflow-y-auto" style={{ maxHeight: "40vh" }}>
              {messages.length === 0 ? (
                <p className="text-xs text-muted-foreground">No messages yet.</p>
              ) : (
                messages.map((m, i) => (
                  <div key={i} className="text-sm">
                    <span className="font-medium">{m.name}</span>{" "}
                    <span className="text-muted-foreground">{m.text}</span>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="mt-2 flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendChat()}
                placeholder="Message the panel…"
                className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button size="sm" onClick={sendChat}>
                <Send />
              </Button>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Panel({
  icon: Icon,
  title,
  hint,
  className,
  children,
}: {
  icon: typeof Code2;
  title: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`rounded-xl border border-border bg-card p-4 shadow-card ${className ?? ""}`}>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <p className="text-sm font-semibold">{title}</p>
        {hint && <span className="ml-auto text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </section>
  );
}
