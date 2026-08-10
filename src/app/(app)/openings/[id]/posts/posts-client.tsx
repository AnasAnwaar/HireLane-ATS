"use client";

import {
  AlertTriangle,
  CalendarClock,
  Check,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { POSTING_STATUS_META } from "@/lib/channels-display";
import { cn } from "@/lib/utils";
import type { OpeningStatus, PostingStatus } from "@/types/database";
import {
  generateAllPostsAction,
  generatePostAction,
  updatePostAction,
} from "@/server/openings/post-actions";
import {
  publishAllPostsAction,
  publishDuePostsAction,
  publishPostAction,
  schedulePostAction,
  takedownPostAction,
  unschedulePostAction,
} from "@/server/openings/publish-actions";

export type ChannelPost = {
  channelKey: string;
  channelName: string;
  brandColor: string | null;
  maxTitle: number | null;
  maxBody: number | null;
  supportsApi: boolean;
  connectionStatus: "connected" | "expired" | "disconnected" | null;
  post: {
    id: string;
    title: string;
    body: string;
    seoScore: number | null;
    updatedAt: string;
    status: PostingStatus;
    scheduledFor: string | null;
    publishedAt: string | null;
    externalUrl: string | null;
    error: string | null;
  } | null;
};

function seoTone(score: number | null) {
  if (score === null) return "secondary" as const;
  if (score >= 75) return "success" as const;
  if (score >= 50) return "warning" as const;
  return "destructive" as const;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** A post is "ready" (has content) if its title and body are non-empty. */
function hasContent(item: ChannelPost): boolean {
  return Boolean(item.post?.title.trim() && item.post?.body.trim());
}

export function PostsClient({
  openingId,
  openingStatus,
  items,
  canEdit,
  canPublish,
  aiConfigured,
}: {
  openingId: string;
  openingStatus: OpeningStatus;
  items: ChannelPost[];
  canEdit: boolean;
  canPublish: boolean;
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [generatingAll, setGeneratingAll] = React.useState(false);
  const [publishingAll, setPublishingAll] = React.useState(false);
  const sweptRef = React.useRef(false);

  const anyMissing = items.some((i) => !i.post);
  const openIsLive = openingStatus === "open";
  const publishable = items.filter(
    (i) => hasContent(i) && i.post && ["draft", "failed", "scheduled"].includes(i.post.status),
  );

  // Stand-in scheduler: on load, flip any scheduled posts whose time has passed.
  React.useEffect(() => {
    if (sweptRef.current) return;
    sweptRef.current = true;
    if (!items.some((i) => i.post?.status === "scheduled")) return;
    publishDuePostsAction(openingId).then((r) => {
      if (r.published > 0) {
        toast.success(`${r.published} scheduled post${r.published === 1 ? "" : "s"} went live.`);
        router.refresh();
      }
    });
  }, [items, openingId, router]);

  async function generateAll() {
    setGeneratingAll(true);
    const result = await generateAllPostsAction(openingId);
    setGeneratingAll(false);
    if (result.ok) {
      toast.success(result.message ?? "Generated.");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function publishAll() {
    setPublishingAll(true);
    const result = await publishAllPostsAction(openingId);
    setPublishingAll(false);
    if (result.ok) {
      toast.success(result.message ?? "Published.");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <div className="space-y-4">
      {canPublish && !openIsLive && (
        <div className="flex items-center gap-2 rounded-xl border border-warning/30 bg-warning-soft/40 p-4 text-sm">
          <AlertTriangle className="size-4 shrink-0 text-warning" />
          <span>
            This opening is <strong>{openingStatus}</strong>. Open it to publish its posts live.
          </span>
        </div>
      )}

      {(aiConfigured && anyMissing) || (canPublish && openIsLive && publishable.length > 0) ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary-soft/50 p-4">
          <div>
            <p className="text-sm font-medium">
              {anyMissing ? "Write and publish posts for every channel" : "Publish your posts"}
            </p>
            <p className="text-xs text-muted-foreground">
              {anyMissing
                ? "AI drafts a tailored post per platform; then publish or schedule them."
                : "Push every ready post live in one click."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {aiConfigured && anyMissing && (
              <Button variant="outline" onClick={generateAll} disabled={generatingAll}>
                {generatingAll ? <Loader2 className="animate-spin" /> : <Sparkles />}
                Generate all
              </Button>
            )}
            {canPublish && openIsLive && publishable.length > 0 && (
              <Button onClick={publishAll} disabled={publishingAll}>
                {publishingAll ? <Loader2 className="animate-spin" /> : <Send />}
                Publish all ({publishable.length})
              </Button>
            )}
          </div>
        </div>
      ) : null}

      {items.map((item) => (
        <PostCard
          key={`${item.channelKey}:${item.post?.id ?? "new"}:${item.post?.updatedAt ?? ""}`}
          openingId={openingId}
          openIsLive={openIsLive}
          item={item}
          canEdit={canEdit}
          canPublish={canPublish}
          aiConfigured={aiConfigured}
        />
      ))}
    </div>
  );
}

type Busy = "gen" | "save" | "publish" | "schedule" | "unschedule" | "takedown" | null;

function PostCard({
  openingId,
  openIsLive,
  item,
  canEdit,
  canPublish,
  aiConfigured,
}: {
  openingId: string;
  openIsLive: boolean;
  item: ChannelPost;
  canEdit: boolean;
  canPublish: boolean;
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [title, setTitle] = React.useState(item.post?.title ?? "");
  const [body, setBody] = React.useState(item.post?.body ?? "");
  const [busy, setBusy] = React.useState<Busy>(null);
  const [copied, setCopied] = React.useState(false);
  const [linkCopied, setLinkCopied] = React.useState(false);
  const [modal, setModal] = React.useState<null | "schedule" | "publish">(null);
  const [origin, setOrigin] = React.useState("");

  React.useEffect(() => {
    // window.location is only available on the client — read it once on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
  }, []);

  const post = item.post;
  const dirty = post && (title !== post.title || body !== post.body);
  const status = post?.status ?? "draft";
  const meta = POSTING_STATUS_META[status];
  const connectionOk = item.connectionStatus === "connected";
  const expired = item.connectionStatus === "expired";
  const applyLink = origin ? `${origin}/apply/${openingId}?src=${item.channelKey}` : "";
  const busyAny = busy !== null;

  async function run(label: Busy, fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    setBusy(label);
    const result = await fn();
    setBusy(null);
    if (result.ok) {
      toast.success(result.message ?? "Done.");
      router.refresh();
    } else {
      toast.error(result.error ?? "Something went wrong.");
    }
    return result.ok;
  }

  async function generate() {
    await run("gen", () => generatePostAction(openingId, item.channelKey));
  }
  async function save() {
    if (!post) return;
    await run("save", () => updatePostAction(post.id, { title, body }));
  }
  async function publishNow(externalUrl?: string) {
    if (!post) return;
    const ok = await run("publish", () => publishPostAction(post.id, externalUrl));
    if (ok) setModal(null);
  }
  async function schedule(iso: string) {
    if (!post) return;
    const ok = await run("schedule", () => schedulePostAction(post.id, iso));
    if (ok) setModal(null);
  }
  async function cancelSchedule() {
    if (!post) return;
    await run("unschedule", () => unschedulePostAction(post.id));
  }
  async function takedown() {
    if (!post) return;
    const ok = await confirm({
      title: `Take down the ${item.channelName} post?`,
      description:
        "It'll be marked closed and unmanaged here. Remove the live copy on the board yourself if it was posted manually.",
      confirmLabel: "Take down",
      tone: "destructive",
    });
    if (!ok) return;
    await run("takedown", () => takedownPostAction(post.id));
  }

  async function copy() {
    await navigator.clipboard.writeText([title, "", body].join("\n"));
    setCopied(true);
    toast.success(`Post copied — paste it into ${item.channelName}.`);
    setTimeout(() => setCopied(false), 2000);
  }
  async function copyLink() {
    await navigator.clipboard.writeText(applyLink);
    setLinkCopied(true);
    toast.success("Tagged apply link copied.");
    setTimeout(() => setLinkCopied(false), 2000);
  }

  // Publish entry point: API channels publish directly; assisted channels open
  // the "paste it across, then confirm" modal.
  function onPublishClick() {
    if (item.supportsApi) publishNow();
    else setModal("publish");
  }

  const canAct = canPublish && openIsLive && post;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-5 py-3">
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
          style={{ backgroundColor: item.brandColor ?? "oklch(0.5 0.02 265)" }}
        >
          {item.channelName.slice(0, 2).toUpperCase()}
        </span>
        <p className="flex-1 font-medium">{item.channelName}</p>
        {post && (
          <Badge variant={meta.variant} dot>
            {meta.label}
          </Badge>
        )}
        {post?.seoScore != null && (
          <Badge variant={seoTone(post.seoScore)} dot>
            SEO {post.seoScore}
          </Badge>
        )}
      </div>

      {expired && (
        <div className="flex items-center gap-2 border-b border-warning/30 bg-warning-soft/40 px-5 py-2 text-xs">
          <AlertTriangle className="size-3.5 shrink-0 text-warning" />
          {item.channelName} authorisation expired — reconnect it in Integrations to publish.
        </div>
      )}
      {item.connectionStatus === "disconnected" && post && (
        <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-5 py-2 text-xs text-muted-foreground">
          <AlertTriangle className="size-3.5 shrink-0" />
          Channel disconnected — this post is unmanaged.
        </div>
      )}

      {!post ? (
        <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
          <p className="text-sm text-muted-foreground">No post for this channel yet.</p>
          {aiConfigured && (
            <Button size="sm" onClick={generate} disabled={busyAny}>
              {busy === "gen" ? <Loader2 className="animate-spin" /> : <Sparkles />}
              Generate with AI
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3 p-5">
          {/* Status detail line */}
          {status === "published" && (
            <p className="flex items-center gap-1.5 text-xs text-success">
              <Check className="size-3.5" />
              Published {post.publishedAt ? formatWhen(post.publishedAt) : ""}
              {post.externalUrl && (
                <a
                  href={post.externalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
                >
                  <ExternalLink className="size-3" /> View live
                </a>
              )}
            </p>
          )}
          {status === "scheduled" && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarClock className="size-3.5" />
              Scheduled for {formatWhen(post.scheduledFor)}
            </p>
          )}
          {status === "failed" && post.error && (
            <p className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertTriangle className="size-3.5 shrink-0" /> {post.error}
            </p>
          )}
          {status === "closed" && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <X className="size-3.5" /> Taken down — kept for the record.
            </p>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Headline{item.maxTitle ? ` · ${title.length}/${item.maxTitle}` : ""}
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={item.maxTitle ?? undefined}
              readOnly={!canEdit}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Body{item.maxBody ? ` · ${body.length}/${item.maxBody}` : ""}
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={item.maxBody ?? undefined}
              readOnly={!canEdit}
              rows={7}
              className={cn(
                "w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            />
          </div>

          {/* Tagged apply link for source-of-hire attribution (spec §UC-2 R3) */}
          <button
            type="button"
            onClick={copyLink}
            className="flex w-full items-center gap-2 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            title="Copy the channel-tagged apply link"
          >
            {linkCopied ? (
              <Check className="size-3.5 shrink-0 text-success" />
            ) : (
              <Link2 className="size-3.5 shrink-0" />
            )}
            <span className="truncate font-mono">{applyLink || "…"}</span>
            <span className="ml-auto shrink-0 font-medium">Copy link</span>
          </button>

          {/* Editing / content actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={copy}>
              {copied ? <Check className="text-success" /> : <Copy />}
              Copy post
            </Button>
            {aiConfigured && (
              <Button variant="ghost" size="sm" onClick={generate} disabled={busyAny}>
                {busy === "gen" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                Regenerate
              </Button>
            )}
            {canEdit && dirty && (
              <Button size="sm" variant="secondary" onClick={save} disabled={busyAny}>
                {busy === "save" ? <Loader2 className="animate-spin" /> : <Save />}
                Save changes
              </Button>
            )}
          </div>

          {/* Publishing actions */}
          {canAct && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              {(status === "draft" || status === "failed") && (
                <>
                  <Button
                    size="sm"
                    onClick={onPublishClick}
                    disabled={busyAny || !connectionOk}
                    title={connectionOk ? undefined : "Channel not connected"}
                  >
                    {busy === "publish" ? (
                      <Loader2 className="animate-spin" />
                    ) : status === "failed" ? (
                      <RotateCcw />
                    ) : (
                      <Send />
                    )}
                    {status === "failed" ? "Retry publish" : "Publish now"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setModal("schedule")}
                    disabled={busyAny || !connectionOk}
                  >
                    <CalendarClock /> Schedule
                  </Button>
                </>
              )}
              {status === "scheduled" && (
                <>
                  <Button size="sm" onClick={onPublishClick} disabled={busyAny || !connectionOk}>
                    {busy === "publish" ? <Loader2 className="animate-spin" /> : <Send />}
                    Publish now
                  </Button>
                  <Button variant="ghost" size="sm" onClick={cancelSchedule} disabled={busyAny}>
                    {busy === "unschedule" ? <Loader2 className="animate-spin" /> : <X />}
                    Cancel schedule
                  </Button>
                </>
              )}
              {status === "published" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={takedown}
                  disabled={busyAny}
                >
                  {busy === "takedown" ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  Take down
                </Button>
              )}
              {status === "closed" && (
                <Button size="sm" variant="outline" onClick={onPublishClick} disabled={busyAny || !connectionOk}>
                  {busy === "publish" ? <Loader2 className="animate-spin" /> : <Send />}
                  Re-publish
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Schedule modal */}
      <ScheduleDialog
        open={modal === "schedule"}
        channelName={item.channelName}
        busy={busy === "schedule"}
        onClose={() => setModal(null)}
        onConfirm={schedule}
      />

      {/* Assisted publish ("paste it across, then confirm") modal */}
      <PublishDialog
        open={modal === "publish"}
        channelName={item.channelName}
        busy={busy === "publish"}
        onCopy={copy}
        copied={copied}
        onClose={() => setModal(null)}
        onConfirm={publishNow}
      />
    </Card>
  );
}

function ScheduleDialog({
  open,
  channelName,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  channelName: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: (iso: string) => void;
}) {
  const [value, setValue] = React.useState("");

  function submit() {
    if (!value) {
      toast.error("Pick a date and time.");
      return;
    }
    onConfirm(new Date(value).toISOString());
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule {channelName} post</DialogTitle>
          <DialogDescription>
            The post goes live automatically at the time you choose.
          </DialogDescription>
        </DialogHeader>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Publish date &amp; time
          </label>
          <Input
            type="datetime-local"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <CalendarClock />}
            Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PublishDialog({
  open,
  channelName,
  busy,
  copied,
  onCopy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  channelName: string;
  busy: boolean;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
  onConfirm: (url?: string) => void;
}) {
  const [url, setUrl] = React.useState("");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Post to {channelName}</DialogTitle>
          <DialogDescription>
            {channelName} is in assisted mode. Copy the post, paste it on {channelName}, then mark it
            posted — optionally with the live link so you can jump back to it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Button variant="outline" className="w-full" onClick={onCopy}>
            {copied ? <Check className="text-success" /> : <Copy />}
            Copy post text
          </Button>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Live post URL <span className="font-normal">(optional)</span>
            </label>
            <Input
              placeholder="https://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(url || undefined)} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Check />}
            Mark as posted
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
