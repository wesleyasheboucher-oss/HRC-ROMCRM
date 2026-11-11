import type { QuickFilters } from "./quickFilters";

// Core domain types for the ROMCRM Deals Pipeline POC.
// These mirror the BRD "Data requirements" section and are intended to be
// lifted into the production API contract largely as-is.

export type Role = "coordinator" | "manager" | "admin";

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  teamId: string | null;
  /** HRCs only: an HRC works one line, Ortho or Cardiac, and only that line's Lead Stream assigns to them. */
  line?: Line;
}

export interface Team {
  id: string;
  name: string;
}

export type PayerType = "medicare" | "commercial" | "selfpay" | "other";

export type StageId = "passed" | "d0_3" | "d4_7" | "d8_14" | "d15_21" | "d22";

export interface HistoryEvent {
  id: string;
  at: string; // ISO datetime
  by: string; // display name, e.g. "Intake API" or a user's name
  text: string;
}

export type ActivityType = "call" | "email" | "text" | "note";

/** A logged or scheduled touchpoint with the patient. */
export interface Activity {
  id: string;
  type: ActivityType; // primary channel (first of `channels`)
  /** Every channel used, e.g. ["call", "text"]. Optional for older records: falls back to [type]. */
  channels?: ActivityType[];
  summary: string;
  outcome?: string; // calls only, e.g. "Left voicemail"
  at: string; // ISO datetime: when it happened, or when it's due if scheduled
  by: string; // display name of who logged / scheduled it
  assigneeId?: string; // scheduled only
  scheduled: boolean; // true = planned, not done yet
}

/** Coverage result for one estimate line: covered in network, covered out of network, self pay, or pending authorization. */
export type EstimateStatus = "covered" | "oon" | "self_pay" | "pending_auth";
export type EstimateLineKey = "dme" | "rtm" | "ot";
export interface EstimateLine {
  status: EstimateStatus;
  amount: number | null;
}

export interface Task {
  title: string;
  due: string; // ISO date
  assigneeId: string;
  done: boolean;
}

export type LogisticsType = "BTX" | "DME" | "AIT";

/**
 * An iOMS order (a "deal" in Pipedrive), with its patient. Field names follow the PCSP section labels.
 * `wipState` and `salesStatus` are the Brightree / Pipedrive fields and stay alongside the iOMS status.
 */
export interface Patient {
  id: string; // "ID" field
  firstName: string; // "Patient Name"
  lastName: string;
  ownerId: string | null;
  callStage: string;
  wipState: string;
  salesStatus: string;
  btPatientId: string;
  btOrderId: string;
  state: string;
  lengthOfNeed: string;
  age: number | null;
  classification: string;
  doctorNotes: string;
  physicianName: string;
  iomsOrderId: string;
  mcr: "YES" | "NO";
  /** Veteran (VA) patient. Optional so older saved demo data still loads (treated as "NO"). */
  va?: "YES" | "NO";
  insuranceName: string;
  homePhone: string;
  mobilePhone: string;
  secondaryPhone: string;
  selfPayChargeDate: string; // ISO date or ""
  agreedSelfPayAmount: number | null;
  surgeryDate: string; // ISO date
  expectedCloseDate: string; // ISO date
  // New in ROMCRM (not in Pipedrive)
  financialEstimate: number | null;
  /** How the equipment gets to the patient. Optional so older saved demo data still loads; see logisticsType(). */
  logisticsType?: LogisticsType;
  /** DME / RTM / OT breakdown; the total estimate is their sum. Optional: derived from financialEstimate when absent. */
  estimate?: Record<EstimateLineKey, EstimateLine>;
  /** Number of outbound call attempts. Optional so older saved demo data still loads; see callCount(). */
  callAttempts?: number;
  /** iOMS prime status (see orderStatus.ts). Optional so older saved data still loads: read it with primeStatusOf(). */
  primeStatus?: string;
  /** One of the prime status's substatuses. Optional, as above: substatusOf(). */
  substatus?: string;
  /** When the status last changed, ISO datetime. Optional, as above. */
  statusChangedAt?: string;
  /** Product line. Optional, as above: lineOf() falls back to Classification. */
  line?: "ortho" | "cardiac";
  createdAt: string; // ISO datetime
  createdBy: string;
  nextTask: Task | null;
  /** Optional so older saved demo data still loads. */
  activities?: Activity[];
  /** Results saved from the Call Co-Pilot tab, newest first. Optional so older saved demo data still loads. */
  callResults?: CallResult[];
  history: HistoryEvent[];
}

