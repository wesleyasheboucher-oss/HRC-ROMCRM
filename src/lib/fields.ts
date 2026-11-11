import { formatDate, startOfToday } from "./dates";
import { daysOut, stageOf, STAGES } from "./stages";
import { DETAIL_FIELDS } from "./details";
import { DEAL_STATUS_LABELS, dealStatus, estimateLines, estimateTotal, logisticsType, LOGISTICS_TYPES, planType, PLAN_TYPES, type PlanType } from "./derive";
import { ALL_SUBSTATUSES, LINE_LABELS, lineOf, PRIME_STATUSES, primeStatusOf, substatusOf } from "./orderStatus";
import type { EstimateLineKey, Patient, PayerType, User } from "./types";

export { DEAL_STATUS_LABELS, DEAL_STATUSES, dealStatus, dealStatusInfo, estimateLines, estimateTotal, logisticsType, logisticsTypeFor, LOGISTICS_TYPES, planType, PLAN_TYPES } from "./derive";
export type { DealStatus, PlanType } from "./derive";

// Placeholder pick-lists. The BRD lists the full value sets for Call Stage,
// WIP State and Sales Status as an open question; these are only what the
// Pipedrive videos show plus plausible fillers so the demo has variety.
export const CALL_STAGES = [
  "New Not Called",
  "1st Call Attempted",
  "2nd Call Attempted",
  "3rd Call Attempted",
  "4th Call Attempted",
  "5th Call Attempted",
  "6th Call Attempted",
  "Connected - Follow Up",
  "Cleared for Delivery",
];
export const WIP_STATES = [
  "13 Ins Cleared: PendConfirmation",
  "15 Not Covered",
];
/** Call stages that are just an attempt counter, one per tracker block: index = calls made (0–6). Logging a call advances through these. */
export const ATTEMPT_STAGES = [
  "New Not Called",
  "1st Call Attempted",
  "2nd Call Attempted",
  "3rd Call Attempted",
  "4th Call Attempted",
  "5th Call Attempted",
  "6th Call Attempted",
];

/** Call tracker steps (top of the detail panel): blue = new / not called, then green → yellow → orange → red. */
export const CALL_STEPS = ["Not called", "1 call", "2 calls", "3 calls", "4 calls", "5 calls", "6 calls"];

/** Calls made so far. Falls back to Call Stage for records saved before the counter existed. */
export function callCount(p: Patient): number {
  if (typeof p.callAttempts === "number") return p.callAttempts;
  const i = ATTEMPT_STAGES.indexOf(p.callStage);
  if (i >= 0) return i;
  return p.callStage === "Cleared for Delivery" ? 3 : 2;
}

export const ESTIMATE_LINES: { key: EstimateLineKey; label: string; title: string }[] = [
  { key: "dme", label: "DME", title: "Durable medical equipment" },
  { key: "rtm", label: "RTM", title: "Remote therapeutic monitoring" },
  { key: "ot", label: "OT", title: "Occupational therapy" },
];

/* ---------------------------------------------------------------------------
   Card / drawer tags: two independent tags.
     Plan tag      COMM · MCR · MCR ADV   (from the plan; VA and WC kept for those plans)
     Coverage tag  COVERED · PARTIAL SELF PAY · SELF PAY
   --------------------------------------------------------------------------- */
export type PlanTag = "COMM" | "MCR" | "MCR ADV" | "VA" | "WC";
export const PLAN_TAGS: PlanTag[] = ["COMM", "MCR", "MCR ADV", "VA", "WC"];
const PLAN_TAG_BY_TYPE: Record<PlanType, PlanTag> = {
  Commercial: "COMM",
  Medicare: "MCR",
  "Medicare Advantage": "MCR ADV",
  VA: "VA",
  "Worker's Comp": "WC",
};
export const planTag = (p: Patient): PlanTag => PLAN_TAG_BY_TYPE[planType(p)];

