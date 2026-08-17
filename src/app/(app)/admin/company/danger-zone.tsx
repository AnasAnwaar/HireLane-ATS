"use client";

import { AlertTriangle, Loader2, PauseCircle, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deactivateCompanyAction, deleteCompanyAction } from "@/server/company/danger-actions";

export function CompanyDangerZone({
  orgName,
  isOwner,
  canManage,
  hasMfa,
}: {
  orgName: string;
  isOwner: boolean;
  canManage: boolean;
  hasMfa: boolean;
}) {
  const [confirmName, setConfirmName] = React.useState("");
  const [code, setCode] = React.useState("");
  const [showDelete, setShowDelete] = React.useState(false);
  const [busy, setBusy] = React.useState<null | "deactivate" | "delete">(null);
  const nameMatches = confirmName.trim() === orgName;

  async function deactivate() {
    if (
      !confirm(
        "Pause this workspace? Team members will be locked out until an admin signs back in. You'll be signed out now.",
      )
    )
      return;
    setBusy("deactivate");
    const r = await deactivateCompanyAction();
    if (r.ok && r.redirectTo) window.location.assign(r.redirectTo);
    else {
      setBusy(null);
      if (!r.ok) toast.error(r.error);
    }
  }

  async function del() {
    setBusy("delete");
    const r = await deleteCompanyAction({ confirmName, code: code || undefined });
    if (r.ok && r.redirectTo) window.location.assign(r.redirectTo);
    else {
      setBusy(null);
      if (!r.ok) toast.error(r.error);
    }
  }

  if (!canManage && !isOwner) return null;

  return (
    <Card className="border-destructive/30 p-5">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4 text-destructive" />
        <h2 className="text-sm font-semibold text-destructive">Danger zone</h2>
      </div>

      {/* Deactivate */}
      {canManage && (
        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-border pt-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Pause this workspace</p>
            <p className="text-sm text-muted-foreground">
              Locks out all team members. Signing back in as an admin reactivates it automatically.
            </p>
          </div>
          <Button variant="outline" disabled={busy !== null} onClick={deactivate}>
            {busy === "deactivate" ? <Loader2 className="animate-spin" /> : <PauseCircle />}
            Deactivate
          </Button>
        </div>
      )}

      {/* Delete — owner only */}
      {isOwner && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Delete this workspace</p>
              <p className="text-sm text-muted-foreground">
                Permanently deletes <strong>{orgName}</strong>, every team member account, and all
                data. This cannot be undone.
              </p>
            </div>
            {!showDelete && (
              <Button
                variant="outline"
                className="border-destructive/40 text-destructive hover:bg-destructive-soft hover:text-destructive"
                onClick={() => setShowDelete(true)}
              >
                <Trash2 /> Delete workspace
              </Button>
            )}
          </div>

          {showDelete && (
            <div className="mt-4 space-y-3 rounded-lg border border-destructive/30 bg-destructive-soft/40 p-4">
              <div className="space-y-1">
                <Label className="text-xs">
                  Type <span className="font-mono font-semibold">{orgName}</span> to confirm
                </Label>
                <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={orgName} />
              </div>
              {hasMfa && (
                <div className="space-y-1">
                  <Label className="text-xs">Authenticator code</Label>
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    placeholder="123456"
                    className="max-w-[10rem] tracking-widest"
                  />
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <Button
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={!nameMatches || (hasMfa && code.length < 6) || busy !== null}
                  onClick={del}
                >
                  {busy === "delete" ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  Permanently delete
                </Button>
                <Button variant="ghost" disabled={busy !== null} onClick={() => setShowDelete(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
