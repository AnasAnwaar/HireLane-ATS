import { Plug } from "lucide-react";

import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { FeatureGate } from "@/components/billing/feature-gate";
import { NoAccess } from "@/components/permissions/no-access";
import { Alert } from "@/components/ui/alert";
import { createClient } from "@/lib/supabase/server";
import { CATEGORY_LABELS } from "@/lib/channels-display";
import { can } from "@/server/auth/authorize";
import { requireSession } from "@/server/auth/session";
import { getEntitlements } from "@/server/billing/entitlements";
import type { Channel, ChannelConnection } from "@/types/database";

import { ChannelCard, type ChannelView } from "./channel-card";

export const metadata = { title: "Integrations" };

export default async function IntegrationsPage() {
  const session = await requireSession("/admin/integrations");

  if (!(await can("integrations.view"))) {
    return (
      <NoAccess
        title="You don't have access to integrations"
        message="Connecting job boards requires the Integrations permission."
      />
    );
  }

  const ent = await getEntitlements(session.organizationId);
  if (!ent.features.integrations) {
    return (
      <>
        <PageHeader
          eyebrow="Administration"
          title="Integrations"
          description="Connect the job boards and social platforms you post openings to."
        />
        <PageBody>
          <FeatureGate locked feature="integrations">
            {null}
          </FeatureGate>
        </PageBody>
      </>
    );
  }

  const supabase = await createClient();
  const [{ data: channels }, { data: connections }, canConnect, canDisconnect] = await Promise.all([
    supabase.from("channels").select("*").order("sort_order"),
    supabase.from("channel_connections").select("*"),
    can("integrations.connect"),
    can("integrations.disconnect"),
  ]);

  const byChannel = new Map<string, ChannelConnection>(
    (connections ?? []).map((c) => [c.channel_key, c]),
  );

  const views: ChannelView[] = ((channels ?? []) as Channel[]).map((ch) => {
    const conn = byChannel.get(ch.key);
    return {
      key: ch.key,
      name: ch.name,
      categoryLabel: CATEGORY_LABELS[ch.category] ?? ch.category,
      supportsApi: ch.supports_api,
      brandColor: ch.brand_color,
      status: conn ? conn.status : null,
    };
  });

  const connectedCount = views.filter((v) => v.status === "connected").length;
  const expired = views.filter((v) => v.status === "expired");

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Integrations"
        description="Connect the job boards and social platforms you post openings to."
      />

      <PageBody className="space-y-6">
        {expired.length > 0 && (
          <Alert variant="warning" title="Some connections need re-authorising">
            {expired.map((e) => e.name).join(", ")} stopped working. Reconnect them to keep
            publishing.
          </Alert>
        )}

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Plug className="size-4" />
          {connectedCount} of {views.length} channels connected
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {views.map((channel) => (
            <ChannelCard
              key={channel.key}
              channel={channel}
              canConnect={canConnect}
              canDisconnect={canDisconnect}
            />
          ))}
        </div>

        <Alert variant="info">
          Most boards run in <strong>assisted mode</strong> today: the AI writes a platform-tuned
          post (CP-11) and you publish it (CP-12) by copying it across. Direct one-click API
          posting to LinkedIn and Indeed unlocks per platform once their partnership is approved —
          a go-live step, not a code change.
        </Alert>
      </PageBody>
    </>
  );
}
