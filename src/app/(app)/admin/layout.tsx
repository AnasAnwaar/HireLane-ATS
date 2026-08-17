import { NAV_SECTIONS } from "@/lib/navigation";
import { getMyPermissions } from "@/server/auth/authorize";

import { AdminTabs } from "./admin-tabs";

/**
 * Administration sub-navigation. Renders the section's pages as a horizontal
 * icon-tab bar (aligned to the page container) above each admin page's own
 * header. Tabs are filtered to what the viewer may access.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const perms = await getMyPermissions();
  const held = new Set<string>(perms.keys());
  const section = NAV_SECTIONS.find((s) => s.label === "Administration");
  const allowed = (section?.items ?? [])
    .filter((i) => i.permission === null || held.has(i.permission))
    .map((i) => i.href);

  return (
    <>
      <div className="px-6 pt-5 sm:px-8">
        <div className="mx-auto max-w-[84rem]">
          <AdminTabs allowed={allowed} />
        </div>
      </div>
      {children}
    </>
  );
}
