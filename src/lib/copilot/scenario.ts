/**
 * Picks the insurance-outcome script for a call. Port of Base44 resolveScenarioKey.js, rewritten so it
 * reads the patient record instead of manual toggles, with these fixes:
 *  - DME pending and therapy pending are separate inputs (Base44 lumped them, so therapy-only pending
 *    picked the "DME pending" script by accident; it still does, but now on purpose and flagged).
 *  - Out of network is a line status, not a flag that could fire on a denied or pending line.
 *  - Missed window and hip are Traditional Medicare only, matching the scripts' own triggers.
 *  - Gap exception "30+" is really 60+ days (the script says so); the key is named for that.
 *
 * Checked top to bottom; the first match wins. Input is computed in calculator.ts.
 */
import type { EstimateStatus } from "../types";

export type Insurance = "medicare" | "medicare_advantage" | "commercial" | "va";

export type ScenarioKey =
  | "va_pending"
  | "gap_exception"
  | "gap_exception_60_plus"
  | "oon_both"
  | "oon_dme_denied_ot"
  | "oon_ot_denied_dme"
  | "oon_dme_only"
  | "oon_rtm_only"
  | "pending_inn"
  | "pending_oon"
  | "pending_denied"
  | "medicare_missed_window"
  | "medicare_hip"
  | "medicare_medicaid"
  | "medicare_zero_epr"
  | "medicare_covered"
  | "zero_epr"
  | "medadv_covered"
  | "medadv_partial_rtm_denied"
  | "medadv_partial_dme_denied"
  | "commercial_covered"
  | "commercial_partial_rtm_denied"
  | "commercial_partial_dme_denied"
  | "not_covered";

export interface ScenarioInput {
  insurance: Insurance;
  /** Effective status of the DME line, after call-time overrides (hip, missed window). */
  dme: EstimateStatus;
  /** Combined RTM + OT status (see groupStatus in calculator.ts). */
  therapy: EstimateStatus;
  /** Total estimated patient responsibility through insurance, in cents. */
  totalEpr: number;
  daysToSurgery: number;
  medicaid: boolean;
  hip: boolean;
  gapException: boolean;
  missedWindow: boolean;
}

export interface Scenario {
  key: ScenarioKey;
  /** Why this script was picked, for the rep. */
  reason: string;
  /** Set when no script was written for this exact case and the closest one is shown. */
  approximate?: string;
}

/** Surgery further out than this many days → the "we have time to get a decision" exception script. */
export const GAP_EXCEPTION_FAR_DAYS = 60;

const covered = (s: EstimateStatus) => s === "covered";
const selfPay = (s: EstimateStatus) => s === "self_pay";

export function resolveScenario(i: ScenarioInput): Scenario {
  const { insurance, dme, therapy } = i;

  if (insurance === "va") return { key: "va_pending", reason: "VA plan" };

  if (i.gapException && insurance !== "medicare") {
    return i.daysToSurgery > GAP_EXCEPTION_FAR_DAYS
      ? { key: "gap_exception_60_plus", reason: `Gap exception · surgery more than ${GAP_EXCEPTION_FAR_DAYS} days out` }
      : { key: "gap_exception", reason: "Gap exception requested" };
  }

  // Out of network (commercial card only, so never Traditional Medicare)
  const dmeOon = dme === "oon";
  const thOon = therapy === "oon";
  if (dmeOon && thOon) return { key: "oon_both", reason: "DME and therapy out of network" };
  if (dmeOon && selfPay(therapy)) return { key: "oon_dme_denied_ot", reason: "DME out of network · therapy not covered" };
  if (thOon && selfPay(dme)) return { key: "oon_ot_denied_dme", reason: "Therapy out of network · DME not covered" };
  if (dmeOon) {
    return therapy === "pending_auth"
      ? { key: "oon_dme_only", reason: "DME out of network · therapy pending", approximate: "No script for therapy pending with DME out of network; showing the DME-out-of-network script." }
      : { key: "oon_dme_only", reason: "DME out of network · therapy in network" };
  }
  if (thOon && dme !== "pending_auth") return { key: "oon_rtm_only", reason: "Therapy out of network · DME in network" };

  // Pending authorization
  if (dme === "pending_auth") {
    if (thOon) return { key: "pending_oon", reason: "DME pending · therapy out of network" };
    if (selfPay(therapy)) return { key: "pending_denied", reason: "DME pending · therapy not covered" };
    return { key: "pending_inn", reason: therapy === "pending_auth" ? "DME and therapy pending" : "DME pending · therapy in network" };
  }
  if (therapy === "pending_auth") {
    return {
      key: "pending_inn",
      reason: "Therapy pending",
      approximate: "The scripts were written for DME pending. No script exists for therapy pending on its own; showing the closest one.",
    };
  }

  // Traditional Medicare
  if (insurance === "medicare") {
    if (i.missedWindow) return { key: "medicare_missed_window", reason: "Medicare · surgery was more than 48 hours ago" };
    if (i.hip) return { key: "medicare_hip", reason: "Medicare · hip procedure (DME not covered)" };
    if (i.medicaid) return { key: "medicare_medicaid", reason: "Medicare with Medicaid secondary" };
    if (covered(dme)) {
      return i.totalEpr === 0
        ? { key: "medicare_zero_epr", reason: "Medicare · DME covered · $0 estimate" }
        : { key: "medicare_covered", reason: "Medicare · DME covered" };
    }
    return { key: "not_covered", reason: "Medicare · DME not covered" };
  }

  // Medicare Advantage and commercial (Worker's Comp prices on the commercial card)
  if (i.totalEpr === 0) return { key: "zero_epr", reason: "$0 estimated responsibility" };
  const ma = insurance === "medicare_advantage";
  const payer = ma ? "Medicare Advantage" : "Commercial";
  if (covered(dme) && covered(therapy)) return { key: ma ? "medadv_covered" : "commercial_covered", reason: `${payer} · DME and therapy covered` };
  if (covered(dme)) return { key: ma ? "medadv_partial_rtm_denied" : "commercial_partial_rtm_denied", reason: `${payer} · DME covered · therapy not covered` };
  if (covered(therapy)) return { key: ma ? "medadv_partial_dme_denied" : "commercial_partial_dme_denied", reason: `${payer} · therapy covered · DME not covered` };
  return { key: "not_covered", reason: `${payer} · nothing covered` };
}
