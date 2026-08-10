"use client";

import { Loader2, LogOut } from "lucide-react";
import * as React from "react";

import { signOutAction } from "@/server/auth/actions";

/**
 * Sign-out control. Invokes the server action programmatically inside a
 * transition rather than via a nested <form> — a form submit button placed
 * inside a Radix menu item never reliably fires, because the menu closes and
 * unmounts the form before the browser processes the submit. An onClick handler
 * dispatches synchronously, so it works from a dropdown or the sidebar alike.
 */
export function SignOutButton({
  className,
  label = "Sign out",
}: {
  className?: string;
  label?: string;
}) {
  const [pending, startTransition] = React.useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await signOutAction();
        })
      }
      className={className}
    >
      {pending ? (
        <Loader2 className="size-4 shrink-0 animate-spin" />
      ) : (
        <LogOut className="size-4 shrink-0" />
      )}
      <span>{label}</span>
    </button>
  );
}