/** Solid chips; hues kept clear of the coverage greens / ambers / reds. */
export const PLAN_TAG_META: Record<PlanTag, { title: string; className: string }> = {
  COMM: { title: "Commercial", className: "bg-[#2a65c7] text-white" },
  MCR: { title: "Medicare", className: "bg-[#6d4fd8] text-white" },
  "MCR ADV": { title: "Medicare Advantage", className: "bg-[#0e8193] text-white" },
  VA: { title: "VA", className: "bg-[#5f636d] text-white" },
  WC: { title: "Worker's Comp", className: "bg-[#5f636d] text-white" },
};

export type Coverage = "covered" | "partial" | "selfpay";
export const COVERAGES: Coverage[] = ["covered", "partial", "selfpay"];
/**
 * Coverage tag. WIP 15 (not covered) → SELF PAY. Otherwise from the DME / RTM / OT lines:
 * any line self-pay → PARTIAL SELF PAY, else COVERED. Not yet verified (no WIP 13 / 15) → no tag.
 */
export function coverage(p: Patient): Coverage | null {
  if (p.wipState.startsWith("15")) return "selfpay";
  if (!p.wipState.startsWith("13")) return null;
  return Object.values(estimateLines(p)).some((l) => l.status === "self_pay") ? "partial" : "covered";
}

/** Soft chips with a leading dot; colour = how much the patient pays. */
export const COVERAGE_META: Record<Coverage, { label: string; className: string; dot: string; bar: string }> = {
  covered: { label: "IN NETWORK", className: "bg-emerald-50 text-[#167a3c] dark:text-[#6fd49a] ring-1 ring-inset ring-[#1c8a45]/30", dot: "bg-[#1c8a45]", bar: "bg-[#1c8a45]" },
  partial: { label: "PARTIAL SELF PAY", className: "bg-amber-50 text-[#a15c00] dark:text-[#f0b84d] ring-1 ring-inset ring-[#e08a00]/35", dot: "bg-[#e08a00]", bar: "bg-[#e08a00]" },
  selfpay: { label: "SELF PAY", className: "bg-red-50 text-[#b42323] dark:text-[#f08a8a] ring-1 ring-inset ring-[#d64545]/30", dot: "bg-[#d64545]", bar: "bg-[#d64545]" },
};
/** Colour bar for list rows / search results: coverage colour, grey when not yet verified. */
export const coverageBar = (p: Patient) => {
  const c = coverage(p);
  return c ? COVERAGE_META[c].bar : "bg-payer-other";
};

export const SALES_STATUSES = ["New Patient", "Contacted", "Education Complete", "Cost Discussed", "Cleared for Delivery"];
export const CLASSIFICATIONS = ["Ortho", "Cardiac"];
/** Treatment plan lengths, matching the EVA Estimator (30 / 42 / 60 days). */
export const LENGTHS_OF_NEED = ["30", "42", "60"];

export const PAYER_META: Record<PayerType, { label: string; short?: string; color: string; bar: string }> = {
  selfpay: { label: "Self-pay", color: "text-payer-selfpay", bar: "bg-payer-selfpay" },
  commercial: { label: "Commercial", color: "text-payer-commercial", bar: "bg-payer-commercial" },
  medicare: { label: "Medicare", color: "text-payer-medicare", bar: "bg-payer-medicare" },
  other: { label: "Other / unverified", short: "Other", color: "text-payer-other", bar: "bg-payer-other" },
};

/**
 * Payer type drives the card colour bar (D-07) and lead type (A-05).
 * Rules mirror the four standard filters: WIP 15 → self-pay; WIP 13 + MCR YES → Medicare;
 * WIP 13 + MCR NO → commercial. Anything else is "other" (BRD open question: fourth colour).
 */
export function payerType(p: Patient): PayerType {
  if (p.wipState.startsWith("15")) return "selfpay";
  if (p.wipState.startsWith("13")) return p.mcr === "YES" ? "medicare" : "commercial";
  return "other";
}

export type FieldType = "text" | "number" | "currency" | "date" | "enum" | "user" | "phone";
export type FieldSection =
  | "pcsp"
  | "record"
  | "romcrm"
  | "derived"
  // Record tabs in the drawer (see details.ts)
  | "tab_patient"
  | "tab_insurance"
  | "tab_hrc"
  | "tab_delivery";

