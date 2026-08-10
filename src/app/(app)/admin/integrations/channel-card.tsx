"use client";

import { Check, Link2, Loader2, Plug, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { CONNECTION_STATUS_META, channelInitials } from "@/lib/channels-display";
import type { ConnectionStatus } from "@/types/database";
import { connectChannelAction, disconnectChannelAction } from "@/server/channels/actions";

export type ChannelView = {
  key: string;
  name: string;
  categoryLabel: string;
  supportsApi: boolean;
  brandColor: string | null;
  status: ConnectionStatus | null; // null = never connected
};

export function ChannelCard({
  channel,
  canConnect,
  canDisconnect,
}: {
  channel: ChannelView;
  canConnect: boolean;
  canDisconnect: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, setPending] = React.useState<"connect" | "disconnect" | null>(null);

  const connected = channel.status === "connected";
  const meta = channel.status ? CONNECTION_STATUS_META[channel.status] : null;

  async function connect() {
    setPending("connect");
    const result = await connectChannelAction(channel.key);
    setPending(null);
    if (result.ok) {
      toast.success(`${channel.name} connected.`);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function disconnect() {
    const ok = await confirm({
      title: `Disconnect ${channel.name}?`,
      description: "Existing posts stay live but become unmanaged.",
      confirmLabel: "Disconnect",
      tone: "destructive",
    });
    if (!ok) return;
    setPending("disconnect");
    const result = await disconnectChannelAction(channel.key);
    setPending(null);
    if (result.ok) {
      toast.success(`${channel.name} disconnected.`);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-start gap-3">
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
          style={{ backgroundColor: channel.brandColor ?? "oklch(0.5 0.02 265)" }}
        >
          {channelInitials(channel.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold tracking-tight">{channel.name}</p>
          <p className="text-xs text-muted-foreground">{channel.categoryLabel}</p>
        </div>
        {meta && (
          <Badge variant={meta.variant} dot>
            {meta.label}
          </Badge>
        )}
      </div>

      <p className="mt-3 flex-1 text-xs text-muted-foreground">
        {channel.supportsApi ? (
          <>Direct publishing (API).</>
        ) : (
          <>
            Assisted mode — the AI writes a tuned post, you review and paste it across. Direct API
            posting unlocks once the platform partnership is approved.
          </>
        )}
      </p>

      <div className="mt-4 flex items-center gap-2">
        {connected ? (
          <>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
              <Check className="size-3.5" /> Ready to publish
            </span>
            {canDisconnect && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto text-muted-foreground hover:text-destructive"
                onClick={disconnect}
                disabled={pending !== null}
              >
                {pending === "disconnect" ? <Loader2 className="animate-spin" /> : <X />}
                Disconnect
              </Button>
            )}
          </>
        ) : (
          canConnect && (
            <Button size="sm" onClick={connect} disabled={pending !== null}>
              {pending === "connect" ? <Loader2 className="animate-spin" /> : channel.status === "disconnected" ? <Link2 /> : <Plug />}
              {channel.status === "disconnected" ? "Reconnect" : "Connect"}
            </Button>
          )
        )}
      </div>
    </div>
  );
}
