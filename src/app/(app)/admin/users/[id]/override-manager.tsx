"use client";

import { Loader2, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import type { PermissionKey, PermissionScope } from "@/lib/permissions/keys";
import type { PermissionModule } from "@/server/admin/queries";
import type { MemberOverride } from "@/server/admin/member-queries";
import { removeOverrideAction, setOverrideAction } from "@/server/admin/override-actions";

export function OverrideManager({
  membershipId,
  catalogue,
  overrides,
  readOnly,
}: {
  membershipId: string;
  catalogue: PermissionModule[];
  overrides: MemberOverride[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  // Form state for a new override.
  const [permissionKey, setPermissionKey] = React.useState("");
  const [allowed, setAllowed] = React.useState(true);
  const [scope, setScope] = React.useState<PermissionScope | "">("");
  const [expiresAt, setExpiresAt] = React.useState("");
  const [reason, setReason] = React.useState("");

  const labelFor = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const g of catalogue) for (const p of g.permissions) map.set(p.key, p.label);
    return map;
  }, [catalogue]);

  async function add() {
    if (!permissionKey) {
      toast.error("Choose a permission.");
      return;
    }
    setPending(true);
    const result = await setOverrideAction({
      membershipId,
      permissionKey: permissionKey as PermissionKey,
      allowed,
      scope: scope || null,
      expiresAt: expiresAt || null,
      reason: reason || undefined,
    });
    setPending(false);
    if (result.ok) {
      toast.success("Override saved.");
      setAdding(false);
      setPermissionKey("");
      setScope("");
      setExpiresAt("");
      setReason("");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function remove(id: string) {
    const result = await removeOverrideAction(id);
    if (result.ok) {
      toast.success("Override removed.");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  const selectClass =
    "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="space-y-4">
      {overrides.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground">No overrides. This member uses their role&rsquo;s permissions.</p>
      )}

      {overrides.length > 0 && (
        <ul className="space-y-2">
          {overrides.map((o) => {
            const expired = o.expiresAt && new Date(o.expiresAt) < new Date();
            return (
              <li
                key={o.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
              >
                <Badge variant={o.allowed ? "success" : "destructive"} dot>
                  {o.allowed ? "Grant" : "Revoke"}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {labelFor.get(o.permissionKey) ?? o.permissionKey}
                    {o.scope && <span className="ml-1.5 text-xs text-muted-foreground">({o.scope})</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {o.reason && <span>{o.reason} · </span>}
                    {o.expiresAt ? (
                      <span className={expired ? "text-destructive" : ""}>
                        {expired ? "Expired " : "Expires "}
                        {formatDate(o.expiresAt)}
                      </span>
                    ) : (
                      "No expiry"
                    )}
                  </p>
                </div>
                {!readOnly && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove override"
                    onClick={() => remove(o.id)}
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!readOnly && !adding && (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus /> Add override
        </Button>
      )}

      {adding && (
        <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 sm:col-span-2">
              <span className="text-xs font-medium">Permission</span>
              <select
                value={permissionKey}
                onChange={(e) => setPermissionKey(e.target.value)}
                className={selectClass}
              >
                <option value="">Choose a permission…</option>
                {catalogue.map((group) => (
                  <optgroup key={group.module} label={group.module}>
                    {group.permissions.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-medium">Effect</span>
              <select
                value={allowed ? "grant" : "revoke"}
                onChange={(e) => setAllowed(e.target.value === "grant")}
                className={selectClass}
              >
                <option value="grant">Grant</option>
                <option value="revoke">Revoke</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-medium">Scope (optional)</span>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as PermissionScope | "")}
                className={selectClass}
                disabled={!allowed}
              >
                <option value="">Inherit role scope</option>
                <option value="all">All</option>
                <option value="department">Department</option>
                <option value="assigned">Assigned</option>
                <option value="own">Own</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-medium">Expires (optional)</span>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className={selectClass}
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs font-medium">Reason (optional)</span>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why this exception?"
                className={selectClass}
              />
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={add} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Save override
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
