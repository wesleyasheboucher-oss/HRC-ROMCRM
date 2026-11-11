import { logisticsType, payerType, PAYER_META, userDisplayName } from "./fields";
import { evaluateCondition, type EvalCtx } from "./filters";
import { lineOf, LINE_LABELS } from "./orderStatus";
import type { AssignmentLogEntry, AssignmentRule, LegacyAssignmentRule, Line, LogisticsType, OrderTypes, Patient, PayerType, User } from "./types";

export interface AssignmentResult {
  assignedToId: string | null;
  reason: string;
}

export const LINES: Line[] = ["ortho", "cardiac"];
export const PAYER_TYPES: PayerType[] = ["medicare", "commercial", "selfpay", "other"];

/** Logistics types in the order the Lead Stream shows them. */
export const LOGISTICS_ORDER: LogisticsType[] = ["AIT", "BTX", "DME"];

export const ALL_ORDER_TYPES = (): OrderTypes => ({ payer: [...PAYER_TYPES], va: true, logistics: [...LOGISTICS_ORDER] });

/** A rule for an HRC who has none yet on a line's page: shown on the page, Active off. */
export const defaultRule = (userId: string, line: Line): AssignmentRule => ({
  userId,
  line,
  active: false,
  weight: 1,
  dailyMax: 10,
  orderTypes: ALL_ORDER_TYPES(),
  exclusions: [],
});

/** Orders assigned by weight and cap today, per line and HRC (only automatic assignments count toward the cap). */
export type DailyCounts = Record<Line, Record<string, number>>;

export function countToday(log: AssignmentLogEntry[], todayIso: string, toIso: (d: Date) => string): DailyCounts {
  const counts: DailyCounts = { ortho: {}, cardiac: {} };
  for (const e of log) {
    if ((e.kind ?? "auto") !== "auto" || !e.assignedToId || toIso(new Date(e.at)) !== todayIso) continue;
    const line = e.line ?? "ortho";
    counts[line][e.assignedToId] = (counts[line][e.assignedToId] ?? 0) + 1;
  }
  return counts;
}

const byLastName = (a: User, b: User) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);

/** Why an HRC can't take this order, or null if they can. */
function excludedBecause(r: AssignmentRule, order: Patient, usersById: Record<string, User>): string | null {
  const type = payerType(order);
  if (!r.orderTypes.payer.includes(type)) return `doesn't take ${PAYER_META[type].label}`;
  if (order.va === "YES" && !r.orderTypes.va) return "doesn't take VA";
  if (!r.orderTypes.logistics.includes(logisticsType(order))) return `doesn't take ${logisticsType(order)}`;
  const ctx: EvalCtx = { usersById, meId: r.userId };
  if (r.exclusions.some((c) => evaluateCondition(order, c, ctx))) return "excluded by a condition";
  return null;
}

/**
 * Picks the HRC for an order entering Patient Sales · Ready for Conversion (A-02..A-06), using only the rules
 * on the order's line's page (Ortho or Cardiac).
 *
 * 1. Eligible = active on that line, takes this order's payer type, VA and logistics type, and not excluded
 *    by any of their exclusion conditions.
 * 2. Of those, HRCs under their daily lead cap compete by weight: lowest assignedToday ÷ weight wins.
 *    Ties break alphabetically by last name.
 * 3. Overflow (A-06): if every eligible HRC is at their cap, the order goes to the first eligible HRC by last name.
 */
