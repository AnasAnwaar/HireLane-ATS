"use client";

import { AtSign, Bell, MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/utils";
import {
  getMyNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
  type NotificationView,
} from "@/server/notifications/actions";

export function NotificationBell() {
  const router = useRouter();
  const [items, setItems] = React.useState<NotificationView[]>([]);
  const [unread, setUnread] = React.useState(0);
  const [open, setOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    const r = await getMyNotificationsAction();
    setItems(r.items);
    setUnread(r.unread);
  }, []);

  React.useEffect(() => {
    // Fetch once on mount so the unread badge shows before the menu is opened.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function openNotification(n: NotificationView) {
    setOpen(false);
    if (!n.read) {
      setUnread((u) => Math.max(0, u - 1));
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      void markNotificationReadAction(n.id);
    }
    if (n.candidateId) router.push(`/candidates/${n.candidateId}`);
  }

  async function markAll() {
    setUnread(0);
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    await markAllNotificationsReadAction();
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) void load();
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.5625rem] font-semibold text-primary-foreground ring-2 ring-card">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <button onClick={markAll} className="text-xs text-primary hover:underline">
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">You&rsquo;re all caught up.</p>
          ) : (
            items.map((n) => {
              const Icon = n.type === "mention" ? AtSign : MessageSquare;
              return (
                <button
                  key={n.id}
                  onClick={() => openNotification(n)}
                  className={`flex w-full items-start gap-2.5 border-b border-border px-3 py-2.5 text-left transition-colors hover:bg-accent ${
                    n.read ? "" : "bg-primary-soft/40"
                  }`}
                >
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                    <Icon className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">
                      <span className="font-medium">{n.actorName}</span>{" "}
                      {n.type === "mention" ? "mentioned you" : "replied to your note"}
                      {n.candidateName ? (
                        <>
                          {" "}on <span className="font-medium">{n.candidateName}</span>
                        </>
                      ) : null}
                    </span>
                    {n.body && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{n.body}</span>}
                    <span className="mt-0.5 block text-[0.6875rem] text-muted-foreground">{formatDate(n.createdAt)}</span>
                  </span>
                  {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
                </button>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
