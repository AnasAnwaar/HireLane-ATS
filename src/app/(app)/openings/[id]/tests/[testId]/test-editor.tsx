"use client";

import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Loader2,
  MoreVertical,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  Settings2,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import {
  DIFFICULTY_META,
  PROCTORING_META,
  QUESTION_TYPE_META,
  QUESTION_TYPES,
  TEST_STATUS_META,
  isChoice,
} from "@/lib/assessments-display";
import { cn } from "@/lib/utils";
import type {
  ProctoringLevel,
  QuestionDifficulty,
  QuestionOption,
  QuestionType,
  Test,
  TestQuestion,
} from "@/types/database";
import {
  addQuestionAction,
  archiveTestAction,
  deleteQuestionAction,
  publishTestAction,
  regenerateQuestionAction,
  reorderQuestionsAction,
  saveQuestionToBankAction,
  updateQuestionAction,
  updateTestSettingsAction,
} from "@/server/assessments/actions";

export function TestEditor({
  test,
  questions,
  canAuthor,
  canPublish,
  canAi,
  canManageBank,
}: {
  test: Test;
  questions: TestQuestion[];
  canAuthor: boolean;
  canPublish: boolean;
  canAi: boolean;
  canManageBank: boolean;
}) {
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const meta = TEST_STATUS_META[test.status];
  const totalMarks = questions.reduce((s, q) => s + q.marks, 0);

  async function addQuestion(type: QuestionType) {
    setBusy("add");
    const r = await addQuestionAction(test.id, type);
    setBusy(null);
    if (r.ok) router.refresh();
    else toast.error(r.error);
  }

  async function publish() {
    setBusy("publish");
    const r = await publishTestAction(test.id);
    setBusy(null);
    if (r.ok) {
      toast.success(r.message ?? "Published.");
      router.refresh();
    } else {
      toast.error(r.error);
    }
  }

  async function archive() {
    setBusy("archive");
    const r = await archiveTestAction(test.id);
    setBusy(null);
    if (r.ok) {
      toast.success("Archived.");
      router.refresh();
    } else toast.error(r.error);
  }

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 shadow-card">
        <Badge variant={meta.variant} dot>
          {meta.label}
        </Badge>
        {test.version > 0 && <span className="text-xs text-muted-foreground">v{test.version}</span>}
        {test.has_unpublished_changes && (
          <Badge variant="warning">Unpublished changes</Badge>
        )}
        <span className="text-xs text-muted-foreground">
          {questions.length} {questions.length === 1 ? "question" : "questions"} · {totalMarks} marks
        </span>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
            <Settings2 /> Settings
          </Button>
          {canAuthor && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={busy === "add"}>
                  {busy === "add" ? <Loader2 className="animate-spin" /> : <Plus />}
                  Add question <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {QUESTION_TYPES.map((t) => (
                  <DropdownMenuItem key={t} onClick={() => addQuestion(t)}>
                    {QUESTION_TYPE_META[t].label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {canPublish && test.status !== "archived" && (
            <Button size="sm" onClick={publish} disabled={busy === "publish"}>
              {busy === "publish" ? <Loader2 className="animate-spin" /> : <Rocket />}
              {test.status === "published" ? "Re-publish" : "Publish"}
            </Button>
          )}
        </div>
      </div>

      {test.instructions && (
        <p className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          {test.instructions}
        </p>
      )}

      {/* Questions */}
      {questions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          No questions yet. Use <strong>Add question</strong> to start.
        </div>
      ) : (
        questions.map((q, i) => (
          <QuestionCard
            key={q.id}
            question={q}
            index={i}
            total={questions.length}
            testId={test.id}
            orderedIds={questions.map((x) => x.id)}
            canAuthor={canAuthor}
            canAi={canAi}
            canManageBank={canManageBank}
          />
        ))
      )}

      <SettingsDialog
        open={settingsOpen}
        test={test}
        canAuthor={canAuthor}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => {
          setSettingsOpen(false);
          router.refresh();
        }}
      />

      {canPublish && test.status !== "archived" && questions.length > 0 && (
        <div className="flex justify-end pt-2">
          <Button variant="ghost" size="sm" onClick={archive} disabled={busy === "archive"}>
            {busy === "archive" ? <Loader2 className="animate-spin" /> : null}
            Archive test
          </Button>
        </div>
      )}
    </div>
  );
}

function QuestionCard({
  question,
  index,
  total,
  testId,
  orderedIds,
  canAuthor,
  canAi,
  canManageBank,
}: {
  question: TestQuestion;
  index: number;
  total: number;
  testId: string;
  orderedIds: string[];
  canAuthor: boolean;
  canAi: boolean;
  canManageBank: boolean;
}) {
  const router = useRouter();
  const typeMeta = QUESTION_TYPE_META[question.type];
  const [prompt, setPrompt] = React.useState(question.prompt);
  const [options, setOptions] = React.useState<QuestionOption[]>(question.options ?? []);
  const [correct, setCorrect] = React.useState<string[]>(question.correct_answers ?? []);
  const [rubric, setRubric] = React.useState(question.rubric ?? "");
  const [marks, setMarks] = React.useState(question.marks);
  const [skill, setSkill] = React.useState(question.skill ?? "");
  const [difficulty, setDifficulty] = React.useState<QuestionDifficulty>(question.difficulty);
  const [busy, setBusy] = React.useState<string | null>(null);

  const dirty =
    prompt !== question.prompt ||
    rubric !== (question.rubric ?? "") ||
    marks !== question.marks ||
    skill !== (question.skill ?? "") ||
    difficulty !== question.difficulty ||
    JSON.stringify(options) !== JSON.stringify(question.options ?? []) ||
    JSON.stringify(correct) !== JSON.stringify(question.correct_answers ?? []);

  const editable = canAuthor;
  const fixedOptions = question.type === "true_false";

  function toggleCorrect(id: string) {
    if (typeMeta.multi) {
      setCorrect((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    } else {
      setCorrect([id]);
    }
  }
  function setOptionText(id: string, text: string) {
    setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, text } : o)));
  }
  function addOption() {
    setOptions((prev) => [...prev, { id: crypto.randomUUID(), text: "" }]);
  }
  function removeOption(id: string) {
    setOptions((prev) => prev.filter((o) => o.id !== id));
    setCorrect((prev) => prev.filter((x) => x !== id));
  }

  async function run(label: string, fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    setBusy(label);
    const r = await fn();
    setBusy(null);
    if (r.ok) {
      if (r.message) toast.success(r.message);
      router.refresh();
    } else {
      toast.error(r.error ?? "Something went wrong.");
    }
  }

  async function save() {
    await run("save", () =>
      updateQuestionAction(question.id, {
        prompt,
        options: isChoice(question.type) ? options : [],
        correct_answers: isChoice(question.type) ? correct : [],
        rubric: isChoice(question.type) ? null : rubric,
        marks,
        skill: skill || null,
        difficulty,
      }),
    );
  }
  const move = (dir: -1 | 1) => {
    const ids = [...orderedIds];
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    run("move", () => reorderQuestionsAction(testId, ids));
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-md bg-muted text-xs font-semibold tabular-nums">
          {index + 1}
        </span>
        <Badge variant="outline">{typeMeta.label}</Badge>
        <Badge variant={typeMeta.scoring === "auto" ? "secondary" : "warning"} className="text-[0.625rem]">
          {typeMeta.scoring === "auto" ? "Auto-scored" : "AI-graded"}
        </Badge>

        <div className="ml-auto flex items-center gap-1">
          {editable && (
            <>
              <Button variant="ghost" size="icon" className="size-7" onClick={() => move(-1)} disabled={index === 0 || busy !== null} aria-label="Move up">
                <ArrowUp className="size-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="size-7" onClick={() => move(1)} disabled={index === total - 1 || busy !== null} aria-label="Move down">
                <ArrowDown className="size-3.5" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-7" aria-label="More">
                    <MoreVertical className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canAi && (
                    <DropdownMenuItem onClick={() => run("regen", () => regenerateQuestionAction(question.id))}>
                      <RefreshCw /> Regenerate
                    </DropdownMenuItem>
                  )}
                  {canManageBank && (
                    <DropdownMenuItem onClick={() => run("bank", () => saveQuestionToBankAction(question.id))}>
                      <Save /> Save to bank
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => run("del", () => deleteQuestionAction(question.id))}
                  >
                    <Trash2 /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        readOnly={!editable}
        rows={2}
        placeholder="Question prompt…"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      {/* Options (choice types) */}
      {isChoice(question.type) && (
        <div className="mt-3 space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            Options {typeMeta.multi ? "(tick all correct)" : "(tick the correct one)"}
          </p>
          {options.map((o) => {
            const isCorrect = correct.includes(o.id);
            return (
              <div key={o.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => editable && toggleCorrect(o.id)}
                  aria-label="Mark correct"
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center border",
                    typeMeta.multi ? "rounded" : "rounded-full",
                    isCorrect
                      ? "border-success bg-success text-white"
                      : "border-input bg-background text-transparent",
                  )}
                >
                  <Check className="size-3.5" />
                </button>
                <Input
                  value={o.text}
                  onChange={(e) => setOptionText(o.id, e.target.value)}
                  readOnly={!editable || fixedOptions}
                  placeholder="Option text"
                  className="h-8"
                />
                {editable && !fixedOptions && options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeOption(o.id)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remove option"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            );
          })}
          {editable && !fixedOptions && (
            <Button variant="ghost" size="sm" onClick={addOption} className="mt-1">
              <Plus /> Add option
            </Button>
          )}
        </div>
      )}

      {/* Rubric (written types) */}
      {!isChoice(question.type) && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Model answer / rubric{" "}
            <span className="font-normal">— graded by AI, never shown to the candidate</span>
          </p>
          <textarea
            value={rubric}
            onChange={(e) => setRubric(e.target.value)}
            readOnly={!editable}
            rows={3}
            placeholder="What a strong answer must contain…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      )}

      {/* Meta row */}
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="w-20">
          <label className="mb-1 block text-xs text-muted-foreground">Marks</label>
          <Input
            type="number"
            min={0}
            max={100}
            value={marks}
            onChange={(e) => setMarks(Math.max(0, Number(e.target.value) || 0))}
            readOnly={!editable}
            className="h-8"
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs text-muted-foreground">Skill</label>
          <Input
            value={skill}
            onChange={(e) => setSkill(e.target.value)}
            readOnly={!editable}
            placeholder="e.g. React"
            className="h-8"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Difficulty</label>
          <div className="flex gap-1">
            {(Object.keys(DIFFICULTY_META) as QuestionDifficulty[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => editable && setDifficulty(d)}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs",
                  difficulty === d
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border text-muted-foreground hover:bg-accent",
                )}
              >
                {DIFFICULTY_META[d].label}
              </button>
            ))}
          </div>
        </div>

        {editable && dirty && (
          <Button size="sm" className="ml-auto" onClick={save} disabled={busy !== null}>
            {busy === "save" ? <Loader2 className="animate-spin" /> : <Save />}
            Save
          </Button>
        )}
        {busy === "regen" && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Regenerating…
          </span>
        )}
      </div>
    </div>
  );
}

