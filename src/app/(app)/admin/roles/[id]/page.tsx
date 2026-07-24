import { ArrowLeft, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { NoAccess } from "@/components/permissions/no-access";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { can } from "@/server/auth/authorize";
import { getPermissionCatalogue, getRoleWithGrants } from "@/server/admin/queries";
import { requireSession } from "@/server/auth/session";

import { PermissionEditor } from "./permission-editor";
import { RoleHeaderActions } from "./role-header-actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const result = await getRoleWithGrants(id, session.organizationId);
  return { title: result ? `${result.role.name} · Roles` : "Role" };
}

export default async function RoleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;

  if (!(await can("administration.manage_roles"))) {
    return <NoAccess title="You don't have access to roles & permissions" />;
  }

  const [result, catalogue] = await Promise.all([
    getRoleWithGrants(id, session.organizationId),
    getPermissionCatalogue(),
  ]);

  if (!result) notFound();
  const { role, grants } = result;

  const grantList = Array.from(grants.values())
    .filter((g) => g.allowed)
    .map((g) => ({ key: g.permission_key, scope: g.scope }));

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href="/admin/roles"
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" /> Roles
          </Link>
        }
        title={role.name}
        description={role.description || "Configure what this role can do."}
        actions={
          !role.is_owner_role && (
            <RoleHeaderActions
              roleId={role.id}
              name={role.name}
              description={role.description}
              isSystem={role.is_system}
            />
          )
        }
      />

      <PageBody className="max-w-4xl space-y-5">
        {role.is_owner_role ? (
          <Alert variant="info" title="The Owner role is fixed">
            <span className="flex items-center gap-1.5">
              <ShieldAlert className="size-4 shrink-0" />
              The Owner always holds every permission and can never be locked out. This is one
              of the guarantees that can&rsquo;t be configured — so there&rsquo;s nothing to edit
              here.
            </span>
          </Alert>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary">{grantList.length} of {countAll(catalogue)} enabled</Badge>
              {role.is_system && <Badge variant="outline">Preset role</Badge>}
              <span>Changes apply to members on their next request.</span>
            </div>

            <PermissionEditor roleId={role.id} catalogue={catalogue} grants={grantList} />
          </>
        )}
      </PageBody>
    </>
  );
}

function countAll(catalogue: { permissions: unknown[] }[]) {
  return catalogue.reduce((n, m) => n + m.permissions.length, 0);
}
