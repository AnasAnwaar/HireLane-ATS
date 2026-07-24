import { ChevronRight, ShieldAlert, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";

import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { NoAccess } from "@/components/permissions/no-access";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { can } from "@/server/auth/authorize";
import { getRoles } from "@/server/admin/queries";
import { requireSession } from "@/server/auth/session";

import { CreateRoleButton } from "./create-role-button";

export const metadata = { title: "Roles & permissions" };

export default async function RolesPage() {
  const session = await requireSession("/admin/roles");

  if (!(await can("administration.manage_roles"))) {
    return (
      <NoAccess
        title="You don't have access to roles & permissions"
        message="Managing roles requires the Manage roles & permissions capability."
      />
    );
  }

  const roles = await getRoles(session.organizationId);

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Roles & permissions"
        description="Define what each role in your company can do. Nothing here is fixed by us — it's all yours to change."
        actions={<CreateRoleButton roles={roles.map((r) => ({ id: r.id, name: r.name }))} />}
      />

      <PageBody className="space-y-2.5">
        {roles.map((role) => (
          <Card key={role.id} className="transition-colors hover:border-primary/30">
            <Link href={`/admin/roles/${role.id}`} className="flex items-center gap-4 p-4">
              <span
                className={
                  role.is_owner_role
                    ? "flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
                    : "flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary"
                }
              >
                {role.is_owner_role ? (
                  <ShieldAlert className="size-5" />
                ) : (
                  <ShieldCheck className="size-5" />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-medium">
                  {role.name}
                  {role.is_owner_role && <Badge variant="default">Owner</Badge>}
                  {role.is_system && !role.is_owner_role && (
                    <Badge variant="secondary">Preset</Badge>
                  )}
                </p>
                {role.description && (
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {role.description}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Users className="size-3.5" />
                  {role.memberCount} {role.memberCount === 1 ? "member" : "members"}
                </span>
                <span className="tabular-nums">
                  {role.is_owner_role ? "All" : role.grantCount} permissions
                </span>
                <ChevronRight className="size-4" />
              </div>
            </Link>
          </Card>
        ))}
      </PageBody>
    </>
  );
}