function SettingsDialog({
  open,
  test,
  canAuthor,
  onClose,
  onSaved,
}: {
  open: boolean;
  test: Test;
  canAuthor: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = React.useState(test.title);
  const [instructions, setInstructions] = React.useState(test.instructions ?? "");
  const [duration, setDuration] = React.useState<number | "">(test.duration_minutes ?? "");
  const [threshold, setThreshold] = React.useState<number | "">(test.passing_threshold ?? "");
  const [attempts, setAttempts] = React.useState(test.attempts_allowed);
  const [shuffleQ, setShuffleQ] = React.useState(test.shuffle_questions);
  const [shuffleO, setShuffleO] = React.useState(test.shuffle_options);
  const [backtrack, setBacktrack] = React.useState(test.allow_backtrack);
  const [proctoring, setProctoring] = React.useState<ProctoringLevel>(test.proctoring_level);
  const [busy, setBusy] = React.useState(false);

  async function save() {
    setBusy(true);
    const r = await updateTestSettingsAction(test.id, {
      title,
      instructions,
      durationMinutes: duration === "" ? null : Number(duration),
      passingThreshold: threshold === "" ? null : Number(threshold),
      attemptsAllowed: attempts,
      shuffleQuestions: shuffleQ,
      shuffleOptions: shuffleO,
      allowBacktrack: backtrack,
      proctoringLevel: proctoring,
    });
    setBusy(false);
    if (r.ok) {
      toast.success("Settings saved.");
      onSaved();
    } else toast.error(r.error);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Test settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field id="title" label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} readOnly={!canAuthor} />
          </Field>
          <div>
            <label className="mb-1 block text-sm font-medium">Instructions for candidates</label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              readOnly={!canAuthor}
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field id="duration" label="Duration (min)">
              <Input type="number" min={0} value={duration} onChange={(e) => setDuration(e.target.value === "" ? "" : Number(e.target.value))} readOnly={!canAuthor} />
            </Field>
            <Field id="threshold" label="Pass %">
              <Input type="number" min={0} max={100} value={threshold} onChange={(e) => setThreshold(e.target.value === "" ? "" : Number(e.target.value))} readOnly={!canAuthor} />
            </Field>
            <Field id="attempts" label="Attempts">
              <Input type="number" min={1} value={attempts} onChange={(e) => setAttempts(Math.max(1, Number(e.target.value) || 1))} readOnly={!canAuthor} />
            </Field>
          </div>

          <div className="space-y-2">
            <Toggle label="Shuffle questions" checked={shuffleQ} onChange={setShuffleQ} disabled={!canAuthor} />
            <Toggle label="Shuffle options" checked={shuffleO} onChange={setShuffleO} disabled={!canAuthor} />
            <Toggle label="Allow going back to previous questions" checked={backtrack} onChange={setBacktrack} disabled={!canAuthor} />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Proctoring</label>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(PROCTORING_META) as ProctoringLevel[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => canAuthor && setProctoring(p)}
                  title={PROCTORING_META[p].hint}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs font-medium",
                    proctoring === p
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-border text-muted-foreground hover:bg-accent",
                  )}
                >
                  {PROCTORING_META[p].label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{PROCTORING_META[proctoring].hint}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {canAuthor && (
            <Button onClick={save} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Save />}
              Save settings
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-60"
      disabled={disabled}
    >
      {label}
      <span
        className={cn(
          "relative h-5 w-9 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-muted",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-white transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}
