"use client";

import {
  ClipboardList,
  Clock,
  Eye,
  FileQuestion,
  Library,
  ListChecks,
  Pencil,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ATTEMPT_STATUS_META, TEST_STATUS_META } from "@/lib/assessments-display";
import { cn, formatDate } from "@/lib/utils";
import type { TestAttemptStatus, TestStatus } from "@/types/database";

import { UseInRoleButton } from "./use-in-role-button";

export type AttemptRow = {
  attemptId: string;
  candidateId: string | null;
  candidateName: string;
  testTitle: string;
  openingTitle: string | null;
  status: TestAttemptStatus;
  flagged: boolean;
  scorePct: number | null;
  pending: number;
  submittedAt: string | null;
};

export type TestRow = {
  id: string;
  openingId: string | null;
  openingTitle: string | null;
  title: string;
  status: TestStatus;
  version: number;
  durationMinutes: number | null;
  questionCount: number;
};

export type LibraryRow = {
  id: string;
  title: string;
  status: TestStatus;
  version: number;
  questionCount: number;
};

type Tab = "attempts" | "grading" | "tests" | "library";

export function AssessmentsHub({
  attempts,
  tests,
  library,
  openings,
  canViewAnswers,
  canManageLibrary,
}: {
  attempts: AttemptRow[];
  tests: TestRow[];
  library: LibraryRow[];
  openings: { id: string; title: string }[];
  canViewAnswers: boolean;
  canManageLibrary: boolean;
}) {
  const gradingRows = React.useMemo(() => attempts.filter((a) => a.pending > 0), [attempts]);
  const flaggedCount = attempts.filter((a) => a.flagged).length;
  const publishedCount = tests.filter((t) => t.status === "published").length;

  const [tab, setTab] = React.useState<Tab>("attempts");

  return (
    <div className="space-y-6">
      {/* Stat tiles */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={ClipboardList} label="Published tests" value={publishedCount} sub={`${tests.length} total`} />
        <Stat icon={ListChecks} label="Attempts" value={attempts.length} sub="recent activity" />
        <Stat
          icon={FileQuestion}
          label="Awaiting grading"
          value={canViewAnswers ? gradingRows.length : "—"}
          sub={canViewAnswers ? "written answers" : "needs view-answers"}
          tone={gradingRows.length > 0 ? "warning" : undefined}
        />
        <Stat
          icon={ShieldAlert}
          label="Flagged"
          value={flaggedCount}
          sub="integrity review"
          tone={flaggedCount > 0 ? "destructive" : undefined}
        />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-border">
        <TabButton active={tab === "attempts"} onClick={() => setTab("attempts")}>
          Attempts
        </TabButton>
        {canViewAnswers && (
          <TabButton active={tab === "grading"} onClick={() => setTab("grading")}>
            Grading queue
            {gradingRows.length > 0 && (
              <span className="ml-1.5 rounded-full bg-warning-soft px-1.5 text-xs text-warning-foreground">
                {gradingRows.length}
              </span>
            )}
          </TabButton>
        )}
        <TabButton active={tab === "tests"} onClick={() => setTab("tests")}>
          Tests
        </TabButton>
        <TabButton active={tab === "library"} onClick={() => setTab("library")}>
          Library
          {library.length > 0 && (
            <span className="ml-1.5 rounded-full bg-secondary px-1.5 text-xs text-muted-foreground">
              {library.length}
            </span>
          )}
        </TabButton>
      </div>

      {tab === "attempts" && <AttemptsTab rows={attempts} canViewAnswers={canViewAnswers} />}
      {tab === "grading" && canViewAnswers && <GradingTab rows={gradingRows} />}
      {tab === "tests" && <TestsTab rows={tests} />}
      {tab === "library" && (
        <LibraryTab rows={library} openings={openings} canManage={canManageLibrary} />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

const ATTEMPT_FILTERS: { key: "all" | TestAttemptStatus | "flagged"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "submitted", label: "Submitted" },
  { key: "in_progress", label: "In progress" },
  { key: "expired", label: "Expired" },
  { key: "flagged", label: "Flagged" },
];

function AttemptsTab({ rows, canViewAnswers }: { rows: AttemptRow[]; canViewAnswers: boolean }) {
  const [filter, setFilter] = React.useState<(typeof ATTEMPT_FILTERS)[number]["key"]>("all");
  const filtered = rows.filter((r) =>
    filter === "all" ? true : filter === "flagged" ? r.flagged : r.status === filter,
  );

  return (
    <div className="space-y-3">
      <FilterChips
        options={ATTEMPT_FILTERS}
        value={filter}
        onChange={(v) => setFilter(v as typeof filter)}
      />
      {filtered.length === 0 ? (
        <Empty label="No attempts match this filter." />
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <AttemptCard key={r.attemptId} row={r} canViewAnswers={canViewAnswers} />
          ))}
        </div>
      )}
    </div>
  );
}

function GradingTab({ rows }: { rows: AttemptRow[] }) {
  if (rows.length === 0) {
    return <Empty label="Nothing to grade — every written answer has been confirmed." />;
  }
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <AttemptCard key={r.attemptId} row={r} canViewAnswers grading />
      ))}
    </div>
  );
}

