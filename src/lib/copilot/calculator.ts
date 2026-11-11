/**
 * Call pricing: what the patient owes and what to collect today. Port of the Base44 PricingCalculator
 * math, rewritten as one pure function of the patient record plus the few decisions made on the call.
 *
 * Inputs come from the record, not the rep:
 *   - each line's status and estimated responsibility: estimateLines() (EVA estimate)
 *   - self-pay prices: SELF_PAY rate card for the patient's treatment plan length
 *   - plan type, surgery date, logistics
 * The rep only decides: Medicaid secondary / hip / gap exception (not on the record yet), out-of-network
 * route, payment method, FHA discount and payment plan.
 *
 * All money is integer cents. Fixes vs Base44: one price table, no lines dropped from self-pay totals,
 * one payment-method value instead of six booleans, FHA discounts only the self-pay share, installments
 * add up to the total exactly.
 */
import { daysBetween, parseISODate, startOfToday, addDays } from "../dates";
import { allowable, planType, estimateLines, logisticsType } from "../derive";
import { SELF_PAY, treatmentDays, type TreatmentDays } from "../rates";
import type { EstimateLineKey, EstimateStatus, LogisticsType, Patient } from "../types";
import { resolveScenario, type Insurance, type Scenario } from "./scenario";

export const LINE_KEYS: EstimateLineKey[] = ["dme", "rtm", "ot"];
export type Group = "dme" | "therapy";
export const groupOf = (k: EstimateLineKey): Group => (k === "dme" ? "dme" : "therapy");

/** Card hold taken when the patient keeps a card on file instead of paying the estimate (scripts' "$25 deposit"). */
export const CARD_HOLD_CENTS = 2500;
/** Traditional Medicare needs a session within 48 hours of surgery; past this many days after surgery the window is gone. */
export const MEDICARE_WINDOW_DAYS = 2;
export const FHA_OPTIONS = [0, 25, 50, 75, 100] as const;
export type FhaPercent = (typeof FHA_OPTIONS)[number];
export const MAX_MONTHS = 12;

/** What the patient agrees to pay. */
export type PaymentMethod =
  /** The patient portion: insurance lines at the estimate, self-pay lines at the self-pay price. */
  | "estimate"
  /** Only the lines that aren't going through insurance (manager approval). */
  | "self_pay_portion"
  /** Whole program at the self-pay price, no insurance. */
  | "full_self_pay"
  /**
   * Nothing charged today: the card is kept on file (with a $25 hold, none for a gap exception) and charged
   * once insurance decides. Offered whenever every service goes through insurance (in network, out of network,
   * pending auth, or any mix); never when any service is self pay. The only choice for a gap exception or $0 estimate.
   */
  | "card_on_file"
  /** Nothing agreed today (VA pending, Medicaid secondary, gap exception pending). */
  | "none";

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  estimate: "EPR + Self-pay amount",
  self_pay_portion: "Self-pay portion only",
  full_self_pay: "Full self-pay",
  card_on_file: "Card on file",
  none: "Nothing today",
};

/** The label for one call: just "EPR" when no service is self pay. */
export const methodLabel = (m: PaymentMethod, c: { selfPayPortion: number }): string =>
  m === "estimate" && c.selfPayPortion === 0 ? "EPR" : METHOD_LABELS[m];

/** How the patient pays it (Base44's payment option). */
export type PaymentOption =
  /** The whole amount today. */
  | "upfront"
  /** Monthly instalments; the first is taken today. */
  | "plan"
  /** Not picked by the rep: set automatically when "Patient pays" is Card on file. */
  | "card_on_file";

export const PAYMENT_LABELS: Record<PaymentOption, string> = {
  upfront: "Paid in full upfront",
  plan: "Monthly plan",
  card_on_file: "Card on file",
};