export interface FieldCtx {
  usersById: Record<string, User>;
  today?: Date;
}

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  section: FieldSection;
  options?: string[];
  /** Raw value used for filtering and sorting. */
  get: (p: Patient, ctx: FieldCtx) => string | number | null;
}

const text = (key: keyof Patient, label: string, section: FieldSection = "pcsp", type: FieldType = "text"): FieldDef => ({
  key,
  label,
  type,
  section,
  get: (p) => (p[key] as string) ?? "",
});

const enumField = (key: keyof Patient, label: string, options: string[]): FieldDef => ({
  key,
  label,
  type: "enum",
  section: "pcsp",
  options,
  get: (p) => p[key] as string,
});

export const userDisplayName = (u: User | undefined) => (u ? `${u.firstName} ${u.lastName}` : "Unassigned");

/**
 * Single registry of every patient field. Cards (D-15), list columns, the
 * filter builder (F-04) and the detail panel (D-11) all read from here, so a
 * new field only needs to be added once.
 */
export const FIELDS: FieldDef[] = [
  // PCSP section — in the exact order shown in Pipedrive
  enumField("callStage", "Call Stage", CALL_STAGES),
  enumField("wipState", "WIP State", WIP_STATES),
  enumField("salesStatus", "Sales Status", SALES_STATUSES),
  text("btPatientId", "BT Patient ID"),
  text("btOrderId", "BT Order ID"),
  text("state", "State"),
  enumField("lengthOfNeed", "Length Of Need", LENGTHS_OF_NEED),
  { key: "age", label: "Age", type: "number", section: "pcsp", get: (p) => p.age },
  enumField("classification", "Classification", CLASSIFICATIONS),
  text("doctorNotes", "Doctor Notes"),
  text("physicianName", "Physician Name"),
  text("iomsOrderId", "iOMS Order ID"),
  text("id", "ID"),
  enumField("mcr", "MCR YES/NO", ["YES", "NO"]),
  { key: "va", label: "VA YES/NO", type: "enum", section: "pcsp", options: ["YES", "NO"], get: (p) => p.va ?? "NO" },
  text("insuranceName", "Insurance Name"),
  text("firstName", "Patient Name"),
  text("homePhone", "Home Phone", "pcsp", "phone"),
  text("mobilePhone", "Mobile Phone", "pcsp", "phone"),
  text("secondaryPhone", "Secondary Phone", "pcsp", "phone"),
  { key: "selfPayChargeDate", label: "Self Pay Charge Date", type: "date", section: "pcsp", get: (p) => p.selfPayChargeDate },
  {
    key: "agreedSelfPayAmount",
    label: "Agreed - Self Pay Amount",
    type: "currency",
    section: "pcsp",
    get: (p) => p.agreedSelfPayAmount,
  },
  { key: "surgeryDate", label: "Surgery Date", type: "date", section: "pcsp", get: (p) => p.surgeryDate },

  // Record-level fields
  {
    key: "owner",
    label: "Owner",
    type: "user",
    section: "record",
    get: (p) => p.ownerId ?? "",
  },
  { key: "expectedCloseDate", label: "Expected close date", type: "date", section: "record", get: (p) => p.expectedCloseDate },
  { key: "lastName", label: "Last Name", type: "text", section: "record", get: (p) => p.lastName },
  { key: "createdAt", label: "Created", type: "date", section: "record", get: (p) => p.createdAt.slice(0, 10) },

  // New data captured by ROMCRM (not in Pipedrive)
  {
    key: "financialEstimate",
    label: "Financial Estimate",
    type: "currency",
    section: "romcrm",
    get: (p) => estimateTotal(p),
  },
  {
    key: "logisticsType",
    label: "Logistics Type",
    type: "enum",
    section: "romcrm",
    options: LOGISTICS_TYPES,
    get: (p) => logisticsType(p),
  },
  { key: "callAttempts", label: "Calls made", type: "number", section: "romcrm", get: (p) => callCount(p) },

  // iOMS order status (see orderStatus.ts). Substatus pick-lists narrow to the chosen prime status.
  { key: "primeStatus", label: "Order Status", type: "enum", section: "romcrm", options: [...PRIME_STATUSES], get: (p) => primeStatusOf(p) },
  { key: "substatus", label: "Substatus", type: "enum", section: "romcrm", options: [...ALL_SUBSTATUSES], get: (p) => substatusOf(p) },
  { key: "statusChangedAt", label: "Status Changed", type: "date", section: "romcrm", get: (p) => p.statusChangedAt?.slice(0, 10) ?? "" },
  { key: "line", label: "Line", type: "enum", section: "romcrm", options: Object.values(LINE_LABELS), get: (p) => LINE_LABELS[lineOf(p)] },

  // Derived, read-only
  // Open / Won / Lost: set by saving a WON or LOST call result
  { key: "dealStatus", label: "Status", type: "enum", section: "derived", options: ["Open", "Won", "Lost"], get: (p) => DEAL_STATUS_LABELS[dealStatus(p)] },
  { key: "planType", label: "Plan Type", type: "enum", section: "derived", options: [...PLAN_TYPES], get: (p) => planType(p) },
  { key: "planTag", label: "Plan Tag", type: "enum", section: "derived", options: PLAN_TAGS, get: (p) => planTag(p) },
  {
    key: "coverage",
    label: "Coverage",
    type: "enum",
    section: "derived",
    options: COVERAGES,
    get: (p) => coverage(p) ?? "",
  },
  {
    key: "payerType",
    label: "Payer Type",
    type: "enum",
    section: "derived",
    options: ["selfpay", "commercial", "medicare", "other"],
    get: (p) => payerType(p),
  },
  {
    key: "stage",
    label: "Stage",
    type: "enum",
    section: "derived",
    options: STAGES.map((s) => s.label),
    get: (p, ctx) => stageOf(p, ctx.today ?? startOfToday()).label,
  },
  {
    key: "daysOut",
    label: "Days to Surgery",
    type: "number",
    section: "derived",
    get: (p, ctx) => daysOut(p.surgeryDate, ctx.today ?? startOfToday()),
  },

  // Record tabs (Patient Info, Insurance & Eligibility, HRC, Delivery & Onboarding)
  ...DETAIL_FIELDS,
];

