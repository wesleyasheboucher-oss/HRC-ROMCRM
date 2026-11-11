/**
 * Saving the result of a call: port of Base44's Save Result card (WON / LOST, form signed, summary,
 * "Save Result & Copy Summary") and its Quick Payment modal.
 *
 * Changes from Base44:
 *  - The order ID comes from the record (IOMS order ID); the rep doesn't type the ORT number.
 *  - The result is stored on the patient (with an Activity entry) instead of a separate table.
 *  - Amounts are a snapshot of the calculator in cents, so they add up and don't drift.
 *  - A second save of the same result within 24 hours asks for confirmation instead of failing silently.
 */
import { ESTIMATE_LINES } from "../fields";
import type { Activity, CallOutcome, CallResult, Patient } from "../types";
import { formatCents, formatCentsExact, LINE_KEYS, type Calc, type CallOptions } from "./calculator";
import type { LostReason } from "../lostReasons";
import { buildNote } from "./note";

export const OUTCOME_LABELS: Record<CallOutcome, string> = {
  won: "Won",
  lost: "Lost",
  payment_collected: "Payment collected",
};

export const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** ABN for Traditional Medicare, Patient Responsibility Form for everyone else (as in Base44). */
export const formFor = (c: Calc): "abn" | "prf" => (c.insurance === "medicare" ? "abn" : "prf");
export const FORM_LABELS = { abn: "ABN", prf: "Patient Responsibility Form" } as const;

/** Why WON can't be saved yet, or null when it can. */
export function wonBlocker(c: Calc, formSigned: boolean): string | null {
  if (!c.ready) return "There's no verified estimate yet, so there's nothing to agree to.";
  if (!formSigned) return `Confirm the ${FORM_LABELS[formFor(c)]} was signed first.`;
  return null;
}

/** Money taken today for a won call: the full amount when paid upfront, or the card hold for card on file. Plan instalments aren't counted. */
export const collectedToday = (c: Calc): number => c.collectedToday;

/** How today's amount is recorded. */
export function collectedAs(c: Calc): CallResult["collectedAs"] {
  if (c.payment === "upfront") return c.agreed > 0 ? "upfront" : null;
  if (c.payment === "card_on_file") return c.hold > 0 ? "card_hold" : null;
  return null;
}

export const COLLECTED_AS_LABELS = { upfront: "Upfront", installment: "Installment", card_hold: "Card hold" } as const;

/** The summary the rep can edit before saving. */
export interface PaymentOnly {
  cents: number;
  as: "upfront" | "installment";
  /** Plan length for an installment. */
  months: number;
}

export function defaultSummary(outcome: CallOutcome, p: Patient, c: Calc, o: CallOptions, scriptTitle: string | undefined, formSigned: boolean, payment?: PaymentOnly, lost?: LostReason | null): string {
  if (outcome === "payment_collected") {
    const amount = payment?.cents ?? 0;
    const how = payment?.as === "installment" ? `installment on a ${payment.months}-month plan` : "paid in full upfront";
    return [`Result: PAYMENT COLLECTED`, `Payment collected: ${formatCents(amount)} (${how})`, `Order: ${p.iomsOrderId || "—"}`].join("\n");
  }
  if (outcome === "lost") {
    return [`Result: LOST`, `Plan: ${p.insuranceName || "No payer"} · Est. ${formatCents(c.totalEpr)} · Self-pay ${formatCents(c.totalSelfPay)}`, `Reason: ${lost ? `${lost.reason} - ${lost.sub}` : ""}`].join("\n");
  }
  const head = [`Result: WON`];
  if (formSigned) head.push(`${FORM_LABELS[formFor(c)]} signed.`);
  const as = collectedAs(c);
  if (as === "card_hold") head.push(`Collected today: ${formatCentsExact(c.collectedToday)} · card on file with a ${formatCents(c.hold)} hold`);
  else if (as) head.push(`Collected today: ${formatCentsExact(c.collectedToday)} (${COLLECTED_AS_LABELS[as].toLowerCase()})`);
  else if (c.payment === "card_on_file") head.push(`Collected today: $0.00 · card on file, no hold`);
  return [...head, buildNote(p, c, o, scriptTitle)].join("\n");
}

/** A result of the same kind already saved for this patient in the last 24 hours (Base44's duplicate guard). */
export function recentDuplicate(p: Patient, outcome: CallOutcome, now = new Date()): CallResult | null {
  return (p.callResults ?? []).find((r) => r.outcome === outcome && now.getTime() - new Date(r.at).getTime() < DUPLICATE_WINDOW_MS) ?? null;
}

