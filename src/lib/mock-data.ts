// Deterministic, entirely fictional demo data. No real patients or staff.
import { addDays, startOfToday, toISODate } from "./dates";
import { ATTEMPT_STAGES, DEFAULT_CARD_FIELDS, estimateTotal, logisticsTypeFor } from "./fields";
import { ME_TOKEN } from "./filters";
import { ALL_ORDER_TYPES, migrateRules } from "./assignment";
import { calculate, DEFAULT_OPTIONS, type CallOptions } from "./copilot/calculator";
import { buildResult, defaultSummary, savePatch } from "./copilot/result";
import { LOST_REASONS } from "./lostReasons";
import { HRC_STATUS, PRIME_STATUSES, primeStatusOf, type PrimeStatus } from "./orderStatus";
import type {
  Activity,
  AssignmentRule,
  LegacyAssignmentRule,
  Line,
  HistoryEvent,
  Patient,
  SavedFilter,
  Team,
  User,
  UserPrefs,
  ViewAssignment,
} from "./types";

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const TEAMS: Team[] = [
  { id: "t_ortho_a", name: "Ortho Team A" },
  { id: "t_ortho_b", name: "Ortho Team B" },
];

export const USERS: User[] = [
  // An HRC works one line: Ortho or Cardiac
  { id: "u_riley", firstName: "Riley", lastName: "Abbott", email: "riley.abbott@example.com", role: "coordinator", teamId: "t_ortho_a", line: "ortho" },
  { id: "u_jordan", firstName: "Jordan", lastName: "Ellis", email: "jordan.ellis@example.com", role: "coordinator", teamId: "t_ortho_a", line: "ortho" },
  { id: "u_taylor", firstName: "Taylor", lastName: "Nguyen", email: "taylor.nguyen@example.com", role: "coordinator", teamId: "t_ortho_a", line: "ortho" },
  { id: "u_priya", firstName: "Priya", lastName: "Natarajan", email: "priya.natarajan@example.com", role: "coordinator", teamId: "t_ortho_b", line: "cardiac" },
  { id: "u_marcus", firstName: "Marcus", lastName: "Bell", email: "marcus.bell@example.com", role: "coordinator", teamId: "t_ortho_b", line: "ortho" },
  { id: "u_sam", firstName: "Sam", lastName: "Ortega", email: "sam.ortega@example.com", role: "coordinator", teamId: "t_ortho_b", line: "cardiac" },
  { id: "u_dana", firstName: "Dana", lastName: "Whitfield", email: "dana.whitfield@example.com", role: "manager", teamId: null },
  { id: "u_admin", firstName: "Wes", lastName: "Boucher", email: "wes.boucher@example.com", role: "admin", teamId: null },
];

const FIRST = [
  "Ruby", "Bruce", "Jesse", "Terry", "Clementina", "Juan", "Katy", "Sandra", "Herman", "Catherine", "Delma", "Timothy",
  "Emma", "Stephanie", "Lori", "Deanna", "Margaret", "Carlos", "Dominique", "Donald", "Betty", "Sheila", "Kenneth",
  "Daniel", "Roger", "Mary", "Anne", "Vickie", "James", "Helen", "Evon", "Darlene", "Marlene", "Gregory", "Robert",
  "Susan", "Edward", "Jura", "Gwen", "Otilia", "Donnie", "Joni", "Jacqueline", "Michael", "Peggy", "Virginia", "Richard",
  "Diane", "Petra", "Curtis", "Glenn", "Melissa", "Adelita", "Lisa", "Brenda", "Hala", "Shannon", "Dona", "Sharon",
  "Angela", "Stephen", "Jennifer", "Tracy", "Rebecca", "Charles", "Andrew", "Paul", "Keven", "Beverley", "Pamela", "Janina",
  "Dale", "Wanda", "Frank", "Gloria", "Harold", "Irene", "Leon", "Norma", "Oscar", "Rita", "Walter", "Yvonne",
];
const LAST = [
  "Zimmer", "Pratt", "Nolan", "Hughes", "Jansen", "Mendez", "Porter", "Barnes", "Hale", "Kirby", "Aldana", "Moss",
  "Duran", "Avery", "Sutton", "Archer", "Bishop", "Serrano", "Marsh", "Webb", "Coleman", "Wade", "Jarvis", "Burke",
  "Stokes", "Lowe", "Carver", "Mills", "Dalton", "Hart", "Holt", "Doyle", "Quinn", "Gaines", "Diaz", "Bates", "Shaw",
  "Ochoa", "Joyce", "Gill", "Hayes", "Fleming", "Shields", "Hogan", "Bowen", "Wolfe", "Mercer", "Reyes", "Garner",
];

