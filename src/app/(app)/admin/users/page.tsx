import { ShieldAlert } from "lucide-react";
import Link from "next/link";

import { PageBody, PageHeader } from "@/components/layout/app-shell";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { can } from "@/server/auth/authorize";
import { requireSession } from "@/server/auth/session";

import { InviteMemberForm } from "./invite-member-dialog";
import { MemberRowActions } from "./member-row-actions";

export const metadata = { title: "Users & roles" };

type MemberRow = {
  id: string;
  status: string;
  is_owner: boolean;
  user_id: string;
  role_id: string | null;
  name: string;
  email: string;
  roleName: string;
};

export default async function UsersPage() {
  const session = await requireSession("/admin/users");
  const canManage = await can("administration.manage_users");

  const supabase = await createClient();

  const [{ data: memberships }, { data: roles }, { data: departments }] = await Promise.all([
    supabase
      .from("memberships")
      .select("id, status, is_owner, user_id, role_id, created_at")
      .eq("organization_id", session.organizationId)
      .order("created_at"),
    supabase
      .from("roles")
      .select("id, name, key")
      .eq("organization_id", session.organizationId)
      .order("sort_order"),
    supabase
      .from("departments")
      .select("id, name")
      .eq("organization_id", session.organizationId)
      .order("name"),
  ]);

  // Profiles are fetched separately: the hand-written database types declare no
  // relationships yet, so embedded selects cannot be typed (replaced when
  // `supabase gen types` runs against a live project).
  const roleById = new Map((roles ?? []).map((r) => [r.id, r.name]));
  const userIds = (memberships ?? []).map((m) => m.user_id);

  let profileById = new Map<string, { full_name: string; email: string }>();
  if (userIds.length > 0) {
    const admin = createAdminClient();
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds);

    profileById = new Map(
      (profiles ?? []).map((p) => [p.id, { full_name: p.full_name, email: p.email }]),
    );
  }

  const members: MemberRow[] = (memberships ?? []).map((m) => {
    const profile = profileById.get(m.user_id);
    return {
      id: m.id,
      status: m.status,
      is_owner: m.is_owner,
      user_id: m.user_id,
      role_id: m.role_id,
      name: profile?.full_name || profile?.email || "Pending invitation",
      email: profile?.email ?? "",
      roleName: m.role_id ? (roleById.get(m.role_id) ?? "—") : "—",
    };
  });

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Users & roles"
        description="Invite colleagues and set what each of them can do."
      />

      <PageBody className="space-y-6">
        {!canManage ? (
          <Alert variant="warning" title="You can view this page but not change it">
            Managing users requires the <strong>Manage users</strong> permission. Ask an
            administrator if you need it.
          </Alert>
        ) : (
          <InviteMemberForm roles={roles ?? []} departments={departments ?? []} />
        )}

        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Member</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {members.map((member) => (
                  <tr key={member.id} className="transition-colors hover:bg-muted/50">
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/users/${member.id}`}
                        className="flex items-center gap-3"
                      >
                        <Avatar name={member.name} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-medium hover:underline">
                            {member.name}
                            {member.id === session.membershipId && (
                              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                (you)
                              </span>
                            )}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {member.email}
                          </p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-1.5">
                        {member.is_owner && (
                          <ShieldAlert className="size-3.5 text-primary" aria-label="Owner" />
                        )}
                        {member.roleName}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {member.status === "active" && (
                        <Badge variant="success" dot>
                          Active
                        </Badge>
                      )}
                      {member.status === "invited" && (
                        <Badge variant="warning" dot>
                          Invited
                        </Badge>
                      )}
                      {member.status === "deactivated" && (
                        <Badge variant="secondary" dot>
                          Deactivated
                        </Badge>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {canManage && (
                        <MemberRowActions
                          membershipId={member.id}
                          status={member.status}
                          isOwner={member.is_owner}
                          isSelf={member.id === session.membershipId}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <p className="text-xs text-muted-foreground">
          Fine-grained permission editing — per-permission toggles, data scopes and per-user
          overrides — arrives in CP-5.
        </p>
      </PageBody>
    </>
  );
}
