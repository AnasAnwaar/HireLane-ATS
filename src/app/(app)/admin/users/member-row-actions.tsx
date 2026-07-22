"use client";

import { Loader2, MailPlus, MoreHorizontal, UserMinus } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deactivateMemberAction, resendInvitationAction } from "@/server/team/actions";

export function MemberRowActions({
  membershipId,
  status,
  isOwner,
  isSelf,
}: {
  membershipId: string;
  status: string;
  isOwner: boolean;
  isSelf: boolean;
}) {
  const [pending, setPending] = React.useState(false);

  async function run(fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    setPending(true);
    const result = await fn();
    setPending(false);

    if (result.ok) toast.success(result.message ?? "Done.");
    else toast.error(result.error ?? "Something went wrong.");
  }

  // The owner cannot be deactivated or re-invited; ownership must be
  // transferred first (enforced in the database too).
  if (isOwner) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Member actions" disabled={pending}>
          {pending ? (
            <Loader2 className="animate-spin" />
          ) : (
            <MoreHorizontal className="size-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {status === "invited" && (
          <DropdownMenuItem onClick={() => run(() => resendInvitationAction(membershipId))}>
            <MailPlus /> Resend invitation
          </DropdownMenuItem>
        )}
        {status !== "deactivated" && !isSelf && (
          <DropdownMenuItem
            onClick={() => run(() => deactivateMemberAction(membershipId))}
            className="text-destructive focus:text-destructive"
          >
            <UserMinus /> Deactivate
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
