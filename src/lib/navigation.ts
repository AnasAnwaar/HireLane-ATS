import {
  BarChart3,
  Briefcase,
  Building2,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  Plug,
  ScrollText,
  ShieldCheck,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";

/**
 * Sidebar navigation.
 *
 * Every item declares the permission key that will gate it. The keys are the
 * real ones from the spec's permission catalogue (§9.1) so CP-4 can switch on
 * enforcement without touching this file. Items with `permission: null` are
 * visible to any authenticated member.
 */
export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  permission: string | null;
  /** Optional count pill (e.g. items awaiting the viewer's action). */
  badge?: number;
};

export type NavSection = {
  label: string;
  items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Recruiting",
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        permission: null,
      },
      {
        label: "Job Openings",
        href: "/openings",
        icon: Briefcase,
        permission: "job_openings.view",
      },
      {
        label: "Candidates",
        href: "/candidates",
        icon: Users,
        permission: "applicants.view_list",
      },
      {
        label: "Assessments",
        href: "/assessments",
        icon: ClipboardList,
        permission: "assessments.view",
      },
      {
        label: "Interviews",
        href: "/interviews",
        icon: Video,
        permission: "interviews.view_schedule",
      },
      {
        label: "Reports",
        href: "/reports",
        icon: BarChart3,
        permission: "reporting.view_own",
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        label: "Company",
        href: "/admin/company",
        icon: Building2,
        permission: "administration.manage_company_profile",
      },
      {
        label: "Plans & billing",
        href: "/admin/billing",
        icon: CreditCard,
        permission: "administration.manage_billing",
      },
      {
        label: "Users",
        href: "/admin/users",
        icon: Users,
        permission: "administration.manage_users",
      },
      {
        label: "Roles & Permissions",
        href: "/admin/roles",
        icon: ShieldCheck,
        permission: "administration.manage_roles",
      },
      {
        label: "Audit Log",
        href: "/admin/audit",
        icon: ScrollText,
        permission: "administration.view_audit_log",
      },
      {
        label: "Integrations",
        href: "/admin/integrations",
        icon: Plug,
        permission: "integrations.view",
      },
      {
        label: "Assessment policy",
        href: "/admin/assessments",
        icon: ClipboardList,
        permission: "administration.configure_ai_policy",
      },
    ],
  },
];
