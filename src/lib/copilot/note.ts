/**
 * The call note the rep copies or logs to Activity. Rebuilt from the current calculation every time,
 * so it can't go stale after the numbers change (Base44 froze it once WON was clicked).
 */
import { ESTIMATE_LINES } from "../fields";
import type { Patient } from "../types";
import { formatCents, formatCentsExact, methodLabel, PAYMENT_LABELS, type Calc, type CallOptions } from "./calculator";

const STATUS_TEXT = { covered: "In network", oon: "Out of network", self_pay: "Self pay", pending_auth: "Pending auth" } as const;

/** `scriptTitle` is the outcome script's title as currently worded (it can be renamed on the Call Scripts page). */
export function buildNote(p: Patient, c: Calc, o: CallOptions, scriptTitle?: string): string {
  const out: string[] = [];
  out.push(`Plan: ${p.insuranceName || "No payer"} · ${c.days}-day TP · Logistics ${c.logistics}`);
  for (const { key, label } of ESTIMATE_LINES) {
    const l = c.lines[key];
    const route = l.status === "oon" ? (l.viaSelfPay ? " (patient chose self-pay)" : " (via OON benefits)") : "";
    const amount = l.viaSelfPay ? `self-pay ${formatCents(l.selfPay)}` : `est. ${formatCents(l.estimate ?? 0)}, self-pay ${formatCents(l.selfPay)} if denied`;
    out.push(`${label}: ${STATUS_TEXT[l.status]}${route} — ${amount}`);
  }
  const flags = [o.gapException && "Gap exception requested", o.medicaid && "Medicaid secondary", o.hip && "Hip procedure", c.missedWindow && "Missed Medicare 48-hour window"].filter(Boolean);
  if (flags.length) out.push(`Notes: ${flags.join(" · ")}`);
  if (scriptTitle) out.push(`Script: ${scriptTitle}`);
  out.push(`Total estimated responsibility: ${formatCents(c.totalEpr)} · Full self-pay: ${formatCents(c.totalSelfPay)}`);

  out.push(`Insurance portion: ${formatCents(c.totalInsurance)} · Patient portion: ${formatCents(c.totalEpr)}`);
  if (c.payment === "card_on_file") {
    out.push(`Patient pays: Card on file · ${formatCentsExact(c.collectedToday)} collected today`);
    out.push(`Payment: ${c.hold > 0 ? `${formatCents(c.hold)} hold` : "no hold"}`);
  } else if (c.payment) {
    let agreed = `Patient pays: ${methodLabel(c.method, c)} ${formatCents(c.agreed)}`;
    if (c.fhaSavings > 0) agreed += ` (FHA ${o.fha}%, −${formatCents(c.fhaSavings)})`;
    out.push(agreed);
    let pay = `Payment: ${PAYMENT_LABELS[c.payment]}`;
    if (c.payment === "plan") {
      const [first, ...rest] = c.installments;
      const each = rest[0];
      pay += first === each ? ` · ${c.installments.length} × ${formatCents(each)}` : ` · ${c.installments.length} payments (first ${formatCents(first)}, then ${formatCents(each)})`;
    } else if (c.payment === "upfront") pay += ` · ${formatCents(c.agreed)} collected today`;
    out.push(pay);
  } else out.push("Payment: nothing collected today");
  if (c.cardOnFile) out.push("Card on file.");
  return out.join("\n");
}
