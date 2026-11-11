/**
 * iOMS order status: one prime status (which team owns the order) and one of its substatuses (what's next).
 * Copied exactly from iOMS `STATUSES` (iOMS Order UI Redesign/orders.js), including the en dash in
 * "Verified – Auth Req" and the em dashes. Keep the two in step.
 */
import type { Patient } from "./types";

export const SUBSTATUSES = {
  "Order Intake": ["New Order Incomplete"],
  Verifications: ["Awaiting Verification", "Verified – Auth Req"],
  "Patient Sales": ["Ready for Conversion"],
  "Delivery Scheduling": ["Awaiting Delivery Scheduling"],
  "Awaiting Delivery": ["Delivery Scheduled", "Out For Delivery"],
  "Delivered — Awaiting Treatment Start": ["Pre-Surgery", "Post-Surgery"],
  "In Treatment": ["Active Treatment", "Treatment Complete"],
  Billing: ["Ready for Billing", "SCA Pending — Billing Hold"],
  "Insurance Collections": ["Awaiting Payment", "Denied — Appeal in Progress"],
  "Patient Collections": ["Patient Balance", "Paid in Full"],
} as const satisfies Record<string, readonly string[]>;

export type PrimeStatus = keyof typeof SUBSTATUSES;
export type Substatus = (typeof SUBSTATUSES)[PrimeStatus][number];

/** Prime statuses in workflow order. */
export const PRIME_STATUSES = Object.keys(SUBSTATUSES) as PrimeStatus[];

/** Every substatus, in workflow order (for pick-lists that aren't narrowed to one prime status). */
export const ALL_SUBSTATUSES: Substatus[] = PRIME_STATUSES.flatMap((p) => [...SUBSTATUSES[p]]);

/** Where an order is handed to the HRCs. */
export const HRC_STATUS = { prime: "Patient Sales", sub: "Ready for Conversion" } as const satisfies { prime: PrimeStatus; sub: Substatus };

export const isPrimeStatus = (s: string): s is PrimeStatus => s in SUBSTATUSES;

/** True when `sub` is one of `prime`'s substatuses. */
export const isValidStatus = (prime: string, sub: string): boolean =>
  isPrimeStatus(prime) && (SUBSTATUSES[prime] as readonly string[]).includes(sub);

/** Substatuses that belong to a prime status; every substatus for an unknown one. */
export const substatusesOf = (prime: string): readonly string[] => (isPrimeStatus(prime) ? SUBSTATUSES[prime] : ALL_SUBSTATUSES);

/* Older saved records have no status; they read as the HRC hand-in point, where every record used to sit. */
export const primeStatusOf = (p: Patient): PrimeStatus => (p.primeStatus && isPrimeStatus(p.primeStatus) ? p.primeStatus : HRC_STATUS.prime);
export const substatusOf = (p: Patient): string => p.substatus ?? HRC_STATUS.sub;
export const lineOf = (p: Patient): "ortho" | "cardiac" => p.line ?? (p.classification === "Cardiac" ? "cardiac" : "ortho");

export const LINE_LABELS = { ortho: "Ortho", cardiac: "Cardiac" } as const;

/** "Verifications · Verified – Auth Req" */
export const statusText = (prime: string, sub: string) => `${prime} · ${sub}`;