const COMMERCIAL = [
  "BCBS - MO", "BCBS - NY", "BCBS - TN", "BCBS - KS", "ANTHEM - CA", "ANTHEM - GA", "ANTHEM BLUE CROSS",
  "UHC - COMMERCIAL", "UHC Choice Plus", "CIGNA - COMMERCIAL", "AETNA", "OSCAR HEALTH INS", "ALLIANT HEALTH PLANS",
  "OPTUM CARE NETWORK", "AMBETTER ALL STATES",
];
const MEDICARE = ["MEDICARE", "UHC - MCR", "HUMANA - MCR", "AETNA - MCR", "WELLPOINT - MCR", "BCBS - MCR - PA", "DEAN HEALTH PLAN - MCR"];
const WORKERS_COMP = ["LIBERTY MUTUAL - WC", "TRAVELERS - WC", "THE HARTFORD - WC"];
const VA_PAYER = "VA COMMUNITY CARE";

/** Deterministic payer overrides (no rand() so the rest of the seed is unchanged): VA patients → VA payer; a few non-Medicare → Worker's Comp. */
/** VA is ~1% of orders: 1 record in 100. */
const isVaSeed = (n: number) => n % 100 === 37;

function seedPayer(n: number, isMcr: boolean, picked: string): string {
  if (isVaSeed(n)) return VA_PAYER;
  if (!isMcr && n % 13 === 7) return WORKERS_COMP[n % WORKERS_COMP.length];
  return picked;
}

const STATES = ["MO", "KS", "NY", "TN", "CA", "GA", "TX", "FL", "OH", "PA", "KY", "WI", "AZ"];
const PHYSICIANS = [
  "Dr. Alan Whitcomb", "Dr. Maria Esposito", "Dr. Kevin Okafor", "Dr. Leah Brandt", "Dr. Samuel Ito",
  "Dr. Renee Calloway", "Dr. Victor Huang", "Dr. Elena Petrova",
];

export const PATIENT_COUNT = 240;

/*
 * iOMS status for the seed: 11 in 20 orders sit in Patient Sales (the HRC board); the rest cover every other
 * prime status and substatus. Orders whose surgery has passed are spread over the post-surgery statuses, the
 * others over the pre-surgery ones, so the data reads sensibly. Deterministic, no rand() calls.
 */
const PRE_SURGERY: [PrimeStatus, string][] = [
  ["Order Intake", "New Order Incomplete"],
  ["Verifications", "Awaiting Verification"],
  ["Verifications", "Verified – Auth Req"],
  ["Delivery Scheduling", "Awaiting Delivery Scheduling"],
  ["Awaiting Delivery", "Delivery Scheduled"],
  ["Awaiting Delivery", "Out For Delivery"],
  ["Delivered — Awaiting Treatment Start", "Pre-Surgery"],
];
const POST_SURGERY: [PrimeStatus, string][] = [
  ["Delivered — Awaiting Treatment Start", "Post-Surgery"],
  ["In Treatment", "Active Treatment"],
  ["In Treatment", "Treatment Complete"],
  ["Billing", "Ready for Billing"],
  ["Billing", "SCA Pending — Billing Hold"],
  ["Insurance Collections", "Awaiting Payment"],
  ["Insurance Collections", "Denied — Appeal in Progress"],
  ["Patient Collections", "Patient Balance"],
  ["Patient Collections", "Paid in Full"],
];
const inHrcSeed = (i: number) => (i * 7) % 20 < 11;

/** Past call activities matching the call count (deterministic, no rand() so the rest of the seed is unchanged). */
function seedCalls(i: number, n: number, createdAt: Date, callStage: string): Activity[] {
  const connected = callStage === "Connected - Follow Up" || callStage === "Cleared for Delivery";
  return Array.from({ length: n }, (_, k) => {
    const at = new Date(createdAt);
    at.setDate(at.getDate() + 1 + k);
    at.setHours(9 + ((i + k) % 7), (i * 7 + k * 13) % 60);
    const last = k === n - 1;
    const outcome = last && connected ? "Connected" : (i + k) % 2 ? "Left voicemail" : "No answer";
    return {
      id: `a_${i}_${k}`,
      type: "call" as const,
      summary: outcome === "Connected" ? "Reviewed coverage and next steps" : outcome,
      outcome,
      at: at.toISOString(),
      by: "Coordinator",
      scheduled: false,
    };
  }).reverse();
}

