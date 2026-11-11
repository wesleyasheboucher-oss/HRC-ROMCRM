"use client";

import { HRC_STATUS, lineOf, primeStatusOf } from "@/lib/orderStatus";
import { PIPELINE_PATH } from "@/lib/pipelines";
import type { Line } from "@/lib/types";
import {
  Activity,
  BadgeCheck,
  BookOpen,
  Building,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  ClipboardCheck,
  FileText,
  FolderOpen,
  Gauge,
  History,
  Home,
  Inbox,
  LayoutGrid,
  ListFilter,
  ListTodo,
  Mail,
  Map,
  NotebookText,
  Package,
  Phone,
  ScanSearch,
  ScrollText,
  ShieldCheck,
  Shuffle,
  Sparkles,
  SquareKanban,
  Stethoscope,
  Target,
  User as UserIcon,
  UsersRound,
  Warehouse, HeartPulse, Trophy, Workflow } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useState, type CSSProperties, type ReactNode } from "react";
import { canViewAllCoordinators, useStore } from "@/lib/store";
import { cx } from "../ui";

/**
 * ROM CRM shell navigation, matching the Payer Intelligence Hub sidebar.
 *
 * The HRC section is this application. Every other section is presentational
 * only, rendered so the shell reads the same as the CRM, and inert.
 */

const ICON = "w-[18px] h-[18px]";

const LOGO_SHADOW: CSSProperties = {
  filter: "drop-shadow(0 1px 1px rgba(15, 23, 42, 0.25)) drop-shadow(0 2px 4px rgba(15, 23, 42, 0.18))",
};

type Item = { label: string; icon: ReactNode; href?: string };

/** The rest of the CRM, in the CRM's order. `soon` sections have no items yet. */
const CRM_SECTIONS: { key: string; label: string; items?: Item[]; soon?: boolean }[] = [
  {
    key: "market",
    label: "Market Access",
    items: [
      { label: "Coverage Map", icon: <Map className={ICON} /> },
      { label: "KPI Dashboard", icon: <Gauge className={ICON} /> },
      { label: "Organizations", icon: <Building className={ICON} /> },
      { label: "Contracts", icon: <FileText className={ICON} /> },
      { label: "New Payer Pipeline", icon: <Target className={ICON} /> },
      { label: "Implementation", icon: <CircleCheck className={ICON} /> },
      { label: "AI Insights", icon: <Sparkles className={ICON} /> },
    ],
  },
  {
    key: "elcap",
    label: "ELCAP",
    items: [
      { label: "Work queue", icon: <ListTodo className={ICON} /> },
      { label: "Providers", icon: <UsersRound className={ICON} /> },
      { label: "Licensing", icon: <BadgeCheck className={ICON} /> },
      { label: "Entities", icon: <Building2 className={ICON} /> },
      { label: "Facilities", icon: <Warehouse className={ICON} /> },
      { label: "Enrollments", icon: <ClipboardCheck className={ICON} /> },
      { label: "Billing readiness", icon: <Map className={ICON} /> },
      { label: "Packets", icon: <Package className={ICON} /> },
      { label: "Documents", icon: <FolderOpen className={ICON} /> },
      { label: "Gap Finder", icon: <ScanSearch className={ICON} /> },
      { label: "Templates & naming", icon: <BookOpen className={ICON} /> },
      { label: "Audit log", icon: <History className={ICON} /> },
    ],
  },
  {
    key: "sales",
    label: "Sales",
    items: [
      { label: "Command Center", icon: <LayoutGrid className={ICON} /> },
      { label: "Pipeline", icon: <Target className={ICON} /> },
      { label: "Sites of care", icon: <Building2 className={ICON} /> },
      { label: "Prescribers", icon: <Activity className={ICON} /> },
      { label: "Contacts", icon: <UserIcon className={ICON} /> },
      { label: "Leads", icon: <Inbox className={ICON} /> },
      { label: "Tasks", icon: <CheckCircle2 className={ICON} /> },
      { label: "Communications", icon: <Mail className={ICON} /> },
    ],
  },
  { key: "clinical", label: "Clinical Services", items: [{ label: "Patient Starts", icon: <Stethoscope className={ICON} /> }] },
  { key: "rcm", label: "RCM", items: [{ label: "Single Case", icon: <FileText className={ICON} /> }] },
  { key: "bd", label: "Business Development", soon: true },
  { key: "quality", label: "Quality", items: [{ label: "Call Review", icon: <Phone className={ICON} /> }] },
  { key: "pr", label: "PR and Marketing", soon: true },
  { key: "admin", label: "Admin", items: [{ label: "Audit & Access", icon: <ShieldCheck className={ICON} /> }] },
];

