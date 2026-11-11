/**
 * Values derived from a patient record that both the field registry (fields.ts) and the record tabs
 * (details.ts) need. Kept separate so those two modules don't import each other.
 */
import { COMMERCIAL_OON, RATE_CARDS, SELF_PAY, treatmentDays, type PlanBenefits } from "./rates";
import type { EstimateLine, EstimateLineKey, LogisticsType, Patient } from "./types";

/** Deterministic 0–1 values per patient, so demo pricing is stable across renders and reloads. */
function seeded(id: string) {
  let a = (Number(id) || id.length) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Demo plan design for the patient's plan type (see PlanBenefits in rates.ts). */
export function planBenefits(p: Patient): PlanBenefits {
  const r = seeded(p.id);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const surgery = new Date(p.surgeryDate);
  const yearDone = (surgery.getMonth() + 1) / 12; // later in the year → more already met
  const type = planType(p);
  if (type === "Medicare" || type === "VA") {
    const met = r() < 0.4 + yearDone * 0.4 ? 283 : 0;
    return { deductible: 283, deductibleMet: met, coinsurance: 0.2, oopMax: null, oopMet: 0 };
  }
  if (type === "Medicare Advantage") {
    const deductible = pick([0, 0, 250, 500]);
    const oopMax = pick([4500, 5900, 6700, 8850]);
    return {
      deductible,
      deductibleMet: Math.round(deductible * Math.min(1, r() + yearDone * 0.5)),
      coinsurance: 0.2,
      oopMax,
      oopMet: Math.round(oopMax * r() * yearDone * 0.6),
    };
  }
  const deductible = pick([500, 1000, 1500, 2000, 3000, 5000]);
  const oopMax = pick([3000, 4500, 6000, 7500, 9200]);
  return {
    deductible,
    deductibleMet: Math.round(deductible * Math.min(1, r() * (0.3 + yearDone))),
    coinsurance: pick([0.1, 0.2, 0.2, 0.2, 0.3]),
    oopMax,
    oopMet: Math.round(oopMax * r() * yearDone * 0.5),
  };
}

/** Commercial and Worker's Comp bill against the commercial card; Medicare, MA and VA against Medicare (as in EVA). */
const isCommercialCard = (p: Patient) => {
  const t = planType(p);
  return t === "Commercial" || t === "Worker's Comp";
};

/** Payer's allowable for one service on this patient's plan length (self-pay price when not covered, OON card when out of network). */
export function allowable(p: Patient, line: EstimateLineKey, status: EstimateLine["status"]): number {
  const days = treatmentDays(p.lengthOfNeed);
  if (status === "self_pay") return SELF_PAY[line][days];
  if (!isCommercialCard(p)) return RATE_CARDS.medicare[line][days];
  return (status === "oon" ? COMMERCIAL_OON : RATE_CARDS.commercial)[line][days];
}

/**
 * DME / RTM / OT estimate lines: what the patient is expected to owe for each service.
 * Uses the stored breakdown when present; otherwise prices it from the EVA rate cards:
 *   self pay      → the self-pay price
 *   covered       → deductible left first, then coinsurance on the rest, capped by the OOP max left
 *   pending auth  → priced as if covered, so the coordinator has a working figure
 * Services draw on the same deductible / OOP max in order DME → RTM → OT.
 * Not yet verified (no WIP 13 / 15) → no amounts. WIP 15 (not covered) → every line self pay.
 * VA: each line is either covered by the VA at $0 to the patient or self pay at the self-pay price.
 * There's no deductible, coinsurance, pending or out-of-network state for VA.
 */
export function estimateLines(p: Patient): Record<EstimateLineKey, EstimateLine> {
  if (p.estimate) return p.estimate;
  const n = Number(p.id) || 0;
  const verified = p.wipState.startsWith("13") || p.wipState.startsWith("15");
  const notCovered = p.wipState.startsWith("15");
  // Out of network only exists on the commercial card (Medicare has no OON card), so only commercial / WC plans get it.
  const oonOk = isCommercialCard(p);
  const status: Record<EstimateLineKey, EstimateLine["status"]> = notCovered
    ? { dme: "self_pay", rtm: "self_pay", ot: "self_pay" }
    : !verified
      ? { dme: "pending_auth", rtm: "pending_auth", ot: "pending_auth" }
      : {
          dme: n % 5 === 0 ? "pending_auth" : oonOk && n % 9 === 4 ? "oon" : "covered",
          rtm: n % 4 === 1 ? "self_pay" : n % 7 === 2 ? "pending_auth" : oonOk && n % 6 === 3 ? "oon" : "covered",
          ot: n % 3 === 0 ? "self_pay" : oonOk && n % 6 === 4 ? "oon" : "covered",
        };
  if (!verified) {
    return { dme: { status: status.dme, amount: null }, rtm: { status: status.rtm, amount: null }, ot: { status: status.ot, amount: null } };
  }

  if (planType(p) === "VA") {
    const va = (line: EstimateLineKey): EstimateLine =>
      status[line] === "self_pay" ? { status: "self_pay", amount: Math.round(allowable(p, line, "self_pay")) } : { status: "covered", amount: 0 };
    return { dme: va("dme"), rtm: va("rtm"), ot: va("ot") };
  }

  const b = planBenefits(p);
  let dedLeft = Math.max(0, b.deductible - b.deductibleMet);
  let oopLeft = b.oopMax === null ? Infinity : Math.max(0, b.oopMax - b.oopMet);
  const out = {} as Record<EstimateLineKey, EstimateLine>;
  for (const line of ["dme", "rtm", "ot"] as EstimateLineKey[]) {
    const allowed = allowable(p, line, status[line]);
    if (status[line] === "self_pay") {
      out[line] = { status: "self_pay", amount: Math.round(allowed) };
      continue;
    }
    const ded = Math.min(allowed, dedLeft);
    let owe = ded + (allowed - ded) * b.coinsurance;
    owe = Math.min(owe, oopLeft);
    dedLeft -= ded;
    oopLeft -= owe;
    out[line] = { status: status[line], amount: Math.round(owe) };
  }
  return out;
}

/** Total estimate = DME + RTM + OT (null when no line has an amount yet). */
export function estimateTotal(p: Patient): number | null {
  const amounts = Object.values(estimateLines(p)).map((l) => l.amount);
  return amounts.every((a) => a === null) ? null : amounts.reduce<number>((s, a) => s + (a ?? 0), 0);
}

export const PLAN_TYPES = ["Commercial", "Medicare", "Medicare Advantage", "Worker's Comp", "VA"] as const;
export type PlanType = (typeof PLAN_TYPES)[number];

/**
 * Plan type shown under the payer name. Placeholder rules until intake sends it:
 * VA YES → VA; payer name marked WC / Workers Comp → Worker's Comp; original "MEDICARE" → Medicare;
 * other "- MCR" plans → Medicare Advantage; everything else → Commercial.
 */
export function planType(p: Patient): PlanType {
  const name = p.insuranceName.toUpperCase();
  if (p.va === "YES" || name.startsWith("VA ")) return "VA";
  if (/\bWC\b|WORKERS'? ?COMP/.test(name)) return "Worker's Comp";
  if (name === "MEDICARE") return "Medicare";
  if (/\bMCR\b/.test(name)) return "Medicare Advantage";
  return "Commercial";
}

/** BTX is the usual route; DME and AIT are about 10% each. */
export const LOGISTICS_TYPES: LogisticsType[] = ["BTX", "DME", "AIT"];
/** Seed / fallback value from a number: 1 in 10 DME, 1 in 10 AIT, the rest BTX. */
export const logisticsTypeFor = (n: number): LogisticsType => {
  // Scramble first so the split doesn't line up with other index-based seed patterns (e.g. owner round-robin)
  let x = n + 0x9e3779b9; // murmur3 finaliser
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  const h = ((x ^ (x >>> 16)) >>> 0) % 100;
  return h < 10 ? "DME" : h < 20 ? "AIT" : "BTX";
};
/** Older saved demo data has no logistics type, so derive one from the ID. */
export const logisticsType = (p: Patient): LogisticsType => p.logisticsType ?? logisticsTypeFor(Number(p.id) || 0);

/**
 * Open / Won / Lost status. Set by saving a WON or LOST call result (the latest one wins);
 * "payment only" results don't change it. Deleting that result puts the status back.
 */
export type DealStatus = "open" | "won" | "lost";
export const DEAL_STATUSES: DealStatus[] = ["open", "won", "lost"];
export const DEAL_STATUS_LABELS: Record<DealStatus, string> = { open: "Open", won: "Won", lost: "Lost" };

const decisive = (p: Patient) => (p.callResults ?? []).filter((r) => r.outcome === "won" || r.outcome === "lost");

/** The status plus when and by whom it was set (null for Open with no result). */
export function dealStatusInfo(p: Patient): { status: DealStatus; at: string | null; by: string | null } {
  const latest = decisive(p).reduce<NonNullable<Patient["callResults"]>[number] | null>((a, r) => (!a || r.at > a.at ? r : a), null);
  if (!latest) return { status: "open", at: null, by: null };
  return { status: latest.outcome as DealStatus, at: latest.at, by: latest.by };
}
export const dealStatus = (p: Patient): DealStatus => dealStatusInfo(p).status;

/** First time this patient was marked WON / LOST (ISO datetime), or "". */
export function firstResultAt(p: Patient, outcome: "won" | "lost"): string {
  return decisive(p)
    .filter((r) => r.outcome === outcome)
    .reduce((a, r) => (!a || r.at < a ? r.at : a), "");
}