export function generatePatients(today = startOfToday()): Patient[] {
  const rand = mulberry32(20261030);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const phone = () => `(${pick(["816", "913", "314", "417", "615", "404"])}) ${int(200, 989)}-${String(int(0, 9999)).padStart(4, "0")}`;

  // Uneven book sizes so counts differ by coordinator, like the 194 vs 55 in the videos.
  const owners = ["u_riley", "u_riley", "u_riley", "u_jordan", "u_jordan", "u_priya", "u_priya", "u_marcus", "u_marcus", "u_sam", "u_taylor"];

  let preK = 0;
  let postK = 0;
  const now = new Date();
  return Array.from({ length: PATIENT_COUNT }, (_, i): Patient => {
    const r = rand();
    const wipState = r < 0.4 ? "15 Not Covered" : "13 Ins Cleared: PendConfirmation";
    const isMcr = rand() < 0.4;
    const insuranceName = isMcr ? pick(MEDICARE) : pick(COMMERCIAL);
    const surgery = addDays(today, int(-14, 45));
    const created = addDays(surgery, -int(8, 40));
    const createdClamped = created > today ? addDays(today, -int(0, 3)) : created;
    const ownerId = pick(owners);

    const progress = rand();
    const callStage =
      progress < 0.55 ? "New Not Called" : progress < 0.7 ? "1st Call Attempted" : progress < 0.8 ? "2nd Call Attempted" : progress < 0.88 ? "Connected - Follow Up" : progress < 0.94 ? ["3rd", "4th", "5th", "6th"][i % 4] + " Call Attempted" : "Cleared for Delivery";
    const salesStatus =
      callStage === "New Not Called" ? "New Patient" : callStage === "Cleared for Delivery" ? "Cleared for Delivery" : pick(["Contacted", "Education Complete", "Cost Discussed"]);

    const selfPay = wipState.startsWith("15");
    const financialEstimate = selfPay
      ? int(15, 35) * 100
      : wipState.startsWith("13")
        ? isMcr
          ? int(0, 8) * 50
          : int(4, 30) * 50
        : null;
    const agreed = selfPay && salesStatus === "Cleared for Delivery";

    const createdAt = new Date(createdClamped);
    createdAt.setHours(int(7, 17), int(0, 59));
    const history: HistoryEvent[] = [
      { id: `h_${i}_0`, at: createdAt.toISOString(), by: "Intake API", text: "Patient record created" },
    ];
    if (callStage !== "New Not Called") {
      const at = new Date(createdAt);
      at.setDate(at.getDate() + 1);
      history.push({ id: `h_${i}_1`, at: at.toISOString(), by: "Coordinator", text: `Call Stage changed: New Not Called → ${callStage}` });
    }

    // iOMS status, entered a day or so after the record was created (never in the future)
    const [primeStatus, substatus] = inHrcSeed(i)
      ? [HRC_STATUS.prime, HRC_STATUS.sub]
      : surgery < today
        ? POST_SURGERY[postK++ % POST_SURGERY.length]
        : PRE_SURGERY[preK++ % PRE_SURGERY.length];
    const changed = new Date(createdAt);
    changed.setDate(changed.getDate() + (i % 4));
    changed.setHours(8 + (i % 9), (i * 11) % 60);
    const statusChangedAt = (changed > now ? new Date(now.getTime() - 3_600_000) : changed).toISOString();
    history.push({ id: `h_${i}_s`, at: statusChangedAt, by: "iOMS", text: `Status: ${primeStatus} · ${substatus}` });

    const callAttempts =
      ATTEMPT_STAGES.includes(callStage) ? ATTEMPT_STAGES.indexOf(callStage) : callStage === "Connected - Follow Up" ? 1 + (i % 6) : 2 + (i % 5);

    const taskDue = callStage === "New Not Called" ? today : addDays(today, int(-2, 4));

    return {
      id: String(151000 + i * 7),
      firstName: pick(FIRST),
      lastName: pick(LAST),
      ownerId,
      callStage,
      wipState,
      salesStatus,
      btPatientId: String(161000 + i * 3),
      btOrderId: String(70000 + i * 5),
      state: rand() < 0.2 ? "" : pick(STATES),
      lengthOfNeed: pick(["30", "42", "42", "60"]),
      age: int(44, 86),
      classification: rand() < 0.85 ? "Ortho" : "Cardiac",
      doctorNotes: rand() < 0.8 ? "" : pick(["Bilateral TKA", "Revision — check hardware notes", "Patient prefers afternoon calls"]),
      physicianName: pick(PHYSICIANS),
      iomsOrderId: String(61000 + i * 4),
      mcr: isMcr ? "YES" : "NO",
      va: isVaSeed(i) ? "YES" : "NO", // deterministic, no rand() so the rest of the seed is unchanged
      insuranceName: seedPayer(i, isMcr, insuranceName),
      homePhone: rand() < 0.3 ? phone() : "",
      mobilePhone: rand() < 0.95 ? phone() : "",
      secondaryPhone: rand() < 0.1 ? phone() : "",
      selfPayChargeDate: agreed ? toISODate(addDays(surgery, -2)) : "",
      agreedSelfPayAmount: agreed ? financialEstimate : null,
      surgeryDate: toISODate(surgery),
      expectedCloseDate: toISODate(addDays(surgery, -3)),
      financialEstimate,
      logisticsType: logisticsTypeFor(i), // deterministic, no rand() so the rest of the seed is unchanged
      primeStatus,
      substatus,
      statusChangedAt,
      // Derived from Call Stage (no extra rand() calls, so the rest of the seed stays identical)
      callAttempts,
      activities: seedCalls(i, callAttempts, createdAt, callStage),
      createdAt: createdAt.toISOString(),
      createdBy: "Intake API",
      // No auto "1st Call" task for new patients (removed at reviewer request); follow-ups only
      nextTask:
        callStage === "Cleared for Delivery" || callStage === "New Not Called"
          ? null
          : {
              title: "Follow-up Call",
              due: toISODate(taskDue),
              assigneeId: ownerId,
              done: false,
            },
      history,
    };
  }).map((p, i) => {
    // Line follows Classification (about 15% cardiac); each order is owned by an HRC on its line
    const line: Line = p.classification === "Cardiac" ? "cardiac" : "ortho";
    const pool = USERS.filter((u) => u.line === line);
    const ownerId = pool.some((u) => u.id === p.ownerId) ? p.ownerId : pool[i % pool.length].id;
    return { ...p, line, ownerId, nextTask: p.nextTask ? { ...p.nextTask, assigneeId: ownerId! } : null };
  }).map((p) => ({
    ...p,
    // Agreed self-pay = the priced self-pay total (EVA rate card), not the old random figure
    ...(p.agreedSelfPayAmount === null ? {} : { agreedSelfPayAmount: estimateTotal(p) }),
  }));
}

