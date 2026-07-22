"use client";

import { Loader2, UserPlus } from "lucide-react";
import * as React from "react";
import { useActionState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/validation/auth";
import { inviteTeamMemberAction } from "@/server/team/actions";

type Role = { id: string; name: string; key: string };
type Department = { id: string; name: string };

export function InviteMemberForm({
  roles,
  departments,
}: {
  roles: Role[];
  departments: Department[];
}) {
  const [open, setOpen] = React.useState(false);
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    inviteTeamMemberAction,
    null,
  );
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  const fieldErrors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const assignableRoles = roles.filter((r) => r.key !== "owner");

  if (!open) {
    return (
      <div className="space-y-3">
        {state?.ok && state.message && <Alert variant="success">{state.message}</Alert>}
        <Button onClick={() => setOpen(true)}>
          <UserPlus /> Add team member
        </Button>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="rounded-xl border border-border bg-card p-5 shadow-card"
      noValidate
    >
      <h2 className="font-semibold">Add a team member</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        They&rsquo;ll receive an email invitation to set a password and join the workspace.
      </p>

      {state && !state.ok && (
        <Alert variant="destructive" className="mt-4">
          {state.error}
        </Alert>
      )}
      {state?.ok && state.message && (
        <Alert variant="success" className="mt-4">
          {state.message}
        </Alert>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field id="fullName" label="Full name" error={fieldErrors.fullName} required>
          <Input name="fullName" placeholder="Sara Malik" required />
        </Field>

        <Field id="email" label="Work email" error={fieldErrors.email} required>
          <Input name="email" type="email" placeholder="sara@company.com" required />
        </Field>

        <Field
          id="roleId"
          label="Role"
          hint="Determines what they can do. Editable any time."
          error={fieldErrors.roleId}
          required
        >
          <select
            name="roleId"
            required
            defaultValue={assignableRoles.find((r) => r.key === "recruiter")?.id ?? ""}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {assignableRoles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </Field>

        <Field id="departmentId" label="Department" hint="Optional — used by scoped permissions.">
          <select
            name="departmentId"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">No department</option>
            {departments.map((dept) => (
              <option key={dept.id} value={dept.id}>
                {dept.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mt-5 flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {pending ? "Sending invitation…" : "Send invitation"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Done
        </Button>
      </div>
    </form>
  );
}