function SectionHeader({ label, open, onToggle, collapsed }: { label: string; open: boolean; onToggle: () => void; collapsed: boolean }) {
  if (collapsed) return <div className="mx-3 my-2 h-px bg-slate-200" />;
  return (
    <button
      onClick={onToggle}
      className="flex w-full cursor-pointer items-center justify-between px-3 pb-1.5 pt-5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:text-slate-900"
    >
      <span>{label}</span>
      <ChevronDown className={cx("h-3.5 w-3.5 text-slate-500 transition-transform", !open && "-rotate-90")} />
    </button>
  );
}

/** Non-interactive row for CRM sections that live outside this module. */
function InertItem({ label, icon, collapsed }: Item & { collapsed: boolean }) {
  return (
    <div
      aria-disabled="true"
      title={`${label} - part of ROM CRM, not this module`}
      className={cx(
        "flex cursor-default select-none items-center gap-3 rounded-lg px-3 py-[7px] text-[14px] text-slate-600",
        collapsed && "justify-center",
      )}
    >
      <span className="shrink-0 text-slate-500">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </div>
  );
}

/** A link to one of this app's pages, highlighted when it (or a page under it) is open. */
function ModuleLink({
  href,
  label,
  icon,
  pathname,
  collapsed,
  badge,
  exact,
}: {
  exact?: boolean;
  href: string;
  label: string;
  icon: ReactNode;
  pathname: string;
  collapsed: boolean;
  badge?: ReactNode;
}) {
  // Exact match where a sibling lives under this path (/deals vs /deals/cardiac)
  const isActive = pathname === href || (!exact && pathname.startsWith(`${href}/`));
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={cx(
        "flex w-full items-center gap-3 rounded-lg px-3 py-[7px] text-[14px] transition",
        collapsed && "justify-center",
        isActive ? "bg-brand-50 font-semibold text-brand-700" : "text-slate-800 hover:bg-slate-100",
      )}
    >
      <span className={cx("shrink-0", isActive ? "text-brand-600" : "text-slate-700")}>{icon}</span>
      {!collapsed && (
        <>
          <span className="flex-1 truncate text-left">{label}</span>
          {badge}
        </>
      )}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname() || "/";
  const { currentUser, patients } = useStore();
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({
    crm: true,
    hrc: true,
    market: false,
    elcap: false,
    sales: true,
    clinical: true,
    rcm: true,
    quality: true,
    admin: true,
  });
  const toggle = (key: string) => setOpen((s) => ({ ...s, [key]: !s[key] }));

  const isLead = canViewAllCoordinators(currentUser);
  // Same scope as each board: that line's orders in the HRC status (Patient Sales), and the coordinator's own unless a lead
  const boardCount = (line: Line) => {
    const onBoard = patients.filter((p) => primeStatusOf(p) === HRC_STATUS.prime && lineOf(p) === line);
    return isLead ? onBoard.length : onBoard.filter((p) => p.ownerId === currentUser.id).length;
  };
  const countBadge = (n: number) => (
    <span className="min-w-[22px] shrink-0 rounded-full bg-slate-100 px-1.5 py-px text-[11px] font-semibold tabular-nums text-slate-600">{n}</span>
  );

  const HRC: { href: string; label: string; icon: ReactNode; show: boolean; badge?: ReactNode; exact?: boolean }[] = [
    // One board per line: Ortho by days to surgery, Cardiac by enrollment call
    { href: PIPELINE_PATH.ortho, label: "Ortho Pipeline", icon: <SquareKanban className={ICON} />, show: true, badge: countBadge(boardCount("ortho")), exact: true },
    { href: PIPELINE_PATH.cardiac, label: "Cardiac Pipeline", icon: <SquareKanban className={ICON} />, show: true, badge: countBadge(boardCount("cardiac")) },
    // Shown to everyone so the round-robin settings are easy to find; the page itself offers a switch to a manager.
    // Ortho and Cardiac are separate streams with their own rules.
    { href: "/lead-assignment/ortho", label: "Lead Stream · Ortho", icon: <Shuffle className={ICON} />, show: true },
    { href: "/lead-assignment/cardiac", label: "Lead Stream · Cardiac", icon: <HeartPulse className={ICON} />, show: true },
    // Every order in every status (not a board): where each HRC's orders sit now
    { href: "/orders", label: "All Orders", icon: <Workflow className={ICON} />, show: true },
    // Every WON / LOST decision (conversions table)
    { href: "/conversions", label: "Conversions", icon: <Trophy className={ICON} />, show: true },
    // Call Co-Pilot wording; everyone can read it, managers and admins can edit (the page enforces that)
    { href: "/call-scripts", label: "Call Scripts", icon: <ScrollText className={ICON} />, show: true },
    { href: "/admin/views", label: "Standard Views", icon: <ListFilter className={ICON} />, show: currentUser.role === "admin" },
    { href: "/poc-notes", label: "POC Notes", icon: <NotebookText className={ICON} />, show: true },
  ];

  return (
    <aside
      className={cx(
        "relative z-[41] flex h-screen shrink-0 flex-col border-r border-slate-200 bg-surface transition-all duration-200",
        collapsed ? "w-16" : "w-60",
      )}
    >
      {/* Brand: full logo when open, the swirl mark when collapsed; they crossfade. */}
      <div className="relative h-16 shrink-0 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/romcrm-logo.png"
          alt={collapsed ? "" : "ROM CRM"}
          width={200}
          height={40}
          className={cx(
            "absolute left-1/2 top-1/2 h-auto w-[200px] max-w-none -translate-x-1/2 -translate-y-1/2 transition-all duration-200 ease-out",
            collapsed ? "scale-75 opacity-0" : "scale-100 opacity-100",
          )}
          style={LOGO_SHADOW}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/romcrm-mark.png"
          alt={collapsed ? "ROM CRM" : ""}
          width={34}
          height={36}
          className={cx(
            "absolute left-1/2 top-1/2 h-9 w-auto max-w-none -translate-x-1/2 -translate-y-1/2 transition-all duration-200 ease-out",
            collapsed ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0",
          )}
          style={LOGO_SHADOW}
        />
      </div>
      <button
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? "Expand navigation" : "Collapse navigation"}
        aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
        className="absolute -right-3 top-[52px] z-20 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-surface text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
      >
        {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
      </button>

      <nav className="no-scrollbar flex-1 overflow-y-auto px-2 pb-6">
        <SectionHeader label="ROM CRM" open={open.crm} onToggle={() => toggle("crm")} collapsed={collapsed} />
        {open.crm && <InertItem label="Home" icon={<Home className={ICON} />} collapsed={collapsed} />}

        {/* ---- HRC: this application ---- */}
        <SectionHeader label="HRC" open={open.hrc} onToggle={() => toggle("hrc")} collapsed={collapsed} />
        {open.hrc && (
          <div className="space-y-px">
            {HRC.filter((i) => i.show).map((item) => (
              <ModuleLink key={item.href} href={item.href} label={item.label} icon={item.icon} badge={item.badge} pathname={pathname} collapsed={collapsed} exact={item.exact} />
            ))}
          </div>
        )}

        {/* ---- The rest of ROM CRM: inert ---- */}
        {CRM_SECTIONS.map((section) =>
          section.soon ? (
            !collapsed && (
              <div key={section.key} className="flex select-none items-center justify-between gap-2 px-3 pb-1.5 pt-5">
                <span className="text-[11px] font-semibold uppercase leading-tight tracking-[0.08em] text-slate-700">{section.label}</span>
                <span className="shrink-0 text-[11px] text-slate-500">Coming soon...</span>
              </div>
            )
          ) : (
            <Fragment key={section.key}>
              <SectionHeader label={section.label} open={!!open[section.key]} onToggle={() => toggle(section.key)} collapsed={collapsed} />
              {open[section.key] && (
                <div className="space-y-px">
                  {section.items!.map((item) => (
                    <InertItem key={item.label} {...item} collapsed={collapsed} />
                  ))}
                </div>
              )}
            </Fragment>
          ),
        )}
      </nav>
    </aside>
  );
}
