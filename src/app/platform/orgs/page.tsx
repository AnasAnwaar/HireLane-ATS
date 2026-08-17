import { createAdminClient } from "@/lib/supabase/server";
import { requirePlatformAccess } from "@/server/platform/auth";

import { OrgsTable } from "./orgs-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Organizations · Platform" };

export default async function PlatformOrgsPage() {
  await requirePlatformAccess();
  const admin = createAdminClient();

  const [{ data: orgs }, { data: subs }, { data: plans }] = await Promise.all([
    admin.from("organizations").select("id, name, slug, created_at").order("created_at", { ascending: false }),
    admin.from("org_subscriptions").select("organization_id, plan_key, status"),
    admin.from("plans").select("key, name, is_public").order("sort_order"),
  ]);

  const subByOrg = new Map((subs ?? []).map((s) => [s.organization_id, s]));
  const rows = (orgs ?? []).map((o) => {
    const sub = subByOrg.get(o.id);
    return {
      id: o.id,
      name: o.name,
      slug: o.slug,
      createdAt: o.created_at,
      planKey: sub?.plan_key ?? "free",
      status: sub?.status ?? "active",
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Organizations</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Every tenant on HireLane. Assign any plan — including private/custom plans — directly.
        </p>
      </div>
      <OrgsTable rows={rows} plans={(plans ?? []).map((p) => ({ key: p.key, name: p.name, isPublic: p.is_public }))} />
    </div>
  );
}