export const FIELDS_BY_KEY: Record<string, FieldDef> = Object.fromEntries(FIELDS.map((f) => [f.key, f]));

export const PCSP_FIELDS = FIELDS.filter((f) => f.section === "pcsp");

/** Every field in one A–Z list, for the field pickers (columns, card fields, filter conditions). No grouping. */
export const FIELDS_AZ: FieldDef[] = [...FIELDS].sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));

/** Human-readable value for display on cards, list and panel. */
export function displayValue(field: FieldDef, p: Patient, ctx: FieldCtx): string {
  const raw = field.get(p, ctx);
  if (raw === null || raw === undefined || raw === "") return "";
  switch (field.type) {
    case "date":
      return formatDate(String(raw));
    case "currency":
      return Number(raw).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
    case "user":
      return userDisplayName(ctx.usersById[String(raw)]);
    default:
      if (field.key === "payerType") return PAYER_META[raw as PayerType].label;
      if (field.key === "coverage") return COVERAGE_META[raw as Coverage].label;
      if (field.key === "firstName") return `${p.firstName} ${p.lastName}`;
      return String(raw);
  }
}

/** Default list view columns (separate from card fields). */
export const DEFAULT_LIST_COLUMNS = [
  "firstName",
  "dealStatus",
  "salesStatus",
  "insuranceName",
  "planTag",
  "coverage",
  "wipState",
  "owner",
  "surgeryDate",
  "expectedCloseDate",
];

/** Default All Orders list columns: where each order sits, then who has it. */
export const DEFAULT_ORDERS_COLUMNS = ["firstName", "primeStatus", "substatus", "statusChangedAt", "owner", "line", "iomsOrderId", "insuranceName", "surgeryDate", "dealStatus"];

export const DEFAULT_CARD_FIELDS = ["firstName", "salesStatus", "insuranceName", "wipState", "expectedCloseDate"];
