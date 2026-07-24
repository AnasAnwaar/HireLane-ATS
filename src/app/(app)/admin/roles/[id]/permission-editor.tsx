"use client";

import { AlertTriangle, ChevronDown } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PermissionKey, PermissionScope } from "@/lib/permissions/keys";
import type { PermissionModule } from "@/server/admin/queries";
import { setRolePermissionAction } from "@/server/admin/role-actions";

type Grant = { key: string; scope: PermissionScope };

const SCOPES: { value: PermissionScope; label: string }[] = [
  { value: "all", label: "All" },
  { value: "department", label: "Department" },
  { value: "assigned", label: "Assigned" },
  { value: "own", label: "Own" },
];

/**
 * The permission grid. Each permission is a toggle; scope-supporting ones gain a
 * scope selector when enabled. High-risk permissions carry a warning.
 *
 * State is optimistic: the toggle flips immediately and reverts with a toast if
 * the server rejects it. Each change is an independent, deliberate click, so
 * there's no batching — what you see is what's saved.
 */
export function PermissionEditor({
  roleId,
  catalogue,
  grants,
}: {
  roleId: string;
  catalogue: PermissionModule[];
  grants: Grant[];
}) {
  const [state, setState] = React.useState<Map<string, PermissionScope>>(
    () => new Map(grants.map((g) => [g.key, g.scope])),
  );
  const [busy, setBusy] = React.useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());

  async function toggle(key: PermissionKey, next: boolean, scope?: PermissionScope) {
    const prev = new Map(state);
    // Optimistic update.
    setState((s) => {
      const m = new Map(s);
      if (next) m.set(key, scope ?? m.get(key) ?? "all");
      else m.delete(key);
      return m;
    });
    setBusy((b) => new Set(b).add(key));

    const result = await setRolePermissionAction({
      roleId,
      permissionKey: key,
      allowed: next,
      scope: scope ?? state.get(key) ?? "all",
    });

    setBusy((b) => {
      const n = new Set(b);
      n.delete(key);
      return n;
    });

    if (!result.ok) {
      setState(prev); // revert
      toast.error(result.error);
    }
  }

  async function changeScope(key: PermissionKey, scope: PermissionScope) {
    await toggle(key, true, scope);
  }

  return (
    <div className="space-y-3">
      {catalogue.map((group) => {
        const isCollapsed = collapsed.has(group.module);
        const enabledInGroup = group.permissions.filter((p) => state.has(p.key)).length;

        return (
          <section key={group.module} className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
            <button
              type="button"
              onClick={() =>
                setCollapsed((c) => {
                  const n = new Set(c);
                  if (n.has(group.module)) n.delete(group.module);
                  else n.add(group.module);
                  return n;
                })
              }
              className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-muted/50"
            >
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform",
                  isCollapsed && "-rotate-90",
                )}
              />
              <span className="flex-1 text-sm font-semibold">{group.module}</span>
              <Badge variant={enabledInGroup ? "default" : "secondary"}>
                {enabledInGroup}/{group.permissions.length}
              </Badge>
            </button>

            {!isCollapsed && (
              <ul className="divide-y divide-border border-t border-border">
                {group.permissions.map((perm) => {
                  const enabled = state.has(perm.key);
                  const scope = state.get(perm.key) ?? "all";
                  const isBusy = busy.has(perm.key);

                  return (
                    <li
                      key={perm.key}
                      className="flex items-start gap-3 px-5 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                          {perm.label}
                          {perm.risk === "high" && (
                            <span
                              className="inline-flex items-center gap-0.5 text-warning"
                              title="High-impact permission"
                            >
                              <AlertTriangle className="size-3" />
                            </span>
                          )}
                          {perm.is_field_level && (
                            <Badge variant="outline" className="text-[0.625rem]">
                              field
                            </Badge>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{perm.description}</p>
                      </div>

                      {/* Scope selector — only for scope-supporting, enabled permissions. */}
                      {enabled && perm.supports_scope && (
                        <select
                          value={scope}
                          disabled={isBusy}
                          onChange={(e) => changeScope(perm.key as PermissionKey, e.target.value as PermissionScope)}
                          className="h-7 shrink-0 rounded-md border border-input bg-background px-2 text-xs shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={`${perm.label} scope`}
                        >
                          {SCOPES.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      )}

                      <Toggle
                        checked={enabled}
                        disabled={isBusy}
                        onChange={(next) => toggle(perm.key as PermissionKey, next)}
                        label={perm.label}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`Toggle ${label}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-primary" : "bg-input",
      )}
    >
      <span
        className={cn(
          "inline-block size-3.5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-4" : "translate-x-1",
        )}
      />
    </button>
  );
}
