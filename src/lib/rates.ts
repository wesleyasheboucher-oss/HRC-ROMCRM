/**
 * Ortho rate cards, copied from the EVA Estimator (src/lib/orthoEngine.js → DEFAULT_RATES, which
 * src/hooks/useServiceRates.js also falls back to). EVA keeps the live card in its ServiceRates table;
 * these are its defaults, used here as realistic reference prices for the POC.
 *
 * Allowables are what the payer allows per service and treatment plan length (30 / 42 / 60 days).
 * Self-pay prices are what an uncovered patient is charged.
 */
import type { EstimateLineKey } from "./types";

export type TreatmentDays = 30 | 42 | 60;
type Card = Record<EstimateLineKey, Record<TreatmentDays, number>>;

export const RATE_CARDS: { medicare: Card; commercial: Card } = {
  medicare: {
    dme: { 30: 667.38, 42: 667.38, 60: 667.38 },
    rtm: { 30: 234.16, 42: 401.84, 60: 448.67 },
    ot: { 30: 302, 42: 302, 60: 302 },
  },
  commercial: {
    dme: { 30: 3000, 42: 4200, 60: 6000 },
    rtm: { 30: 246.51, 42: 424.45, 60: 471.42 },
    ot: { 30: 302, 42: 302, 60: 302 },
  },
};

/** Commercial out-of-network allowables (EVA dmeOON / rtmOON / otOON). Medicare has no OON card; EVA falls back to the standard one. */
export const COMMERCIAL_OON: Card = {
  dme: { 30: 6000, 42: 8400, 60: 12000 },
  rtm: { 30: 739.53, 42: 899.94, 60: 1414.26 },
  ot: { 30: 302, 42: 302, 60: 302 },
};

/**
 * OT has no self-pay price of its own: self-pay OT is included in the RTM self-pay rate.
 * OT is only a separate cost when it goes through insurance.
 */
export const SELF_PAY: Card = {
  dme: { 30: 1110, 42: 1260, 60: 1380 },
  rtm: { 30: 369.77, 42: 449.97, 60: 582.66 },
  ot: { 30: 0, 42: 0, 60: 0 },
};

/** Treatment plan from Length Of Need ("30" → 30). Same 30 / 42 / 60 plans as EVA; anything else snaps to the nearest. */
export function treatmentDays(lengthOfNeed: string): TreatmentDays {
  const n = parseInt(lengthOfNeed, 10);
  if (n === 30 || n === 42 || n === 60) return n;
  if (n <= 36) return 30;
  if (n <= 51) return 42;
  return 60;
}

/**
 * Typical 2026 plan designs for the demo (EVA asks for the real ones per patient).
 *   Traditional Medicare: Part B deductible $283, 20% coinsurance, no OOP max.
 *   Medicare Advantage:   $0–$500 deductible, 20% coinsurance, OOP max ~$4–9k.
 *   Commercial / WC:      $500–$5,000 deductible, 10–30% coinsurance, OOP max $3–9k.
 */
export interface PlanBenefits {
  deductible: number;
  deductibleMet: number;
  coinsurance: number; // 0–1
  oopMax: number | null;
  oopMet: number;
}
