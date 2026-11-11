/**
 * Quick filters: the sectioned filters in the Filters drawer (status chips, plan, coverage, dates, counts…).
 * Each section is independent and optional; a patient must match every section that's set.
 * Within a multi-pick section, matching any one of the picked values is enough.
 * Saved views store these alongside their advanced ALL / ANY conditions.
 */
import { addDays, toISODate } from "./dates";
import { callCount, coverage, DEAL_STATUS_LABELS, dealStatus, estimateTotal, planTag, type Coverage, type DealStatus, type PlanTag } from "./fields";
import { stageOf } from "./stages";
import type { Patient, StageId } from "./types";

export type CoverageChoice = Coverage | "unverified";
export type YesNo = "YES" | "NO";

export type DatePreset = "past" | "today" | "next7" | "next30" | "last7" | "last30" | "custom";
export interface DateRange {
  preset: DatePreset;
  /** Custom range only, ISO dates, either end optional */
  from?: string;
  to?: string;
}

export interface CountRule {
  op: "gte" | "lte" | "eq";
  n: number;
}

export interface QuickFilters {
  dealStatus?: DealStatus[];
  stage?: StageId[];
  plan?: PlanTag[];
  coverage?: CoverageChoice[];
  wipState?: string[];
  callStage?: string[];
  salesStatus?: string[];
  classification?: string[];
  lengthOfNeed?: string[];
  /** User ids; "" = unassigned */
  owners?: string[];
  insurance?: string[];
  state?: string[];
  mcr?: YesNo;
  va?: YesNo;
  surgery?: DateRange;
  expectedClose?: DateRange;
  created?: DateRange;
  calls?: CountRule;
  /** Financial estimate, whole dollars */
  estimate?: { op: "gte" | "lte"; amount: number };
  age?: { min?: number; max?: number };
}

export type QuickKey = keyof QuickFilters;

/* ---------------------------------------------------------------------------
   Matching
   --------------------------------------------------------------------------- */

const has = <T>(list: T[] | undefined, v: T) => !list?.length || list.includes(v);

/** ISO bounds [from, to] for a date range relative to today; undefined end = open. */
export function dateBounds(r: DateRange, today: Date): { from?: string; to?: string } {
  const d = (n: number) => toISODate(addDays(today, n));
  switch (r.preset) {
    case "past":
      return { to: d(-1) };
    case "today":
      return { from: d(0), to: d(0) };
    case "next7":
      return { from: d(0), to: d(7) };
    case "next30":
      return { from: d(0), to: d(30) };
    case "last7":
      return { from: d(-7), to: d(0) };
    case "last30":
      return { from: d(-30), to: d(0) };
    case "custom":
      return { from: r.from || undefined, to: r.to || undefined };
  }
}

const inRange = (iso: string | null | undefined, r: DateRange | undefined, today: Date) => {
  if (!r) return true;
  if (!iso) return false;
  const day = iso.slice(0, 10);
  const { from, to } = dateBounds(r, today);
  return (!from || day >= from) && (!to || day <= to);
};

const countOk = (v: number, r: CountRule | undefined) => !r || (r.op === "gte" ? v >= r.n : r.op === "lte" ? v <= r.n : v === r.n);

export function matchesQuick(p: Patient, q: QuickFilters | undefined, today: Date): boolean {
  if (!q) return true;
  const cov: CoverageChoice = coverage(p) ?? "unverified";
  if (!has(q.dealStatus, dealStatus(p))) return false;
  if (!has(q.stage, stageOf(p, today).id)) return false;
  if (!has(q.plan, planTag(p))) return false;
  if (!has(q.coverage, cov)) return false;
  if (!has(q.wipState, p.wipState)) return false;
  if (!has(q.callStage, p.callStage)) return false;
  if (!has(q.salesStatus, p.salesStatus)) return false;
  if (!has(q.classification, p.classification)) return false;
  if (!has(q.lengthOfNeed, p.lengthOfNeed)) return false;
  if (!has(q.owners, p.ownerId ?? "")) return false;
  if (!has(q.insurance, p.insuranceName)) return false;
  if (!has(q.state, p.state)) return false;
  if (q.mcr && p.mcr !== q.mcr) return false;
  if (q.va && (p.va ?? "NO") !== q.va) return false;
  if (!inRange(p.surgeryDate, q.surgery, today)) return false;
  if (!inRange(p.expectedCloseDate, q.expectedClose, today)) return false;
  if (!inRange(p.createdAt, q.created, today)) return false;
  if (!countOk(callCount(p), q.calls)) return false;
  if (q.estimate) {
    const total = estimateTotal(p);
    if (total === null || total === undefined) return false;
    if (q.estimate.op === "gte" ? total < q.estimate.amount : total > q.estimate.amount) return false;
  }
  if (q.age) {
    if (p.age === null) return false;
    if (q.age.min !== undefined && p.age < q.age.min) return false;
    if (q.age.max !== undefined && p.age > q.age.max) return false;
  }
  return true;
}

/* ---------------------------------------------------------------------------
   Editing helpers
   --------------------------------------------------------------------------- */