export type CallOutcome = "won" | "lost" | "payment_collected";

/**
 * One saved call result (Base44 "CalculatorResult"). A snapshot of what was agreed on the call, so it
 * stays accurate even if the estimate on the record changes later. Money is in cents.
 */
export interface CallResult {
  id: string;
  at: string; // ISO datetime
  byId: string;
  by: string; // display name
  outcome: CallOutcome;
  /** IOMS order ID from the record (replaces typing the ORT number in Base44). */
  orderId: string;
  insurance: "medicare" | "medicare_advantage" | "commercial" | "va";
  /** Which outcome script was on screen, e.g. "commercial_covered". */
  scenarioKey: string | null;
  /** ABN (Traditional Medicare) or Patient Responsibility Form confirmed signed. Won results always have one. */
  formSigned: "abn" | "prf" | null;
  lines: Record<EstimateLineKey, { status: EstimateStatus; viaSelfPay: boolean; estimateCents: number | null; insuranceCents: number; selfPayCents: number }>;
  /** Patient portion. */
  totalEprCents: number;
  /** Insurance portion (payer allowable minus the patient portion). */
  totalInsuranceCents: number;
  totalSelfPayCents: number;
  /** What the patient agreed to pay. null for lost and payment-only. */
  paymentMethod: "estimate" | "self_pay_portion" | "full_self_pay" | "card_on_file" | "none" | null;
  /** How they pay it. null for lost, or when nothing was collected (VA, Medicaid secondary). */
  paymentOption: "upfront" | "plan" | "card_on_file" | null;
  fhaPercent: number;
  /** Number of monthly payments (1 unless on a plan). */
  months: number;
  /** Total the patient agreed to pay (after FHA). 0 for card on file: nothing firm was agreed. */
  amountAgreedCents: number;
  /** Money taken today, including a card-on-file hold (collectedAs "card_hold"). */
  amountCollectedCents: number;
  /** How today's money was taken: paid in full, a plan instalment, or a card hold. null when nothing was taken. */
  collectedAs: "upfront" | "installment" | "card_hold" | null;
  /** Card on file: hold placed today ($25, or $0 for a gap exception). Optional so older saved results still load. */
  holdCents?: number;
  /** LOST only: reason and subcategory picked on the lost-reason wheel. Optional so older saved results still load. */
  lostReason?: string;
  lostSubReason?: string;
  note: string;
}

/** Payment type on a conversion (Notion: paid in full upfront, payment plan, card on file, none). */
export type ConversionPaymentType = "paid_in_full_upfront" | "payment_plan" | "card_on_file" | "none";

/**
 * One row in the conversions table: a WON or LOST decision on an order. Rows are never edited; a later
 * outcome adds a new row, and the order's current outcome is its newest row that isn't voided.
 * Deleting the call result it came from voids the row (who and when) instead of removing it. Money is in cents.
 */
export interface Conversion {
  /** Unique conversion ID, e.g. CNV-000123 */
  id: string;
  /** iOMS order ID */
  orderId: string;
  patientId: string;
  outcome: "won" | "lost";
  /** The WON / LOST date (ISO datetime) */
  decidedAt: string;
  /** The HRC who won or lost it (who saved the result) */
  hrcId: string;
  hrcName: string;
  /** EPR / estimate: the patient portion on the call */
  eprCents: number;
  paymentType: ConversionPaymentType;
  /** Collected upfront on the call: paid in full, or the card-on-file hold */
  collectedUpfrontCents: number;
  /** Total of the installment plan (0 unless on a plan) */
  installmentCents: number;
  /** Number of monthly payments on the plan (0 unless on a plan) */
  installmentMonths: number;
  /** The saved call result this row came from */
  callResultId: string;
  /** Lost only, from the lost-reason wheel */
  lostReason?: string;
  lostSubReason?: string;
  /** Set when the call result was deleted; voided rows don't count as the current outcome */
  voided?: { at: string; byId: string; by: string };
}

