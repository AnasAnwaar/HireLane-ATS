import { ArrowLeft, Plug } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { NoAccess } from "@/components/permissions/no-access";
import { Alert } from "@/components/ui/alert";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/server/auth/authorize";
import { isAiConfigured } from "@/server/ai/gemini";
import { requireSession } from "@/server/auth/session";
import type { Channel, ChannelConnection, JobPosting } from "@/types/database";

import { PostsClient, type ChannelPost } from "./posts-client";

export const metadata = { title: "AI job posts" };

export default async function PostsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;

  if (!(await can("post_generation.generate"))) {
    return <NoAccess title="You don't have access to post generation" />;
  }

  const supabase = await createClient();
  const { data: opening } = await supabase
    .from("job_openings")
    .select("id, title, status")
    .eq("id", id)
    .maybeSingle();
  if (!opening) notFound();

  const [{ data: connections }, { data: channels }, { data: postings }, canEdit, canPublish] =
    await Promise.all([
      supabase.from("channel_connections").select("*"),
      supabase.from("channels").select("*"),
      supabase.from("job_postings").select("*").eq("job_opening_id", id),
      can("post_generation.edit"),
      can("job_openings.publish"),
    ]);

  const channelByKey = new Map<string, Channel>(((channels ?? []) as Channel[]).map((c) => [c.key, c]));
  const connByKey = new Map<string, ChannelConnection>(
    ((connections ?? []) as ChannelConnection[]).map((c) => [c.channel_key, c]),
  );
  const postByChannel = new Map<string, JobPosting>(
    ((postings ?? []) as JobPosting[]).map((p) => [p.channel_key, p]),
  );

  // Show a card for every channel that is connected (or expired — it needs a
  // re-auth banner), plus any channel that still has a posting even though its
  // connection was later dropped (an "unmanaged" post, spec §UC-1 R3).
  const keys = new Set<string>();
  for (const c of (connections ?? []) as ChannelConnection[]) {
    if (c.status === "connected" || c.status === "expired") keys.add(c.channel_key);
  }
  for (const p of (postings ?? []) as JobPosting[]) keys.add(p.channel_key);

  const items: ChannelPost[] = [...keys]
    .map((key) => {
      const ch = channelByKey.get(key);
      if (!ch) return null;
      const post = postByChannel.get(key);
      const conn = connByKey.get(key);
      return {
        channelKey: ch.key,
        channelName: ch.name,
        brandColor: ch.brand_color,
        maxTitle: ch.max_title_length,
        maxBody: ch.max_body_length,
        supportsApi: ch.supports_api,
        connectionStatus: conn?.status ?? null,
        post: post
          ? {
              id: post.id,
              title: post.title ?? "",
              body: post.body ?? "",
              seoScore: post.seo_score,
              updatedAt: post.updated_at,
              status: post.status,
              scheduledFor: post.scheduled_for,
              publishedAt: post.published_at,
              externalUrl: post.external_url,
              error: post.error,
            }
          : null,
      };
    })
    .filter((x): x is ChannelPost => x !== null)
    .sort((a, b) => a.channelName.localeCompare(b.channelName));

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href={`/openings/${id}`}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" /> {opening.title}
          </Link>
        }
        title="Posts & publishing"
        description="A platform-tuned post for each channel. Review, edit, schedule and publish."
      />

      <PageBody className="max-w-4xl space-y-5">
        {!isAiConfigured() && (
          <Alert variant="warning" title="AI generation isn't configured">
            Add a Gemini API key to enable AI post writing. You can still edit posts by hand.
          </Alert>
        )}

        {items.length === 0 ? (
          <Alert variant="info" title="No channels connected">
            Connect job boards in{" "}
            <Link href="/admin/integrations" className="font-medium text-primary underline-offset-4 hover:underline">
              Integrations
            </Link>{" "}
            first — then AI can write a tailored post for each.
          </Alert>
        ) : (
          <PostsClient
            openingId={id}
            openingStatus={opening.status}
            items={items}
            canEdit={canEdit}
            canPublish={canPublish}
            aiConfigured={isAiConfigured()}
          />
        )}

        <p className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
          <Plug className="size-3" />
          Most boards publish in assisted mode — the AI writes the post, you paste it across and mark
          it posted. Direct API posting activates per platform once its partnership is approved.
        </p>
      </PageBody>
    </>
  );
}