export interface CallOptions {
  medicaid: boolean;
  hip: boolean;
  gapException: boolean;
  /** For an out-of-network group: bill insurance (default) or take the self-pay price instead. */
  oonSelfPay: Record<Group, boolean>;
  /** null → the default for the scenario. */
  method: PaymentMethod | null;
  /** null → the default for the scenario. */
  payment: PaymentOption | null;
  fha: FhaPercent;
  /** Number of monthly payments when `payment` is "plan" (2–12). */
  months: number;
}

export const DEFAULT_OPTIONS: CallOptions = {
  medicaid: false,
  hip: false,
  gapException: false,
  oonSelfPay: { dme: false, therapy: false },
  method: null,
  payment: null,
  fha: 0,
  months: 3,
};

export interface LineCalc {
  key: EstimateLineKey;
  /** Status on the record. */
  recordStatus: EstimateStatus;
  /** Status after hip / missed window. */
  status: EstimateStatus;
  /** What the patient owes for this line on the route chosen (estimate, or self-pay price). */
  owe: number;
  /** Estimated responsibility through insurance (null for self-pay lines). */
  estimate: number | null;
  /** What insurance is expected to pay: the payer's allowable minus the patient portion (0 when paid at self-pay). */
  insurance: number;
  selfPay: number;
  /** Collected at the self-pay price (not covered, or out of network and patient chose self-pay). */
  viaSelfPay: boolean;
}

export interface GroupCalc {
  status: EstimateStatus;
  owe: number;
  estimate: number;
  selfPay: number;
}

export interface Calc {
  /** False until the estimate exists (WIP 13 / 15); only the non-money scripts are usable before then. */
  ready: boolean;
  insurance: Insurance;
  days: TreatmentDays;
  daysToSurgery: number;
  missedWindow: boolean;
  /** Year the treatment plan runs into, if it crosses 1 January (for the "keeping your insurance?" question). */
  nextYear: number | null;
  logistics: LogisticsType;
  lines: Record<EstimateLineKey, LineCalc>;
  groups: Record<Group, GroupCalc>;
  /** Total patient responsibility on the chosen routes (the patient portion). */
  totalEpr: number;
  /** Total insurance is expected to pay on the chosen routes (the insurance portion). */
  totalInsurance: number;
  /** Whole program at self-pay prices. */
  totalSelfPay: number;
  /** Self-pay price of the lines collected at self-pay. */
  selfPayPortion: number;
  /** What the patient would owe if insurance denies every insured line. */
  ifDenied: number;
  scenario: Scenario | null;
  methods: PaymentMethod[];
  method: PaymentMethod;
  /** How the patient can pay (upfront or plan); empty for card on file or when nothing is collected. The first is the default. */
  paymentOptions: PaymentOption[];
  payment: PaymentOption | null;
  cardOnFile: boolean;
  /** Card hold taken with card on file ($25, or $0 for a gap exception). Not money collected. */
  hold: number;
  agreedBeforeFha: number;
  fhaSavings: number;
  /** Total the patient agrees to pay (after FHA). */
  agreed: number;
  /**
   * Money taken today: the full amount when paid upfront, otherwise 0. A monthly plan's first payment isn't
   * always taken on the call, so it isn't counted here; instalments are recorded with "Payment collected".
   * A card hold doesn't count either.
   */
  collectedToday: number;
  /** Monthly payments in order (plan only, adding up to `agreed`); one entry otherwise. */
  installments: number[];
}

const cents = (dollars: number) => Math.round(dollars * 100);

export function insuranceOf(p: Patient): Insurance {
  const t = planType(p);
  if (t === "Medicare") return "medicare";
  if (t === "Medicare Advantage") return "medicare_advantage";
  if (t === "VA") return "va";
  return "commercial"; // Commercial and Worker's Comp
}

/**
 * RTM + OT as one "therapy portion" for script choice (the scripts were written for one therapy line).
 * When they differ, the status that needs the most explaining wins: pending, then out of network, then
 * self pay (so a self-pay RTM next to a covered OT still gets a script that covers the self-pay portion).
 */
