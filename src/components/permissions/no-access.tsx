import { Lock } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Shown when a server component determines the viewer lacks the permission a
 * whole page requires. A friendly wall, not a redirect — the person is in the
 * right place, they just need access granting.
 */
export function NoAccess({
  title = "You don't have access to this",
  message = "Ask a workspace administrator to grant you the required permission.",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <span className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full bg-muted">
          <Lock className="size-6 text-muted-foreground" />
        </span>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <Button variant="outline" className="mt-6" asChild>
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