export type Operator =
  | "is"
  | "is_not"
  | "starts_with"
  | "contains"
  | "gt"
  | "lt"
  | "is_empty"
  | "is_not_empty";

export interface Condition {
  id: string;
  field: string; // key in FIELD_REGISTRY
  operator: Operator;
  value: string; // "@me" is a token for "the coordinator whose board is being viewed"
}

export interface SavedFilter {
  id: string;
  name: string;
  /** null = system-defined standard view (F-01) */
  createdById: string | null;
  visibility: "private" | "shared";
  all: Condition[];
  any: Condition[];
  /** Sectioned filters from the Filters drawer, applied on top of the conditions. Optional so older saved views still load. */
  quick?: QuickFilters;
  /** Standard views are always shown first in a fixed order and can't be unpinned (F-02). */
  standard?: boolean;
}

/** Admin-pushed view assignment (F-03). */
export interface ViewAssignment {
  filterId: string;
  userIds: string[];
  teamIds: string[];
}

export interface UserPrefs {
  /** Ordered list of pinned (non-standard) filter IDs shown as tabs. */
  pinnedFilterIds: string[];
  /** Ordered list of field keys shown on board cards (D-15). */
  cardFields: string[];
  /** Ordered list of columns in the list view. Optional so older saved prefs still load (defaults apply). */
  listColumns?: string[];
  /** Columns on the All Orders list (its own set: status columns lead). Optional, as above. */
  ordersColumns?: string[];
  sort: { field: string; dir: "asc" | "desc" };
}

export type Line = "ortho" | "cardiac";

/** Order types an HRC takes on one Lead Stream page. All on by default; unticking one means they never receive it. */
export interface OrderTypes {
  payer: PayerType[];
  /** Takes VA (veteran) orders. VA sits on top of payer type. */
  va: boolean;
  logistics: LogisticsType[];
}

/**
 * Lead Stream rule for one HRC (A-01..A-05). Ortho and Cardiac are separate pages; an HRC works one line,
 * so each HRC has exactly one rule, on their own line's page.
 */
export interface AssignmentRule {
  userId: string;
  line: Line;
  active: boolean;
  /** Whole number, default 1. Share of new orders = weight ÷ total weight of the HRCs eligible for that order. */
  weight: number;
  /** Daily lead cap: no more than this many orders newly assigned per day on this line. */
  dailyMax: number;
  orderTypes: OrderTypes;
  /** If an order matches ANY of these conditions, this HRC is excluded from receiving it. */
  exclusions: Condition[];
}

/** The shape saved before weights and order types (migrated on load by migrateRules in assignment.ts). */
export interface LegacyAssignmentRule {
  userId: string;
  active: boolean;
  percentage: number;
  dailyMax: number;
  leadTypes: PayerType[];
  acceptsVa?: boolean;
  exclusions: Condition[];
}

/** One entry in a line's assignment log. */
export interface AssignmentLogEntry {
  id: string;
  at: string;
  patientId: string;
  patientName: string;
  leadType: PayerType;
  /** Optional so older saved log entries still load (treated as ortho, auto). */
  line?: Line;
  /**
   * auto: assigned by weight and cap when the order entered Patient Sales · Ready for Conversion (counts toward the cap)
   * kept: entered with an owner already, who kept it · unassigned: nobody eligible · reassign: changed by a manager
   */
  kind?: "auto" | "kept" | "unassigned" | "reassign";
  assignedToId: string | null;
  reason: string;
}