/** Drops empty sections so "nothing picked" and "section absent" look the same. */
export function cleanQuick(q: QuickFilters): QuickFilters {
  const out: QuickFilters = {};
  for (const [k, v] of Object.entries(q) as [QuickKey, unknown][]) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (k === "age") {
      const a = v as QuickFilters["age"];
      if (a?.min === undefined && a?.max === undefined) continue;
    }
    (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

export const activeQuickKeys = (q: QuickFilters | undefined): QuickKey[] => Object.keys(cleanQuick(q ?? {})) as QuickKey[];

export function sameQuick(a: QuickFilters | undefined, b: QuickFilters | undefined) {
  return JSON.stringify(sortKeys(cleanQuick(a ?? {}))) === JSON.stringify(sortKeys(cleanQuick(b ?? {})));
}
const sortKeys = (o: object) => Object.fromEntries(Object.entries(o).sort(([x], [y]) => x.localeCompare(y)));

/* ---------------------------------------------------------------------------
   Labels (drawer sections and the chip row above the board)
   --------------------------------------------------------------------------- */

export const QUICK_LABELS: Record<QuickKey, string> = {
  dealStatus: "Status",
  stage: "Stage",
  plan: "Plan",
  coverage: "Coverage",
  wipState: "WIP state",
  callStage: "Call stage",
  salesStatus: "Sales status",
  classification: "Classification",
  lengthOfNeed: "Length of need",
  owners: "Coordinator",
  insurance: "Insurance",
  state: "State",
  mcr: "MCR",
  va: "VA",
  surgery: "Surgery",
  expectedClose: "Expected close",
  created: "Created",
  calls: "Calls made",
  estimate: "Estimate",
  age: "Age",
};

export const COVERAGE_CHOICE_LABELS: Record<CoverageChoice, string> = {
  covered: "In network",
  partial: "Partial self pay",
  selfpay: "Self pay",
  unverified: "Not verified yet",
};

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  past: "Passed",
  today: "Today",
  next7: "Next 7 days",
  next30: "Next 30 days",
  last7: "Last 7 days",
  last30: "Last 30 days",
  custom: "Custom range",
};

const COUNT_OP_LABELS = { gte: "at least", lte: "at most", eq: "exactly" } as const;

const fmtDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
};

const dateText = (r: DateRange) => {
  if (r.preset !== "custom") return DATE_PRESET_LABELS[r.preset].toLowerCase();
  if (r.from && r.to) return `${fmtDay(r.from)} – ${fmtDay(r.to)}`;
  if (r.from) return `on or after ${fmtDay(r.from)}`;
  if (r.to) return `on or before ${fmtDay(r.to)}`;
  return "any date";
};

const list = (vs: string[]) => (vs.length <= 2 ? vs.join(", ") : `${vs.slice(0, 2).join(", ")} +${vs.length - 2}`);

/** Short value text for one section's chip, e.g. "Medicare, MCR ADV" or "at least 3". */
export function quickValueText(
  k: QuickKey,
  q: QuickFilters,
  names: { stage: (id: StageId) => string; user: (id: string) => string },
): string {
  switch (k) {
    case "dealStatus":
      return list(q.dealStatus!.map((s) => DEAL_STATUS_LABELS[s]));
    case "stage":
      return list(q.stage!.map(names.stage));
    case "coverage":
      return list(q.coverage!.map((c) => COVERAGE_CHOICE_LABELS[c]));
    case "owners":
      return list(q.owners!.map((id) => (id ? names.user(id) : "Unassigned")));
    case "wipState":
      return list(q.wipState!.map((s) => s.split(" ").slice(0, 3).join(" ")));
    case "plan":
    case "callStage":
    case "salesStatus":
    case "classification":
    case "insurance":
    case "state":
      return list(q[k]!);
    case "lengthOfNeed":
      return list(q.lengthOfNeed!.map((d) => `${d} days`));
    case "mcr":
    case "va":
      return q[k] === "YES" ? "Yes" : "No";
    case "surgery":
    case "expectedClose":
    case "created":
      return dateText(q[k]!);
    case "calls":
      return `${COUNT_OP_LABELS[q.calls!.op]} ${q.calls!.n}`;
    case "estimate":
      return `${q.estimate!.op === "gte" ? "at or above" : "at or below"} $${q.estimate!.amount.toLocaleString("en-US")}`;
    case "age": {
      const { min, max } = q.age!;
      if (min !== undefined && max !== undefined) return `${min}–${max}`;
      return min !== undefined ? `${min}+` : `up to ${max}`;
    }
  }
}

/** List-column field → the drawer section that filters it (for the column header's funnel). */
export const FIELD_TO_QUICK: Record<string, QuickKey> = {
  dealStatus: "dealStatus",
  stage: "stage",
  daysOut: "stage",
  planTag: "plan",
  planType: "plan",
  coverage: "coverage",
  payerType: "coverage",
  wipState: "wipState",
  callStage: "callStage",
  salesStatus: "salesStatus",
  classification: "classification",
  lengthOfNeed: "lengthOfNeed",
  owner: "owners",
  insuranceName: "insurance",
  state: "state",
  mcr: "mcr",
  va: "va",
  surgeryDate: "surgery",
  expectedCloseDate: "expectedClose",
  createdAt: "created",
  callAttempts: "calls",
  financialEstimate: "estimate",
  age: "age",
};
