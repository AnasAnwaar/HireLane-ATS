"use client";

import { MoreHorizontal, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const confirm = useConfirm();
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
    const ok = await confirm({
      title: "Reset this role to defaults?",
      description: "Current changes to this role's permissions will be lost.",
      confirmLabel: "Reset role",
      tone: "destructive",
    });
    if (!ok) return;
    const result = await restoreRoleDefaultsAction(roleId);
    if (result.ok) {
      toast.success(result.message ?? "Reset.");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: "Delete this role?",
      description: "Members must be reassigned to another role first. This can't be undone.",
      confirmLabel: "Delete role",
      tone: "destructive",
    });
    if (!ok) return;
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

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rename role</DialogTitle>
          </DialogHeader>
          <form action={rename} className="space-y-4" noValidate>
            <Field id="name" label="Role name" required>
              <Input name="name" defaultValue={name} required autoFocus />
            </Field>
            <Field id="description" label="Description">
              <Input name="description" defaultValue={description} />
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                Save
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
