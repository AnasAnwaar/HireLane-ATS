"use client";

import { MoreHorizontal, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  deleteRoleAction,
  renameRoleAction,
  restoreRoleDefaultsAction,
} from "@/server/admin/role-actions";

export function RoleHeaderActions({
  roleId,
  name,
  description,
  isSystem,
}: {
  roleId: string;
  name: string;
  description: string;
  isSystem: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function rename(formData: FormData) {
    setPending(true);
    const result = await renameRoleAction(roleId, null, formData);
    setPending(false);
    if (result.ok) {
      setEditing(false);
      toast.success("Role updated.");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function restore() {
    if (!confirm("Reset this role to its preset defaults? Current changes will be lost.")) return;
    const result = await restoreRoleDefaultsAction(roleId);
    if (result.ok) {
      toast.success(result.message ?? "Reset.");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function remove() {
    if (!confirm("Delete this role? Members must be reassigned first.")) return;
    const result = await deleteRoleAction(roleId);
    if (result.ok) {
      toast.success("Role deleted.");
      router.push("/admin/roles");
    } else {
      toast.error(result.error);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <MoreHorizontal className="size-4" /> Actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditing(true)}>
            <Pencil /> Rename
          </DropdownMenuItem>
          {isSystem && (
            <DropdownMenuItem onClick={restore}>
              <RotateCcw /> Reset to defaults
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={remove} className="text-destructive focus:text-destructive">
            <Trash2 /> Delete role
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-24">
          <button className="absolute inset-0" aria-label="Close" onClick={() => setEditing(false)} />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-card-lg">
            <h2 className="font-semibold">Rename role</h2>
            <form action={rename} className="mt-4 space-y-4" noValidate>
              <Field id="name" label="Role name" required>
                <Input name="name" defaultValue={name} required autoFocus />
              </Field>
              <Field id="description" label="Description">
                <Input name="description" defaultValue={description} />
              </Field>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  Save
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
