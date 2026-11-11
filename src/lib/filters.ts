import { startOfToday } from "./dates";
import { FIELDS_BY_KEY, type FieldCtx, type FieldType } from "./fields";
import { HRC_STATUS } from "./orderStatus";
import { matchesQuick } from "./quickFilters";
import type { Condition, Operator, Patient, SavedFilter, User, UserPrefs, ViewAssignment } from "./types";

export const OPERATOR_LABELS: Record<Operator, string> = {
  is: "is",
  is_not: "is not",
  starts_with: "starts with",
  contains: "contains",
  gt: "is greater than",
  lt: "is less than",
  is_empty: "is empty",
  is_not_empty: "is not empty",
};

export function operatorsFor(type: FieldType): Operator[] {
  switch (type) {
    case "number":
    case "currency":
      return ["is", "is_not", "gt", "lt", "is_empty", "is_not_empty"];
    case "date":
      return ["is", "gt", "lt", "is_empty", "is_not_empty"];
    case "user":
      return ["is", "is_not", "is_empty", "is_not_empty"];
    case "enum":
      return ["is", "is_not", "starts_with", "is_empty", "is_not_empty"];
    default:
      return ["is", "is_not", "starts_with", "contains", "is_empty", "is_not_empty"];
  }
}

export const operatorNeedsValue = (op: Operator) => op !== "is_empty" && op !== "is_not_empty";

/** "@me" resolves to the coordinator whose board is being viewed (F-01, F-08). */
export const ME_TOKEN = "@me";
export const ALL_OWNERS = "*";

export interface EvalCtx extends FieldCtx {
  meId: string;
}

export function evaluateCondition(p: Patient, c: Condition, ctx: EvalCtx): boolean {
  const field = FIELDS_BY_KEY[c.field];
  if (!field) return true;
  // Managers viewing "All coordinators": owner-scoped conditions pass for everyone.
  if (c.value === ME_TOKEN && ctx.meId === ALL_OWNERS) return true;
  const raw = field.get(p, ctx);
  const value = c.value === ME_TOKEN ? ctx.meId : c.value;
  const s = raw === null || raw === undefined ? "" : String(raw);
  const numeric = field.type === "number" || field.type === "currency";

  switch (c.operator) {
    case "is_empty":
      return s === "";
    case "is_not_empty":
      return s !== "";
    case "is":
      return numeric ? Number(raw) === Number(value) && s !== "" : s.toLowerCase() === value.toLowerCase();
    case "is_not":
      return numeric ? Number(raw) !== Number(value) : s.toLowerCase() !== value.toLowerCase();
    case "starts_with":
      return s.toLowerCase().startsWith(value.toLowerCase());
    case "contains":
      return s.toLowerCase().includes(value.toLowerCase());
    case "gt":
      if (s === "") return false;
      return numeric ? Number(raw) > Number(value) : s > value;
    case "lt":
      if (s === "") return false;
      return numeric ? Number(raw) < Number(value) : s < value;
  }
}

/** Pipedrive semantics: every "ALL" condition must match, and at least one "ANY" condition (if any exist); plus the drawer's quick filters. */
export function matchesFilter(p: Patient, f: Pick<SavedFilter, "all" | "any" | "quick">, ctx: EvalCtx): boolean {
  if (!f.all.every((c) => evaluateCondition(p, c, ctx))) return false;
  if (f.any.length > 0 && !f.any.some((c) => evaluateCondition(p, c, ctx))) return false;
  return matchesQuick(p, f.quick, ctx.today ?? startOfToday());
}

/**
 * The scope every HRC board view carries: the board owner's orders ("Owner is me") in the HRC status (Patient Sales).
 * The Filters drawer keeps these out of sight; views saved from the board get them automatically.
 * A won order stays on the board until its status moves on (Notion: "it is the order status which moves them out of the view").
 */
