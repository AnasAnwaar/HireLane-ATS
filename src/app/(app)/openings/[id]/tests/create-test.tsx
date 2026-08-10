"use client";

import { Loader2, Plus, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { QUESTION_TYPE_META, QUESTION_TYPES } from "@/lib/assessments-display";
import { cn } from "@/lib/utils";
import type { QuestionDifficulty, QuestionType } from "@/types/database";
import { createAiTestAction, createManualTestAction } from "@/server/assessments/actions";

export function CreateTest({
  openingId,
  skills,
  canManual,
  canAi,
}: {
  openingId: string;
  skills: string[];
  canManual: boolean;
  canAi: boolean;
}) {
  const [mode, setMode] = React.useState<null | "manual" | "ai">(null);

  return (
    <div className="flex items-center gap-2">
      {canManual && (
        <Button variant="outline" size="sm" onClick={() => setMode("manual")}>
          <Plus /> New test
        </Button>
      )}
      {canAi && (
        <Button size="sm" onClick={() => setMode("ai")}>
          <Sparkles /> Generate with AI
        </Button>
      )}
      <ManualDialog open={mode === "manual"} openingId={openingId} onClose={() => setMode(null)} />
      <AiDialog open={mode === "ai"} openingId={openingId} skills={skills} onClose={() => setMode(null)} />
    </div>
  );
}

function ManualDialog({
  open,
  openingId,
  onClose,
}: {
  open: boolean;
  openingId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function create() {
    setBusy(true);
    const result = await createManualTestAction(openingId, title);
    setBusy(false);
    if (result.ok) {
      toast.success("Test created.");
      onClose();
      router.push(`/openings/${openingId}/tests/${result.testId}`);
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New test</DialogTitle>
          <DialogDescription>Start an empty test and add questions by hand.</DialogDescription>
        </DialogHeader>
        <Field id="title" label="Test title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Frontend screening" autoFocus />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={create} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Plus />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const DEFAULT_TYPES: QuestionType[] = ["single_choice", "true_false", "short_answer"];

function AiDialog({
  open,
  openingId,
  skills,
  onClose,
}: {
  open: boolean;
  openingId: string;
  skills: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = React.useState("");
  const [count, setCount] = React.useState(10);
  const [difficulty, setDifficulty] = React.useState<QuestionDifficulty | "mixed">("mixed");
  const [types, setTypes] = React.useState<QuestionType[]>(DEFAULT_TYPES);
  const [duration, setDuration] = React.useState(30);
  const [busy, setBusy] = React.useState(false);

  function toggleType(t: QuestionType) {
    setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  async function generate() {
    if (types.length === 0) {
      toast.error("Pick at least one question type.");
      return;
    }
    setBusy(true);
    const result = await createAiTestAction(openingId, {
      title,
      count,
      types,
      difficulty,
      skills,
      durationMinutes: duration || undefined,
    });
    setBusy(false);
    if (result.ok) {
      toast.success("Draft test generated — review before publishing.");
      onClose();
      router.push(`/openings/${openingId}/tests/${result.testId}`);
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate a test with AI</DialogTitle>
          <DialogDescription>
            The AI drafts questions from this opening&rsquo;s requirements. Nothing goes live until
            you review and publish.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field id="title" label="Test title (optional)">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Auto-named if blank" />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field id="count" label="Questions">
              <Input
                type="number"
                min={1}
                max={30}
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
              />
            </Field>
            <Field id="duration" label="Duration (min)">
              <Input
                type="number"
                min={0}
                max={240}
                value={duration}
                onChange={(e) => setDuration(Math.max(0, Number(e.target.value) || 0))}
              />
            </Field>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Difficulty</label>
            <div className="flex flex-wrap gap-1.5">
              {(["mixed", "easy", "medium", "hard"] as const).map((d) => (
                <Chip key={d} active={difficulty === d} onClick={() => setDifficulty(d)}>
                  {d[0].toUpperCase() + d.slice(1)}
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Question types</label>
            <div className="flex flex-wrap gap-1.5">
              {QUESTION_TYPES.map((t) => (
                <Chip key={t} active={types.includes(t)} onClick={() => toggleType(t)}>
                  {QUESTION_TYPE_META[t].label}
                </Chip>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={generate} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {busy ? "Generating…" : "Generate draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary-soft text-primary"
          : "border-border text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}
