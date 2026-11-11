/**
 * Conversions table (Notion data requirement 6): a permanent record of every WON / LOST decision on an order,
 * kept apart from the patient record so an order can be won and later lost, or lost and later won.
 *
 * Rows are never edited. A later outcome adds a new row; the order's current outcome is its newest row that
 * isn't voided. Deleting the call result a row came from voids the row (who and when) instead of removing it.
 */
import type { CallResult, Conversion, ConversionPaymentType, Patient } from "./types";

export const PAYMENT_TYPE_LABELS: Record<ConversionPaymentType, string> = {
  paid_in_full_upfront: "Paid in full upfront",
  payment_plan: "Payment plan",
  card_on_file: "Card on file",
  none: "None",
};

/** CNV-000123 */
export const conversionId = (seq: number) => `CNV-${String(seq).padStart(6, "0")}`;

/**
 * The row for a saved call result, or null for a "payment collected" result (those don't create a conversion).
 * Field mapping (also on /poc-notes):
 *   EPR                ← totalEprCents
 *   payment type       ← paymentOption: upfront → paid in full upfront, plan → payment plan, card_on_file → card on file, none → none
 *   collected upfront  ← amountCollectedCents when collectedAs is upfront or card_hold (the hold counts as collected), else 0
 *   installment amount ← amountAgreedCents when on a plan (the plan's total), with `months` as installmentMonths; else 0
 */
export function conversionFromResult(r: CallResult, patient: Patient, seq: number): Conversion | null {
  if (r.outcome !== "won" && r.outcome !== "lost") return null;
  const paymentType: ConversionPaymentType =
    r.paymentOption === "upfront" ? "paid_in_full_upfront" : r.paymentOption === "plan" ? "payment_plan" : r.paymentOption === "card_on_file" ? "card_on_file" : "none";
  const upfront = r.collectedAs === "upfront" || r.collectedAs === "card_hold" ? r.amountCollectedCents : 0;
  const onPlan = paymentType === "payment_plan";
  return {
    id: conversionId(seq),
    orderId: r.orderId || patient.iomsOrderId,
    patientId: patient.id,
    outcome: r.outcome,
    decidedAt: r.at,
    hrcId: r.byId,
    hrcName: r.by,
    eprCents: r.totalEprCents,
    paymentType,
    collectedUpfrontCents: upfront,
    installmentCents: onPlan ? r.amountAgreedCents : 0,
    installmentMonths: onPlan ? r.months : 0,
    callResultId: r.id,
    ...(r.outcome === "lost" ? { lostReason: r.lostReason, lostSubReason: r.lostSubReason } : {}),
  };
}

/** Builds the table from records' saved results, oldest first (seed data, and saved data from before the table existed). */
export function conversionsFromResults(patients: Patient[], firstSeq = 1): Conversion[] {
  const results = patients.flatMap((p) => (p.callResults ?? []).map((r) => ({ p, r }))).sort((a, b) => (a.r.at < b.r.at ? -1 : a.r.at > b.r.at ? 1 : 0));
  const rows: Conversion[] = [];
  for (const { p, r } of results) {
    const c = conversionFromResult(r, p, firstSeq + rows.length);
    if (c) rows.push(c);
  }
  return rows;
}

/** Voids the row(s) that came from a deleted call result; rows already voided are left as they were. */
export function voidForResult(rows: Conversion[], callResultId: string, by: { id: string; name: string }, at: string): Conversion[] {
  return rows.map((c) => (c.callResultId === callResultId && !c.voided ? { ...c, voided: { at, byId: by.id, by: by.name } } : c));
}

/** Every row for an order, newest first (voided rows included). */
export const conversionsFor = (rows: Conversion[], patientId: string) =>
  rows.filter((c) => c.patientId === patientId).sort((a, b) => (a.decidedAt < b.decidedAt ? 1 : a.decidedAt > b.decidedAt ? -1 : b.id.localeCompare(a.id)));

/** The order's current outcome: its newest row that isn't voided, or null if it has none. */
export const currentConversion = (rows: Conversion[], patientId: string): Conversion | null => conversionsFor(rows, patientId).find((c) => !c.voided) ?? null;

/** Ids of the rows that are each order's current outcome. */
export function currentIds(rows: Conversion[]): Set<string> {
  const seen = new Set<string>();
  const ids = new Set<string>();
  for (const c of [...rows].filter((r) => !r.voided).sort((a, b) => (a.decidedAt < b.decidedAt ? 1 : -1))) {
    if (seen.has(c.patientId)) continue;
    seen.add(c.patientId);
    ids.add(c.id);
  }
  return ids;
}

export interface ConversionTotals {
  /** Orders whose current outcome is won */
  won: number;
  /** Orders whose current outcome is lost */
  lost: number;
  /** won ÷ (won + lost), 0–1; null with no rows */
  winRate: number | null;
  eprWonCents: number;
  collectedUpfrontCents: number;
}

/**
 * Totals count orders, not rows (reviewer decision): each order counts once, by its current outcome.
 * `rows` is what's shown (after filters); `current` is the ids of every order's current row (currentIds of the
 * whole table). Superseded and voided rows stay in the table but aren't counted, so an order lost and later won
 * counts once, as won, dated by the win.
 */
export function totals(rows: Conversion[], current: Set<string>): ConversionTotals {
  const live = rows.filter((c) => !c.voided && current.has(c.id));
  const won = live.filter((c) => c.outcome === "won");
  const lost = live.length - won.length;
  return {
    won: won.length,
    lost,
    winRate: live.length ? won.length / live.length : null,
    eprWonCents: won.reduce((s, c) => s + c.eprCents, 0),
    collectedUpfrontCents: won.reduce((s, c) => s + c.collectedUpfrontCents, 0),
  };
}
