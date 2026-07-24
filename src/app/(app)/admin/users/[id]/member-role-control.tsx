"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { changeMemberRoleAction } from "@/server/admin/override-actions";

export function MemberRoleControl({
  membershipId,
  currentRoleId,
  roles,
}: {
  membershipId: string;
  currentRoleId: string | null;
  roles: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [roleId, setRoleId] = React.useState(currentRoleId ?? "");
  const [pending, setPending] = React.useState(false);

  const dirty = roleId !== (currentRoleId ?? "");

  async function save() {
    setPending(true);
    const result = await changeMemberRoleAction(membershipId, roleId);
    setPending(false);
    if (result.ok) {
      toast.success("Role updated.");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={roleId}
        onChange={(e) => setRoleId(e.target.value)}
        className="h-9 min-w-48 rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      <Button size="sm" onClick={save} disabled={!dirty || pending}>
        {pending && <Loader2 className="animate-spin" />}
        Save role
      </Button>
    </div>
  );
}