export function assignLead(order: Patient, rules: AssignmentRule[], usersById: Record<string, User>, assignedToday: Record<string, number>): AssignmentResult {
  const line = lineOf(order);
  const type = payerType(order);
  const typeLabel = `${LINE_LABELS[line]} · ${order.va === "YES" ? "VA · " : ""}${PAYER_META[type].label} · ${logisticsType(order)}`;

  // Only HRCs who work this line (an HRC is Ortho or Cardiac, never both)
  const onLine = rules.filter((r) => r.line === line && r.active && usersById[r.userId] && hrcLine(usersById[r.userId]) === line);
  const eligible = onLine.filter((r) => !excludedBecause(r, order, usersById));

  if (eligible.length === 0) {
    return {
      assignedToId: null,
      reason: onLine.length ? `No active ${LINE_LABELS[line]} HRC takes ${typeLabel} orders; left unassigned` : `No active HRC on the ${LINE_LABELS[line]} page; left unassigned`,
    };
  }

  const underCap = eligible.filter((r) => (assignedToday[r.userId] ?? 0) < r.dailyMax && r.weight > 0);

  if (underCap.length === 0) {
    const first = eligible.map((r) => usersById[r.userId]).sort(byLastName)[0];
    return { assignedToId: first.id, reason: `Overflow: every eligible HRC is at their daily cap → first by last name (${userDisplayName(first)})` };
  }

  const scored = underCap
    .map((r) => ({ r, u: usersById[r.userId], score: (assignedToday[r.userId] ?? 0) / r.weight }))
    .sort((a, b) => a.score - b.score || byLastName(a.u, b.u));
  const winner = scored[0];
  const totalWeight = underCap.reduce((s, r) => s + r.weight, 0);
  const share = Math.round((winner.r.weight / totalWeight) * 100);
  return {
    assignedToId: winner.u.id,
    reason: `${typeLabel} order → ${userDisplayName(winner.u)} (weight ${winner.r.weight}, ${share}% of eligible, ${(assignedToday[winner.u.id] ?? 0) + 1} of ${winner.r.dailyMax} today)`,
  };
}

/* ---------------------------------------------------------------------------
   Migration from the percentage rules
   --------------------------------------------------------------------------- */

const isLegacy = (r: AssignmentRule | LegacyAssignmentRule): r is LegacyAssignmentRule => !("weight" in r);

/** The line an HRC works; HRCs without one are treated as Ortho (the only line there was). */
export const hrcLine = (u: User): Line => u.line ?? "ortho";

/**
 * Percentage rules → weight rules, on the HRC's own line's page:
 * weight = percentage ÷ the smallest active percentage, rounded, at least 1.
 * Lead types become the payer order types and "takes VA" carries over; every logistics type starts on.
 */
export function migrateRules(rules: (AssignmentRule | LegacyAssignmentRule)[], users: User[]): AssignmentRule[] {
  const lineOfUser = (id: string): Line => {
    const u = users.find((x) => x.id === id);
    return u ? hrcLine(u) : "ortho";
  };
  const legacy = rules.filter(isLegacy);
  const activePcts = legacy.filter((r) => r.active && r.percentage > 0).map((r) => r.percentage);
  const smallest = activePcts.length ? Math.min(...activePcts) : 1;
  return rules.map((r) =>
    isLegacy(r)
      ? {
          userId: r.userId,
          line: lineOfUser(r.userId),
          active: r.active,
          weight: Math.max(1, Math.round(r.percentage / smallest)),
          dailyMax: r.dailyMax,
          orderTypes: { payer: [...r.leadTypes], va: r.acceptsVa !== false, logistics: [...LOGISTICS_ORDER] },
          exclusions: r.exclusions,
        }
      : r,
  );
}

/**
 * One rule per HRC, on their own line's page: drops any rule on the other line and adds a default
 * (Active off) rule for an HRC who has none, so every HRC shows on their page.
 */
export function withEveryHrc(rules: AssignmentRule[], hrcs: User[]): AssignmentRule[] {
  const own = rules.filter((r) => {
    const u = hrcs.find((x) => x.id === r.userId);
    return u && hrcLine(u) === r.line;
  });
  const missing = hrcs.filter((u) => !own.some((r) => r.userId === u.id)).map((u) => defaultRule(u.id, hrcLine(u)));
  return [...own, ...missing];
}