export interface SaveInput {
  outcome: CallOutcome;
  patient: Patient;
  calc: Calc;
  opts: CallOptions;
  formSigned: boolean;
  note: string;
  user: { id: string; name: string };
  /** Payment collected only. */
  payment?: PaymentOnly;
  /** Lost only. */
  lost?: LostReason | null;
  now?: Date;
}

export function buildResult(i: SaveInput): CallResult {
  const { calc: c, outcome } = i;
  const now = i.now ?? new Date();
  const won = outcome === "won";
  const lines = Object.fromEntries(
    LINE_KEYS.map((k) => {
      const l = c.lines[k];
      return [k, { status: l.status, viaSelfPay: l.viaSelfPay, estimateCents: l.estimate, insuranceCents: l.insurance, selfPayCents: l.selfPay }];
    }),
  ) as CallResult["lines"];
  const paid = outcome === "payment_collected" ? Math.max(0, Math.round(i.payment?.cents ?? 0)) : 0;
  const installment = outcome === "payment_collected" && i.payment?.as === "installment";
  return {
    id: `res_${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    at: now.toISOString(),
    byId: i.user.id,
    by: i.user.name,
    outcome,
    orderId: i.patient.iomsOrderId,
    insurance: c.insurance,
    scenarioKey: c.scenario?.key ?? null,
    formSigned: i.formSigned ? formFor(c) : null,
    lines,
    totalEprCents: c.totalEpr,
    totalInsuranceCents: c.totalInsurance,
    totalSelfPayCents: c.totalSelfPay,
    paymentMethod: won ? c.method : null,
    paymentOption: won ? c.payment : outcome === "payment_collected" ? (installment ? "plan" : "upfront") : null,
    fhaPercent: won ? i.opts.fha : 0,
    months: won ? c.installments.length : installment ? Math.max(2, i.payment!.months) : 1,
    amountAgreedCents: won ? c.agreed : paid,
    amountCollectedCents: won ? c.collectedToday : paid,
    collectedAs: won ? collectedAs(c) : outcome === "payment_collected" && paid > 0 ? (installment ? "installment" : "upfront") : null,
    ...(won && c.payment === "card_on_file" ? { holdCents: c.hold } : {}),
    ...(outcome === "lost" && i.lost ? { lostReason: i.lost.reason, lostSubReason: i.lost.sub } : {}),
    note: i.note.trim(),
  };
}

/** Patient patch for a saved result: the result itself plus an Activity entry with the summary. */
export function savePatch(p: Patient, r: CallResult): { patch: Partial<Patient>; history: string } {
  const activity: Activity = {
    id: `act_${r.id}`,
    type: "note",
    channels: ["note"],
    // The summary normally starts with "Result: …"; label it if the rep removed that line
    summary: /^Result:/i.test(r.note) ? r.note : `Result: ${OUTCOME_LABELS[r.outcome].toUpperCase()}\n${r.note}`,
    by: r.by,
    at: r.at,
    scheduled: false,
  };
  const money = r.outcome === "lost" ? "" : ` · ${formatCentsExact(r.amountCollectedCents)} collected${r.collectedAs ? ` (${COLLECTED_AS_LABELS[r.collectedAs].toLowerCase()})` : ""}`;
  return {
    patch: { callResults: [r, ...(p.callResults ?? [])], activities: [activity, ...(p.activities ?? [])] },
    history: `Call result saved: ${OUTCOME_LABELS[r.outcome]}${money}`,
  };
}

/** Removes a saved result (managers / admins). The Activity note stays as the record of what was said. */
export function deletePatch(p: Patient, id: string): { patch: Partial<Patient>; history: string } | null {
  const r = (p.callResults ?? []).find((x) => x.id === id);
  if (!r) return null;
  return {
    patch: { callResults: (p.callResults ?? []).filter((x) => x.id !== id) },
    history: `Call result deleted: ${OUTCOME_LABELS[r.outcome]} from ${new Date(r.at).toLocaleDateString("en-US")}`,
  };
}

/** One line per service for showing a saved result. */
export function resultLines(r: CallResult): string[] {
  const words = { covered: "in network", oon: "out of network", self_pay: "self-pay", pending_auth: "pending" } as const;
  return ESTIMATE_LINES.map(({ key, label }) => {
    const l = r.lines[key];
    return `${label}: ${words[l.status]}${l.viaSelfPay ? ` · ${formatCents(l.selfPayCents)} self-pay` : ` · patient ${formatCents(l.estimateCents ?? 0)} · insurance ${formatCents(l.insuranceCents ?? 0)}`}`;
  });
}