/** Example admin-pushed view (F-03) and a coordinator's personal filter (F-04). */
export const SEED_FILTERS: SavedFilter[] = [
  {
    id: "f_cardiac",
    name: "Cardiac",
    createdById: "u_admin",
    visibility: "shared",
    all: [
      { id: "fc1", field: "owner", operator: "is", value: ME_TOKEN },
      { id: "fc1p", field: "primeStatus", operator: "is", value: HRC_STATUS.prime },
      { id: "fc2", field: "classification", operator: "is", value: "Cardiac" },
    ],
    any: [],
  },
  {
    id: "f_riley_urgent",
    name: "Not called, surgery this week",
    createdById: "u_riley",
    visibility: "private",
    all: [
      { id: "fr1", field: "owner", operator: "is", value: ME_TOKEN },
      { id: "fr1p", field: "primeStatus", operator: "is", value: HRC_STATUS.prime },
      { id: "fr2", field: "callStage", operator: "is", value: "New Not Called" },
      { id: "fr3", field: "daysOut", operator: "lt", value: "8" },
    ],
    any: [],
  },
  {
    id: "f_highoop",
    name: "High estimate (> $1,000)",
    createdById: "u_dana",
    visibility: "shared",
    all: [
      { id: "fh1", field: "owner", operator: "is", value: ME_TOKEN },
      { id: "fh1p", field: "primeStatus", operator: "is", value: HRC_STATUS.prime },
      { id: "fh2", field: "financialEstimate", operator: "gt", value: "1000" },
    ],
    any: [],
  },
];

