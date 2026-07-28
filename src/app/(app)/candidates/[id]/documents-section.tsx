"use client";

import { Download, FileText, Loader2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDocumentUrlAction } from "@/server/candidates/note-actions";

type Doc = { id: string; fileName: string; kind: string; createdAt: string };

export function DocumentsSection({
  documents,
  canView,
}: {
  documents: Doc[];
  canView: boolean;
}) {
  const [busy, setBusy] = React.useState<string | null>(null);

  async function download(id: string) {
    setBusy(id);
    const result = await getDocumentUrlAction(id);
    setBusy(null);
    if (result.ok) {
      // Signed URL is short-lived; open it to download.
      window.open(result.url, "_blank", "noopener");
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Documents</CardTitle>
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No documents on file.</p>
        ) : !canView ? (
          <p className="text-xs italic text-muted-foreground">
            Documents are hidden from your role.
          </p>
        ) : (
          <ul className="space-y-2">
            {documents.map((d) => (
              <li
                key={d.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{d.fileName}</p>
                  <p className="text-xs uppercase text-muted-foreground">{d.kind}</p>
                </div>
                <button
                  onClick={() => download(d.id)}
                  disabled={busy === d.id}
                  className="text-muted-foreground transition-colors hover:text-primary"
                  aria-label={`Download ${d.fileName}`}
                >
                  {busy === d.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