const TEST_FILTERS: { key: "all" | TestStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "published", label: "Published" },
  { key: "draft", label: "Draft" },
  { key: "archived", label: "Archived" },
];

function TestsTab({ rows }: { rows: TestRow[] }) {
  const [filter, setFilter] = React.useState<"all" | TestStatus>("all");
  const filtered = rows.filter((t) => (filter === "all" ? true : t.status === filter));

  return (
    <div className="space-y-3">
      <FilterChips options={TEST_FILTERS} value={filter} onChange={(v) => setFilter(v as typeof filter)} />
      {filtered.length === 0 ? (
        <Empty label="No tests match this filter." />
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => (
            <TestCard key={t.id} row={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function LibraryTab({
  rows,
  openings,
  canManage,
}: {
  rows: LibraryRow[];
  openings: { id: string; title: string }[];
  canManage: boolean;
}) {
  if (rows.length === 0) {
    return (
      <Empty label="No library assessments yet — create one to reuse across roles." />
    );
  }
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <LibraryCard key={r.id} row={r} openings={openings} canManage={canManage} />
      ))}
    </div>
  );
}

function LibraryCard({
  row,
  openings,
  canManage,
}: {
  row: LibraryRow;
  openings: { id: string; title: string }[];
  canManage: boolean;
}) {
  const meta = TEST_STATUS_META[row.status];
  return (
    <Card className="flex items-center gap-4 p-4 transition-colors hover:border-primary/30">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
        <Library className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{row.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <FileQuestion className="size-3" /> {row.questionCount}
          </span>
          <span>Reusable template</span>
        </div>
      </div>
      <Badge variant={meta.variant} dot>
        {meta.label}
      </Badge>
      {canManage && (
        <>
          <UseInRoleButton templateId={row.id} openings={openings} />
          <Button asChild variant="ghost" size="sm">
            <Link href={`/assessments/library/${row.id}`}>
              <Pencil /> Edit
            </Link>
          </Button>
        </>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function AttemptCard({
  row,
  canViewAnswers,
  grading,
}: {
  row: AttemptRow;
  canViewAnswers: boolean;
  grading?: boolean;
}) {
  const meta = ATTEMPT_STATUS_META[row.status];
  const href = row.candidateId
    ? `/candidates/${row.candidateId}/attempt/${row.attemptId}`
    : null;

  const inner = (
    <div className="flex items-center gap-4 p-4">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{row.candidateName}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="truncate">{row.testTitle}</span>
          {row.openingTitle && <span className="truncate">· {row.openingTitle}</span>}
          {row.submittedAt && <span>· {formatDate(row.submittedAt)}</span>}
        </div>
      </div>

      {row.flagged && (
        <Badge variant="destructive" className="gap-1">
          <ShieldAlert className="size-3" /> Flagged
        </Badge>
      )}
      {grading || row.pending > 0 ? (
        <Badge variant="warning">{row.pending} to grade</Badge>
      ) : canViewAnswers && row.scorePct !== null ? (
        <span className="text-sm font-semibold tabular-nums">{row.scorePct}%</span>
      ) : null}
      <Badge variant={meta.variant} dot>
        {meta.label}
      </Badge>
    </div>
  );

  return (
    <Card className="transition-colors hover:border-primary/30">
      {href ? <Link href={href}>{inner}</Link> : inner}
    </Card>
  );
}

function TestCard({ row }: { row: TestRow }) {
  const meta = TEST_STATUS_META[row.status];
  const href = row.openingId ? `/openings/${row.openingId}/tests/${row.id}` : null;

  const inner = (
    <div className="flex items-center gap-4 p-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
        <ClipboardList className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{row.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {row.openingTitle ? <span className="truncate">{row.openingTitle}</span> : <span>Unassigned</span>}
          <span className="inline-flex items-center gap-1">
            <FileQuestion className="size-3" /> {row.questionCount}
          </span>
          {row.durationMinutes && (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" /> {row.durationMinutes} min
            </span>
          )}
          {row.version > 0 && <span>v{row.version}</span>}
        </div>
      </div>
      <Badge variant={meta.variant} dot>
        {meta.label}
      </Badge>
    </div>
  );

  return (
    <Card className="transition-colors hover:border-primary/30">
      {href ? <Link href={href}>{inner}</Link> : inner}
    </Card>
  );
}

/* --- small building blocks ------------------------------------------------- */

function Stat({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof ClipboardList;
  label: string;
  value: number | string;
  sub: string;
  tone?: "warning" | "destructive";
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-4" /> {label}
      </div>
      <p
        className={cn(
          "mt-1.5 text-2xl font-semibold tabular-nums",
          tone === "warning" && "text-warning",
          tone === "destructive" && "text-destructive",
        )}
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </Card>
  );
}

function TabButton({
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
        "-mb-px inline-flex items-center border-b-2 px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function FilterChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            value === o.key
              ? "border-primary bg-primary-soft text-primary"
              : "border-border text-muted-foreground hover:bg-accent",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <Card className="flex flex-col items-center gap-2 py-12 text-center">
      <Eye className="size-6 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </Card>
  );
}
