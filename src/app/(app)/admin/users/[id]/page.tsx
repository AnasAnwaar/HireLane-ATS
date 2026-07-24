import { ArrowLeft, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { NoAccess } from "@/components/permissions/no-access";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { can } from "@/server/auth/authorize";
import { getMemberDetail } from "@/server/admin/member-queries";
import { getPermissionCatalogue } from "@/server/admin/queries";
import { requireSession } from "@/server/auth/session";

import { MemberRoleControl } from "./member-role-control";
import { OverrideManager } from "./override-manager";

export const metadata = { title: "Member" };

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;

  if (!(await can("administration.manage_users"))) {
    return <NoAccess title="You don't have access to member management" />;
  }

  const [detail, catalogue, canManageRoles] = await Promise.all([
    getMemberDetail(id, session.organizationId),
    getPermissionCatalogue(),
    can("administration.manage_roles"),
  ]);

  if (!detail) notFound();
  const { member, overrides, roles } = detail;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href="/admin/users"
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" /> Users
          </Link>
        }
        title={member.name}
        description={member.email}
      />

      <PageBody className="max-w-3xl space-y-6">
        <Card>
          <CardContent className="flex flex-wrap items-center gap-4 p-5">
            <Avatar name={member.name} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-medium">
                {member.name}
                {member.isOwner && (
                  <Badge variant="default">
                    <ShieldAlert className="size-3" /> Owner
                  </Badge>
                )}
                {member.status === "invited" && <Badge variant="warning" dot>Invited</Badge>}
                {member.status === "deactivated" && <Badge variant="secondary" dot>Deactivated</Badge>}
              </p>
              <p className="text-sm text-muted-foreground">{member.email}</p>
              {member.departmentName && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Department: {member.departmentName}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Role */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Role</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Determines this member&rsquo;s baseline permissions.
            </p>
          </CardHeader>
          <CardContent>
            {member.isOwner ? (
              <Alert variant="info">
                The Owner holds every permission and their role can&rsquo;t be changed here.
                Use <strong>Transfer ownership</strong> to hand the role to someone else.
              </Alert>
            ) : (
              <MemberRoleControl
                membershipId={member.membershipId}
                currentRoleId={member.roleId}
                roles={roles
                  .filter((r) => !r.is_owner_role)
                  .map((r) => ({ id: r.id, name: r.name }))}
              />
            )}
          </CardContent>
        </Card>

        {/* Per-user overrides */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Permission overrides</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Grant or remove a single permission for this person without changing their role.
              Overrides win over the role, and can expire automatically.
            </p>
          </CardHeader>
          <CardContent>
            {member.isOwner ? (
              <p className="text-sm text-muted-foreground">
                The Owner already holds everything — overrides don&rsquo;t apply.
              </p>
            ) : (
              <OverrideManager
                membershipId={member.membershipId}
                catalogue={catalogue}
                overrides={overrides}
                readOnly={!canManageRoles}
              />
            )}
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