const THERAPY_RANK: EstimateStatus[] = ["pending_auth", "oon", "self_pay", "covered"];
const STATUS_WORDS: Record<EstimateStatus, string> = { covered: "in network", oon: "out of network", self_pay: "self pay", pending_auth: "pending auth" };
const combine = (a: EstimateStatus, b: EstimateStatus) => (THERAPY_RANK.indexOf(a) <= THERAPY_RANK.indexOf(b) ? a : b);

/** Splits a total into `n` payments that add up exactly; any odd cents go on the first payment. */
export function installments(total: number, n: number): number[] {
  const count = Math.max(1, Math.min(MAX_MONTHS, Math.floor(n)));
  const base = Math.floor(total / count);
  const out = Array.from({ length: count }, () => base);
  out[0] += total - base * count;
  return out;
}

export function calculate(p: Patient, opts: CallOptions, today = startOfToday()): Calc {
  const insurance = insuranceOf(p);
  const days = treatmentDays(p.lengthOfNeed);
  const surgery = parseISODate(p.surgeryDate);
  const daysToSurgery = daysBetween(today, surgery);
  const missedWindow = insurance === "medicare" && daysToSurgery <= -MEDICARE_WINDOW_DAYS;
  const end = addDays(surgery, days);
  const nextYear = end.getFullYear() > surgery.getFullYear() ? end.getFullYear() : null;
  const record = estimateLines(p);
  const ready = LINE_KEYS.every((k) => record[k].amount !== null || record[k].status === "self_pay");
  const isMedicare = insurance === "medicare";

  const lines = {} as Record<EstimateLineKey, LineCalc>;
  for (const k of LINE_KEYS) {
    const r = record[k];
    let status = r.status;
    if (isMedicare && missedWindow) status = "self_pay";
    else if (isMedicare && opts.hip && k === "dme") status = "self_pay";
    const selfPay = cents(SELF_PAY[k][days]);
    const estimate = status === "self_pay" ? null : cents(r.amount ?? 0);
    const viaSelfPay = status === "self_pay" || (status === "oon" && opts.oonSelfPay[groupOf(k)]);
    const owe = viaSelfPay ? selfPay : estimate!;
    const insurance = viaSelfPay ? 0 : Math.max(0, cents(allowable(p, k, status)) - owe);
    lines[k] = { key: k, recordStatus: r.status, status, estimate, insurance, selfPay, viaSelfPay, owe };
  }

  // A group's "estimate" is what its insured lines are expected to cost and its "self-pay" is the price of
  // its self-pay lines; when none of its lines are on that route, the whole group is used instead.
  const sum = (ls: LineCalc[], f: (l: LineCalc) => number) => ls.reduce((s, l) => s + f(l), 0);
  const group = (keys: EstimateLineKey[]): GroupCalc => {
    const ls = keys.map((k) => lines[k]);
    const insured = ls.filter((l) => l.estimate !== null);
    const viaSelfPay = ls.filter((l) => l.viaSelfPay);
    return {
      status: ls.map((l) => l.status).reduce(combine),
      owe: sum(ls, (l) => l.owe),
      estimate: insured.length ? sum(insured, (l) => l.estimate!) : sum(ls, (l) => l.selfPay),
      selfPay: sum(viaSelfPay.length ? viaSelfPay : ls, (l) => l.selfPay),
    };
  };
  const groups: Record<Group, GroupCalc> = { dme: group(["dme"]), therapy: group(["rtm", "ot"]) };

  const all = LINE_KEYS.map((k) => lines[k]);
  const totalEpr = all.reduce((s, l) => s + l.owe, 0);
  const totalInsurance = all.reduce((s, l) => s + l.insurance, 0);
  const totalSelfPay = all.reduce((s, l) => s + l.selfPay, 0);
  const selfPayPortion = all.filter((l) => l.viaSelfPay).reduce((s, l) => s + l.selfPay, 0);
  const ifDenied = totalSelfPay;
  const anyInsured = all.some((l) => !l.viaSelfPay);

  const resolved = ready
    ? resolveScenario({
        insurance,
        dme: groups.dme.status,
        therapy: groups.therapy.status,
        totalEpr,
        daysToSurgery,
        medicaid: isMedicare && opts.medicaid,
        hip: isMedicare && opts.hip,
        gapException: opts.gapException,
        missedWindow,
      })
    : null;
  const mixedTherapy = lines.rtm.status !== lines.ot.status;
  const scenario: Scenario | null =
    resolved && mixedTherapy && !resolved.approximate && resolved.key !== "va_pending"
      ? {
          ...resolved,
          approximate: `RTM is ${STATUS_WORDS[lines.rtm.status]} and OT is ${STATUS_WORDS[lines.ot.status]}. The scripts treat therapy as one portion, so quote the amounts from the calculator.`,
        }
      : resolved;
  const key = scenario?.key;

  // What the patient can agree to pay; the first is the default.
  const gap = key === "gap_exception" || key === "gap_exception_60_plus";
  const zero = key === "zero_epr" || key === "medicare_zero_epr";
  // Card on file ($25 hold) is offered only when no service is self pay; for a gap exception or $0 estimate it's the only choice.
  const noneSelfPay = all.every((l) => !l.viaSelfPay);
  let methods: PaymentMethod[];
  if (!ready || key === "va_pending" || key === "medicare_medicaid") methods = ["none"];
  else if (gap || zero) methods = ["card_on_file"];
  else if (!anyInsured) methods = ["full_self_pay"];
  else {
    methods = ["estimate"];
    if (selfPayPortion > 0) methods.push("self_pay_portion");
    methods.push("full_self_pay");
    if (noneSelfPay) methods.push("card_on_file");
  }
  const method = opts.method && methods.includes(opts.method) ? opts.method : methods[0];

  // Agreed amount, split into the self-pay share (FHA applies) and the insurance-estimate share (it doesn't).
  let selfPayShare = 0;
  let insuranceShare = 0;
  if (method === "estimate") {
    selfPayShare = selfPayPortion;
    insuranceShare = totalEpr - selfPayPortion;
  } else if (method === "self_pay_portion") selfPayShare = selfPayPortion;
  else if (method === "full_self_pay") selfPayShare = totalSelfPay;
  const fhaSavings = Math.round((selfPayShare * opts.fha) / 100);
  const agreedBeforeFha = selfPayShare + insuranceShare;
  const agreed = agreedBeforeFha - fhaSavings;

  // How they pay it: upfront or monthly. Card on file has no payment step; nothing to collect means no options.
  const onFile = method === "card_on_file";
  const paymentOptions: PaymentOption[] = method === "none" || onFile || agreed === 0 ? [] : ["upfront", "plan"];
  const payment: PaymentOption | null = onFile ? "card_on_file" : opts.payment && paymentOptions.includes(opts.payment) ? opts.payment : (paymentOptions[0] ?? null);

  const hold = onFile ? (gap ? 0 : CARD_HOLD_CENTS) : 0;
  const plan = payment === "plan" ? installments(agreed, Math.max(2, opts.months)) : [agreed];
  // Card on file: the $25 hold is collected today.
  const collectedToday = payment === "upfront" ? agreed : hold;
  const cardOnFile = payment === "card_on_file" || key === "medicare_covered" || key === "medicare_zero_epr" || gap;

  return {
    ready,
    insurance,
    days,
    daysToSurgery,
    missedWindow,
    nextYear,
    logistics: logisticsType(p),
    lines,
    groups,
    totalEpr,
    totalInsurance,
    totalSelfPay,
    selfPayPortion,
    ifDenied,
    scenario,
    methods,
    method,
    paymentOptions,
    payment,
    cardOnFile,
    hold,
    agreedBeforeFha,
    fhaSavings,
    agreed,
    collectedToday,
    installments: plan,
  };
}

export const formatCents = (c: number) =>
  (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: c % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 });

/** Always shows cents ($25.00): for amounts collected. */
export const formatCentsExact = (c: number) =>
  (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
