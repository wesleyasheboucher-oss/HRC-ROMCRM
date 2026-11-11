import { coverage, COVERAGE_META, DEAL_STATUS_LABELS, dealStatusInfo, PLAN_TAG_META, planTag, type DealStatus } from "@/lib/fields";
import { formatDateTime } from "@/lib/dates";
import type { Patient } from "@/lib/types";
import { cx } from "../ui";

const BASE = "inline-flex shrink-0 items-center whitespace-nowrap rounded font-semibold uppercase leading-none tracking-wide";
const SIZES = {
  sm: "h-[18px] px-1.5 text-[10px] gap-1",
  md: "h-6 px-2 text-[11px] gap-1.5",
};

/** COMM · MCR · MCR ADV (solid). */
export function PlanTagChip({ patient, size = "sm" }: { patient: Patient; size?: keyof typeof SIZES }) {
  const t = planTag(patient);
  const meta = PLAN_TAG_META[t];
  return (
    <span title={`Plan: ${meta.title}`} className={cx(BASE, SIZES[size], meta.className)}>
      {t}
    </span>
  );
}

/** COVERED · PARTIAL SELF PAY · SELF PAY (soft, with a dot). Nothing until coverage is verified. */
export function CoverageChip({ patient, size = "sm" }: { patient: Patient; size?: keyof typeof SIZES }) {
  const c = coverage(patient);
  if (!c) return null;
  const meta = COVERAGE_META[c];
  return (
    <span title={`Coverage: ${meta.label.toLowerCase()}`} className={cx(BASE, SIZES[size], meta.className)}>
      <span className={cx("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

const STATUS_STYLE: Record<DealStatus, string> = {
  open: "bg-surface-2 text-muted ring-1 ring-inset ring-border",
  won: "bg-[#1c8a45] text-white",
  lost: "bg-[#d64545] text-white",
};

/** OPEN · WON · LOST. Won / Lost come from the saved call result; the tooltip says who and when. */
export function DealStatusChip({ patient, size = "sm" }: { patient: Patient; size?: keyof typeof SIZES }) {
  const { status, at, by } = dealStatusInfo(patient);
  const title = at ? `${DEAL_STATUS_LABELS[status]} · ${by ?? ""} · ${formatDateTime(at)}` : "Open: no WON or LOST result saved yet";
  return (
    <span title={title} className={cx(BASE, SIZES[size], STATUS_STYLE[status])}>
      {DEAL_STATUS_LABELS[status]}
    </span>
  );
}