/** The admin-pushed Cardiac view goes to the cardiac HRCs. */
export const SEED_ASSIGNMENTS: ViewAssignment[] = [{ filterId: "f_cardiac", userIds: ["u_priya", "u_sam"], teamIds: [] }];

export function defaultPrefs(userId: string): UserPrefs {
  return {
    pinnedFilterIds: userId === "u_riley" ? ["f_riley_urgent"] : [],
    cardFields: [...DEFAULT_CARD_FIELDS],
    sort: { field: "expectedCloseDate", dir: "asc" },
  };
}

/** The percentage rules from before weights (kept to show the migration: they become the Ortho page's weights). */
const LEGACY_ORTHO_RULES: LegacyAssignmentRule[] = [
  { userId: "u_riley", active: true, percentage: 25, dailyMax: 20, leadTypes: ["medicare", "commercial", "selfpay", "other"], exclusions: [] },
  { userId: "u_jordan", active: true, percentage: 20, dailyMax: 15, leadTypes: ["medicare", "commercial", "selfpay", "other"], exclusions: [] },
  {
    userId: "u_taylor",
    active: true,
    percentage: 10,
    dailyMax: 5,
    leadTypes: ["commercial", "selfpay"],
    acceptsVa: false,
    exclusions: [{ id: "ex1", field: "state", operator: "is", value: "NY" }],
  },
  {
    userId: "u_marcus",
    active: true,
    percentage: 15,
    dailyMax: 12,
    leadTypes: ["medicare", "commercial", "selfpay"],
    exclusions: [{ id: "ex2", field: "state", operator: "is", value: "CA" }],
  },
];

/**
 * Ortho page: the ortho HRCs' migrated percentage rules (Riley 3, Jordan 2, Taylor 1, Marcus 2).
 * Cardiac page: the cardiac HRCs (Priya 2, Sam 1).
 */
export const SEED_RULES: AssignmentRule[] = [
  ...migrateRules(LEGACY_ORTHO_RULES, USERS),
  { userId: "u_priya", line: "cardiac", active: true, weight: 2, dailyMax: 8, orderTypes: ALL_ORDER_TYPES(), exclusions: [] },
  { userId: "u_sam", line: "cardiac", active: true, weight: 1, dailyMax: 4, orderTypes: { ...ALL_ORDER_TYPES(), logistics: ["BTX", "DME"] }, exclusions: [] },
];

/** Generates a single fictional incoming order on a line, arriving at Patient Sales · Ready for Conversion. Deterministic per seq. */
export function generateLead(seq: number, line: Line = "ortho", today = startOfToday()): Patient {
  const rand = mulberry32(seq * 7919 + 104729);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const r = rand();
  const wipState = r < 0.35 ? "15 Not Covered" : "13 Ins Cleared: PendConfirmation";
  const isMcr = rand() < 0.4;
  const surgery = addDays(today, int(5, 40));
  const now = new Date().toISOString();
  const selfPay = wipState.startsWith("15");
  const classification = line === "cardiac" ? "Cardiac" : "Ortho";
  return {
    id: String(190000 + seq),
    firstName: pick(FIRST),
    lastName: pick(LAST),
    ownerId: null,
    callStage: "New Not Called",
    wipState,
    salesStatus: "New Patient",
    btPatientId: String(170000 + seq),
    btOrderId: String(80000 + seq),
    state: pick(STATES),
    lengthOfNeed: "42",
    age: int(44, 86),
    classification,
    doctorNotes: "",
    physicianName: pick(PHYSICIANS),
    iomsOrderId: String(65000 + seq),
    mcr: isMcr ? "YES" : "NO",
    va: isVaSeed(seq) ? "YES" : "NO",
    insuranceName: seedPayer(seq, isMcr, isMcr ? pick(MEDICARE) : pick(COMMERCIAL)),
    homePhone: "",
    mobilePhone: `(816) ${int(200, 989)}-${String(int(0, 9999)).padStart(4, "0")}`,
    secondaryPhone: "",
    selfPayChargeDate: "",
    agreedSelfPayAmount: null,
    surgeryDate: toISODate(surgery),
    expectedCloseDate: toISODate(addDays(surgery, -3)),
    financialEstimate: selfPay ? int(15, 35) * 100 : wipState.startsWith("13") ? int(2, 30) * 50 : null,
    logisticsType: logisticsTypeFor(seq),
    callAttempts: 0,
    activities: [],
    // New leads arrive at the HRC hand-in point
    primeStatus: HRC_STATUS.prime,
    substatus: HRC_STATUS.sub,
    statusChangedAt: now,
    line,
    createdAt: now,
    createdBy: "Intake API",
    nextTask: null,
    history: [{ id: `h_new_${seq}`, at: now, by: "Intake API", text: "Patient record created" }],
  };
}

