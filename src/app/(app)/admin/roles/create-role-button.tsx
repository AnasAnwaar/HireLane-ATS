"use client";

import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useActionState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/validation/auth";
import { createRoleAction } from "@/server/admin/role-actions";

export function CreateRoleButton({ roles }: { roles: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    createRoleAction,
    null,
  );

  React.useEffect(() => {
    if (state?.ok && state.redirectTo) router.push(state.redirectTo);
  }, [state, router]);

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus /> New role
      </Button>
    );
  }

  return (
    <>
      {/* Lightweight modal — the app has no dialog primitive wired yet, so this
          is a focused overlay rather than pulling in Radix Dialog for one form. */}
      <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-24">
        <button
          className="absolute inset-0"
          aria-label="Close"
          onClick={() => setOpen(false)}
        />
        <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-card-lg">
          <h2 className="font-semibold">Create a role</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Start blank, or clone an existing role&rsquo;s permissions as a base.
          </p>

          {state && !state.ok && (
            <Alert variant="destructive" className="mt-4">
              {state.error}
            </Alert>
          )}

          <form action={formAction} className="mt-4 space-y-4" noValidate>
            <Field id="name" label="Role name" required>
              <Input name="name" placeholder="Sourcing Specialist" required autoFocus />
            </Field>

            <Field id="description" label="Description">
              <Input name="description" placeholder="What this role is for" />
            </Field>

            <Field id="cloneFrom" label="Clone permissions from">
              <select
                name="cloneFrom"
                defaultValue=""
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Start with nothing</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="animate-spin" />}
                Create role
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
