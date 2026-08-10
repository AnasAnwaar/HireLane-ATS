"use client";

import { ClipboardList, Loader2, MoreVertical, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn, formatDate } from "@/lib/utils";
import {
  assignTestAction,
  cancelAssignmentAction,
  grantRetakeAction,
} from "@/server/assessments/assign-actions";

export type AssignmentView = {
  id: string;
  testTitle: string;
  status: string;
  deadline: string | null;
  attemptsUsed: number;
  attemptsAllowed: number;
  autoScore: number | null;
  maxScore: number | null;
};

export type AssignableTest = {
  testId: string;
  title: string;
  applicationId: string;
  openingTitle: string;
};

const STATUS_META: Record<string, { label: string; variant: "secondary" | "warning" | "success" | "destructive" }> = {
  assigned: { label: "Assigned", variant: "warning" },
  in_progress: { label: "In progress", variant: "warning" },
  submitted: { label: "Submitted", variant: "success" },
  expired: { label: "Expired", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "secondary" },
};

export function AssessmentsCard({
  assignments,
  assignableTests,
  canAssign,
  canGrantRetake,
}: {
  assignments: AssignmentView[];
  assignableTests: AssignableTest[];
  canAssign: boolean;
  canGrantRetake: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [assigning, setAssigning] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function cancel(id: string) {
    const ok = await confirm({
      title: "Cancel this assignment?",
      description: "The candidate will no longer be able to take the test.",
      confirmLabel: "Cancel assignment",
      tone: "destructive",
    });
    if (!ok) return;
    setBusy(id);
    const r = await cancelAssignmentAction(id);
    setBusy(null);
    if (r.ok) {
      toast.success("Cancelled.");
      router.refresh();
    } else {
      toast.error(r.error);
    }
  }

  async function retake(id: string) {
    setBusy(id);
    const r = await grantRetakeAction(id);
    setBusy(null);
    if (r.ok) {
      toast.success(r.message ?? "Done.");
      router.refresh();
    } else {
      toast.error(r.error);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Assessments</CardTitle>
        {canAssign && assignableTests.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => setAssigning(true)}>
            <Plus /> Assign test
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2.5">
        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tests assigned.{" "}
            {canAssign && assignableTests.length === 0 && "Publish a test for this opening to assign it."}
          </p>
        ) : (
          assignments.map((a) => {
            const meta = STATUS_META[a.status] ?? STATUS_META.assigned;
            return (
              <div key={a.id} className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <ClipboardList className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.testTitle}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                    {a.deadline && <span>Due {formatDate(a.deadline)}</span>}
                    <span>
                      Attempt {a.attemptsUsed}/{a.attemptsAllowed}
                    </span>
                    {a.status === "submitted" && a.maxScore != null && (
                      <span className="text-foreground">
                        Auto: {a.autoScore ?? 0}/{a.maxScore}
                      </span>
                    )}
                  </div>
                </div>
                <Badge variant={meta.variant} dot>
                  {meta.label}
                </Badge>
                {(canAssign || canGrantRetake) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-7" disabled={busy === a.id}>
                        {busy === a.id ? <Loader2 className="size-3.5 animate-spin" /> : <MoreVertical className="size-3.5" />}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canGrantRetake && a.status === "submitted" && (
                        <DropdownMenuItem onClick={() => retake(a.id)}>Grant retake</DropdownMenuItem>
                      )}
                      {canAssign && a.status !== "cancelled" && (
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => cancel(a.id)}>
                          Cancel
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            );
          })
        )}
      </CardContent>

      <AssignDialog
        open={assigning}
        tests={assignableTests}
        onClose={() => setAssigning(false)}
        onDone={() => {
          setAssigning(false);
          router.refresh();
        }}
      />
    </Card>
  );
}

function AssignDialog({
  open,
  tests,
  onClose,
  onDone,
}: {
  open: boolean;
  tests: AssignableTest[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [testKey, setTestKey] = React.useState(tests[0] ? `${tests[0].applicationId}::${tests[0].testId}` : "");
  const [deadline, setDeadline] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function assign() {
    const t = tests.find((x) => `${x.applicationId}::${x.testId}` === testKey);
    if (!t) {
      toast.error("Pick a test.");
      return;
    }
    setBusy(true);
    const r = await assignTestAction(t.applicationId, t.testId, {
      deadline: deadline ? new Date(deadline).toISOString() : null,
    });
    setBusy(false);
    if (r.ok) {
      toast.success("Test assigned.");
      onDone();
    } else {
      toast.error(r.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign a test</DialogTitle>
          <DialogDescription>
            The candidate takes it through their portal link. Set a deadline if you like.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Test</label>
            <div className="space-y-1.5">
              {tests.map((t) => {
                const key = `${t.applicationId}::${t.testId}`;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTestKey(key)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm",
                      testKey === key ? "border-primary bg-primary-soft" : "border-border hover:bg-accent",
                    )}
                  >
                    <span className="font-medium">{t.title}</span>
                    <span className="text-xs text-muted-foreground">{t.openingTitle}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Deadline (optional)
            </label>
            <Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={assign} disabled={busy || !testKey}>
            {busy ? <Loader2 className="animate-spin" /> : <Plus />}
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
