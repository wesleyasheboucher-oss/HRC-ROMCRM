// Unit tests for the Lead Stream assignment engine. Run: npm run test:lead-stream
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ALL_ORDER_TYPES, assignLead, countToday, defaultRule, migrateRules, withEveryHrc } from "./assignment";
import { toISODate } from "./dates";
import { generateLead, USERS } from "./mock-data";
import type { AssignmentLogEntry, AssignmentRule, LegacyAssignmentRule, Line, Patient } from "./types";

const byId = Object.fromEntries(USERS.map((u) => [u.id, u]));
const rule = (userId: string, line: Line, extra: Partial<AssignmentRule> = {}): AssignmentRule => ({ ...defaultRule(userId, line), active: true, ...extra });
const order = (line: Line, extra: Partial<Patient> = {}): Patient => ({
  ...generateLead(1, line),
  wipState: "13 Ins Cleared: PendConfirmation",
  mcr: "NO",
  va: "NO",
  logisticsType: "BTX",
  ...extra,
});

/** Runs `n` orders through the engine like intake does, counting assignments. */
function run(n: number, rules: AssignmentRule[], make: (i: number) => Patient) {
  const counts: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const r = assignLead(make(i), rules, byId, counts);
    if (r.assignedToId) counts[r.assignedToId] = (counts[r.assignedToId] ?? 0) + 1;
  }
  return counts;
}

describe("Lead Stream assignment", () => {
  it("shares orders by weight: weight 2 gets twice weight 1", () => {
    const rules = [rule("u_riley", "ortho", { weight: 2, dailyMax: 100 }), rule("u_jordan", "ortho", { weight: 1, dailyMax: 100 })];
    const c = run(30, rules, () => order("ortho"));
    assert.equal(c.u_riley, 20);
    assert.equal(c.u_jordan, 10);
  });

  it("ties go to the earlier last name", () => {
    const rules = [rule("u_jordan", "ortho"), rule("u_riley", "ortho")]; // Ellis, Abbott
    assert.equal(assignLead(order("ortho"), rules, byId, {}).assignedToId, "u_riley");
  });

  it("an HRC at their daily cap gets no new orders; when everyone is, overflow goes to the first by last name", () => {
    const rules = [rule("u_riley", "ortho", { dailyMax: 2 }), rule("u_jordan", "ortho", { dailyMax: 3 })];
    const c = run(5, rules, () => order("ortho"));
    assert.deepEqual(c, { u_riley: 2, u_jordan: 3 });
    const over = assignLead(order("ortho"), rules, byId, c);
    assert.equal(over.assignedToId, "u_riley");
    assert.match(over.reason, /Overflow/);
  });

  it("Ortho and Cardiac pages are separate: a cardiac order only uses cardiac rules", () => {
    const rules = [rule("u_riley", "ortho"), rule("u_priya", "cardiac")];
    assert.equal(assignLead(order("cardiac"), rules, byId, {}).assignedToId, "u_priya");
    assert.equal(assignLead(order("ortho"), rules, byId, {}).assignedToId, "u_riley");
    const none = assignLead(order("cardiac"), [rule("u_riley", "ortho")], byId, {});
    assert.equal(none.assignedToId, null);
    assert.match(none.reason, /Cardiac/);
    // An HRC works one line: Riley (Ortho) never gets a cardiac order, even with a stray cardiac rule
    assert.equal(assignLead(order("cardiac"), [rule("u_riley", "cardiac")], byId, {}).assignedToId, null);
  });

  it("an HRC never gets an order type they've unticked (payer, VA, logistics)", () => {
    const picky = rule("u_riley", "ortho", { weight: 100, orderTypes: { payer: ["commercial"], va: false, logistics: ["BTX"] } });
    const other = rule("u_jordan", "ortho");
    const rules = [picky, other];
    assert.equal(assignLead(order("ortho"), rules, byId, {}).assignedToId, "u_riley");
    assert.equal(assignLead(order("ortho", { mcr: "YES" }), rules, byId, {}).assignedToId, "u_jordan", "Medicare unticked");
    assert.equal(assignLead(order("ortho", { va: "YES" }), rules, byId, {}).assignedToId, "u_jordan", "VA unticked");
    assert.equal(assignLead(order("ortho", { logisticsType: "AIT" }), rules, byId, {}).assignedToId, "u_jordan", "AIT unticked");
    assert.equal(assignLead(order("ortho", { mcr: "YES" }), [picky], byId, {}).assignedToId, null, "nobody else: unassigned");
  });

  it("inactive HRCs and exclusion conditions are skipped", () => {
    const rules = [rule("u_riley", "ortho", { active: false }), rule("u_jordan", "ortho", { exclusions: [{ id: "x", field: "state", operator: "is", value: "TN" }] }), rule("u_taylor", "ortho")];
    assert.equal(assignLead(order("ortho", { state: "TN" }), rules, byId, {}).assignedToId, "u_taylor");
  });

  it("migrates percentages to weights: ÷ smallest active percentage, rounded, at least 1; lead types and VA carry over", () => {
    const legacy: LegacyAssignmentRule[] = [
      { userId: "u_riley", active: true, percentage: 25, dailyMax: 20, leadTypes: ["medicare", "commercial"], exclusions: [] },
      { userId: "u_jordan", active: true, percentage: 10, dailyMax: 15, leadTypes: ["selfpay"], acceptsVa: false, exclusions: [] },
      { userId: "u_sam", active: false, percentage: 2, dailyMax: 10, leadTypes: ["other"], exclusions: [] },
    ];
    const [riley, jordan, sam] = migrateRules(legacy, USERS);
    assert.equal(riley.weight, 3); // 25 / 10 = 2.5 → 3
    assert.equal(jordan.weight, 1);
    assert.equal(sam.weight, 1, "inactive 2% → at least 1, and not used as the smallest");
    assert.equal(riley.line, "ortho");
    assert.equal(sam.line, "cardiac", "each rule lands on the HRC's own line");
    assert.deepEqual(riley.orderTypes, { ...ALL_ORDER_TYPES(), payer: ["medicare", "commercial"] });
    assert.equal(jordan.orderTypes.va, false);
  });

  it("every HRC has one rule, on their own line's page; new ones start inactive", () => {
    const hrcs = USERS.filter((u) => u.role === "coordinator");
    const all = withEveryHrc([rule("u_riley", "ortho"), rule("u_riley", "cardiac"), rule("u_priya", "ortho")], hrcs);
    assert.equal(all.length, hrcs.length);
    assert.deepEqual(all.filter((r) => r.userId === "u_riley").map((r) => r.line), ["ortho"]);
    assert.deepEqual(all.filter((r) => r.userId === "u_priya").map((r) => [r.line, r.active]), [["cardiac", false]]);
  });

  it("only automatic assignments count toward today's cap, per line", () => {
    const today = toISODate(new Date());
    const at = new Date().toISOString();
    const e = (kind: AssignmentLogEntry["kind"], line: Line, who: string): AssignmentLogEntry => ({ id: kind + line + who, at, patientId: "1", patientName: "x", leadType: "commercial", line, kind, assignedToId: who, reason: "" });
    const c = countToday([e("auto", "ortho", "u_riley"), e("auto", "cardiac", "u_riley"), e("kept", "ortho", "u_riley"), e("reassign", "ortho", "u_riley")], today, toISODate);
    assert.deepEqual(c, { ortho: { u_riley: 1 }, cardiac: { u_riley: 1 } });
  });
});
