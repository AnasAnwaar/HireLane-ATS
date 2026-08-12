"use client";

import { Download, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ReportBundle } from "@/server/reporting/queries";

function toCsv(r: ReportBundle): string {
  const rows: string[] = [];
  const line = (...cells: (string | number | null)[]) =>
    rows.push(cells.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","));

  line("HireLane report");
  line("");
  line("Totals");
  line("Applications", r.totals.applications);
  line("Hired", r.totals.hired);
  line("In pipeline", r.totals.active);
  line("Avg time to hire (days)", r.timeToHireDays ?? "");
  line("Open roles", r.totals.openOpenings);
  line("");
  line("Pipeline funnel", "Count", "Conversion %");
  for (const f of r.funnel) line(f.label, f.count, f.conversion ?? "");
  line("");
  line("Source", "Applicants", "Hired", "Conversion %");
  for (const s of r.sources) line(s.source, s.total, s.hired, s.conversion);
  line("");
  line("Assessments");
  line("Attempts", r.assessments.attempts);
  line("Submitted", r.assessments.submitted);
  line("Avg score %", r.assessments.avgScorePct ?? "");
  line("Pass rate %", r.assessments.passRatePct ?? "");
  line("");
  line("Team activity (30d)", "Events");
  for (const a of r.teamActivity.byActor) line(a.name, a.count);

  return rows.join("\r\n");
}

export function ReportExport({ data }: { data: ReportBundle }) {
  function downloadCsv() {
    const blob = new Blob([toCsv(data)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hirelane-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={downloadCsv}>
        <Download /> CSV
      </Button>
      <Button variant="outline" size="sm" onClick={() => window.print()}>
        <Printer /> Print / PDF
      </Button>
    </div>
  );
}