/*
 * Call results for the seed, saved the same way the Co-Pilot saves them, so the conversions table starts with history:
 *   - every order past Patient Sales was won (shortly before its status moved on)
 *   - in Patient Sales: some won, some lost, and a couple lost and later won
 * Won results rotate through paid upfront, payment plan and card on file. Deterministic.
 */
const HRC_INDEX = PRIME_STATUSES.indexOf(HRC_STATUS.prime);
const HOUR = 3_600_000;

export function seedCallResults(patients: Patient[], today = startOfToday()): Patient[] {
  const now = new Date();
  let psK = 0;
  return patients.map((p, i) => {
    const owner = USERS.find((u) => u.id === p.ownerId);
    if (!owner) return p;
    const user = { id: owner.id, name: `${owner.firstName} ${owner.lastName}` };
    const created = new Date(p.createdAt).getTime();
    const clampAt = (t: number) => new Date(Math.min(now.getTime() - HOUR, Math.max(created + HOUR, t)));
    const statusIdx = PRIME_STATUSES.indexOf(primeStatusOf(p));
    const plan: { outcome: "won" | "lost"; at: Date }[] = [];
    if (statusIdx > HRC_INDEX) {
      plan.push({ outcome: "won", at: clampAt(new Date(p.statusChangedAt ?? p.createdAt).getTime() - 26 * HOUR) });
    } else if (statusIdx === HRC_INDEX) {
      const k = psK++;
      if (k % 23 === 4) {
        // Lost, then won later (the win always lands after the loss, even on a recent order)
        const lostAt = clampAt(now.getTime() - (7 + (k % 3)) * 24 * HOUR);
        const wonAt = new Date(Math.min(now.getTime() - 60_000, Math.max(lostAt.getTime() + 2 * HOUR, now.getTime() - (1 + (k % 2)) * 24 * HOUR)));
        plan.push({ outcome: "lost", at: lostAt }, { outcome: "won", at: wonAt });
      }
      else if (k % 9 === 0) plan.push({ outcome: "won", at: clampAt(now.getTime() - (1 + (k % 6)) * 24 * HOUR - (k % 5) * HOUR) });
      else if (k % 9 === 5) plan.push({ outcome: "lost", at: clampAt(now.getTime() - (k % 10) * 24 * HOUR - 2 * HOUR) });
    }
    let q = p;
    plan.forEach((d, j) => {
      const style = (i + j) % 3;
      let opts: CallOptions = DEFAULT_OPTIONS;
      const base = calculate(q, DEFAULT_OPTIONS, today);
      if (d.outcome === "won" && style === 1 && base.paymentOptions.includes("plan")) opts = { ...DEFAULT_OPTIONS, payment: "plan", months: 3 + (i % 4) };
      if (d.outcome === "won" && style === 2 && base.methods.includes("card_on_file")) opts = { ...DEFAULT_OPTIONS, method: "card_on_file" };
      const calc = calculate(q, opts, today);
      if (!calc.ready) return;
      const reason = LOST_REASONS[(i + j) % LOST_REASONS.length];
      const lost = d.outcome === "lost" ? { reason: reason.reason, sub: reason.subs[i % reason.subs.length] } : null;
      const r = {
        ...buildResult({
          outcome: d.outcome,
          patient: q,
          calc,
          opts,
          formSigned: true,
          note: defaultSummary(d.outcome, q, calc, opts, undefined, true, undefined, lost),
          lost,
          user,
          now: d.at,
        }),
        id: `res_seed_${i}_${j}`,
      };
      const { patch, history } = savePatch(q, r);
      q = { ...q, ...patch, history: [{ id: `h_${i}_r${j}`, at: r.at, by: user.name, text: history }, ...q.history] };
    });
    return q;
  });
}