export const isBoardScope = (c: Condition) =>
  c.operator === "is" && ((c.field === "owner" && c.value === ME_TOKEN) || (c.field === "primeStatus" && c.value === HRC_STATUS.prime));
export const boardScope = (): Condition[] => [cond("owner", "is", ME_TOKEN), cond("primeStatus", "is", HRC_STATUS.prime)];

let counter = 0;
export const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}`;

export const cond = (field: string, operator: Operator, value = ""): Condition => ({
  id: newId("c"),
  field,
  operator,
  value,
});

/** F-01: the four standard views every coordinator gets on day one, in fixed order (F-02). */
export const STANDARD_VIEWS: SavedFilter[] = [
  {
    id: "std_all",
    name: "All Patients",
    createdById: null,
    visibility: "shared",
    standard: true,
    all: [{ id: "s1", field: "owner", operator: "is", value: ME_TOKEN }, { id: "s1p", field: "primeStatus", operator: "is", value: HRC_STATUS.prime }],
    any: [],
  },
  {
    id: "std_medicare",
    name: "Medicare",
    createdById: null,
    visibility: "shared",
    standard: true,
    all: [
      { id: "s2", field: "owner", operator: "is", value: ME_TOKEN }, { id: "s2p", field: "primeStatus", operator: "is", value: HRC_STATUS.prime },
      { id: "s3", field: "wipState", operator: "starts_with", value: "13" },
      { id: "s4", field: "mcr", operator: "is", value: "YES" },
    ],
    any: [],
  },
  {
    id: "std_commercial",
    name: "Commercial",
    createdById: null,
    visibility: "shared",
    standard: true,
    all: [
      { id: "s5", field: "owner", operator: "is", value: ME_TOKEN }, { id: "s5p", field: "primeStatus", operator: "is", value: HRC_STATUS.prime },
      { id: "s6", field: "wipState", operator: "starts_with", value: "13" },
      { id: "s7", field: "mcr", operator: "is", value: "NO" },
    ],
    any: [],
  },
  {
    id: "std_selfpay",
    name: "Self-pay",
    createdById: null,
    visibility: "shared",
    standard: true,
    all: [
      { id: "s8", field: "owner", operator: "is", value: ME_TOKEN }, { id: "s8p", field: "primeStatus", operator: "is", value: HRC_STATUS.prime },
      { id: "s9", field: "wipState", operator: "starts_with", value: "15" },
    ],
    any: [],
  },
];

/** All Orders only: every order the HRC owns, in whatever status it sits now. */
export const MY_ORDERS_VIEW: SavedFilter = {
  id: "std_my_orders",
  name: "My orders",
  createdById: null,
  visibility: "shared",
  standard: true,
  all: [{ id: "so1", field: "owner", operator: "is", value: ME_TOKEN }],
  any: [],
};

/**
 * Tabs shown above the board for a user: standard views first (fixed),
 * then admin-assigned views, then the user's own pinned filters in their chosen order.
 */
export function tabsForUser(
  user: User,
  filters: SavedFilter[],
  assignments: ViewAssignment[],
  prefs: UserPrefs,
): SavedFilter[] {
  const byId = Object.fromEntries(filters.map((f) => [f.id, f]));
  const assigned = assignments
    .filter((a) => a.userIds.includes(user.id) || (user.teamId && a.teamIds.includes(user.teamId)))
    .map((a) => byId[a.filterId])
    .filter(Boolean);
  const assignedIds = new Set(assigned.map((f) => f.id));
  const pinned = prefs.pinnedFilterIds.map((id) => byId[id]).filter((f) => f && !f.standard && !assignedIds.has(f.id));
  return [...STANDARD_VIEWS, ...assigned, ...pinned];
}

export function assignedFilterIds(user: User, assignments: ViewAssignment[]): Set<string> {
  return new Set(
    assignments
      .filter((a) => a.userIds.includes(user.id) || (user.teamId && a.teamIds.includes(user.teamId)))
      .map((a) => a.filterId),
  );
}
