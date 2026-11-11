// Unit tests for the conversions table. Run: npm run test:conversions
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { conversionFromResult, conversionId, conversionsFromResults, currentConversion, currentIds, totals, voidForResult } from "./conversions";
import { generatePatients, seedCallResults } from "./mock-data";
import type { CallResult, Patient } from "./types";

const patient = generatePatients().find((p) => p.primeStatus === "Patient Sales")!;
const result = (extra: Partial<CallResult>): CallResult => ({
  id: "res_1",
  at: "2026-11-01T15:00:00.000Z",
  byId: "u_riley",
  by: "Riley Abbott",
  outcome: "won",
  orderId: patient.iomsOrderId,
  insurance: "commercial",
  scenarioKey: null,
  formSigned: "prf",
  lines: {} as CallResult["lines"],
  totalEprCents: 51500,
  totalInsuranceCents: 0,
  totalSelfPayCents: 0,
  paymentMethod: "estimate",
  paymentOption: "upfront",
  fhaPercent: 0,
  months: 1,
  amountAgreedCents: 51500,
  amountCollectedCents: 51500,
  collectedAs: "upfront",
  note: "",
  ...extra,
});

describe("Conversions table", () => {
  it("a WON result becomes a row with every Notion field", () => {
    const c = conversionFromResult(result({}), patient, 123)!;
    assert.equal(c.id, "CNV-000123");
    assert.equal(c.orderId, patient.iomsOrderId);
    assert.equal(c.outcome, "won");
    assert.equal(c.decidedAt, "2026-11-01T15:00:00.000Z");
    assert.deepEqual([c.hrcId, c.hrcName], ["u_riley", "Riley Abbott"]);
    assert.equal(c.eprCents, 51500);
    assert.equal(c.paymentType, "paid_in_full_upfront");
    assert.equal(c.collectedUpfrontCents, 51500);
    assert.equal(c.installmentCents, 0);
    assert.equal(c.callResultId, "res_1");
  });

  it("maps payment types and amounts: plan, card on file (hold counts as collected), none", () => {
    const plan = conversionFromResult(result({ paymentOption: "plan", months: 4, amountAgreedCents: 40000, amountCollectedCents: 0, collectedAs: null }), patient, 1)!;
    assert.deepEqual([plan.paymentType, plan.collectedUpfrontCents, plan.installmentCents, plan.installmentMonths], ["payment_plan", 0, 40000, 4]);
    const onFile = conversionFromResult(result({ paymentOption: "card_on_file", amountCollectedCents: 2500, collectedAs: "card_hold", amountAgreedCents: 0 }), patient, 2)!;
    assert.deepEqual([onFile.paymentType, onFile.collectedUpfrontCents], ["card_on_file", 2500]);
    const none = conversionFromResult(result({ paymentOption: null, amountCollectedCents: 0, collectedAs: null }), patient, 3)!;
    assert.equal(none.paymentType, "none");
  });

  it("a LOST result keeps the lost reason; payment-collected results don't create a row", () => {
    const lost = conversionFromResult(result({ outcome: "lost", paymentOption: null, collectedAs: null, amountCollectedCents: 0, lostReason: "Patient Declined", lostSubReason: "Financial" }), patient, 1)!;
    assert.deepEqual([lost.outcome, lost.lostReason, lost.lostSubReason, lost.paymentType], ["lost", "Patient Declined", "Financial", "none"]);
    assert.equal(conversionFromResult(result({ outcome: "payment_collected" }), patient, 1), null);
  });

  it("lost then won: both rows stay, and the order reads as won", () => {
    const lost = conversionFromResult(result({ id: "r1", outcome: "lost", at: "2026-10-01T10:00:00Z" }), patient, 1)!;
    const won = conversionFromResult(result({ id: "r2", outcome: "won", at: "2026-10-05T10:00:00Z" }), patient, 2)!;
    const rows = [lost, won];
    assert.equal(rows.length, 2);
    assert.equal(currentConversion(rows, patient.id)?.id, won.id);
    assert.deepEqual([...currentIds(rows)], [won.id]);
  });

  it("deleting a result voids its row (who and when); voided rows aren't the current outcome or in totals", () => {
    const lost = conversionFromResult(result({ id: "r1", outcome: "lost", at: "2026-10-01T10:00:00Z" }), patient, 1)!;
    const won = conversionFromResult(result({ id: "r2", outcome: "won", at: "2026-10-05T10:00:00Z" }), patient, 2)!;
    const rows = voidForResult([lost, won], "r2", { id: "u_dana", name: "Dana Whitfield" }, "2026-10-06T09:00:00Z");
    assert.equal(rows.length, 2, "never removed");
    assert.deepEqual(rows[1].voided, { at: "2026-10-06T09:00:00Z", byId: "u_dana", by: "Dana Whitfield" });
    assert.equal(rows[1].outcome, "won", "the row itself isn't edited apart from the void stamp");
    assert.equal(currentConversion(rows, patient.id)?.outcome, "lost");
    const t = totals(rows, currentIds(rows));
    assert.deepEqual([t.won, t.lost, t.winRate], [0, 1, 0]);
  });

  it("totals count orders by their current outcome: won, lost, win rate, EPR won, collected upfront", () => {
    const [a, b, c] = generatePatients().slice(0, 3);
    const rows = [
      conversionFromResult(result({ id: "a", totalEprCents: 10000, amountCollectedCents: 10000 }), a, 1)!,
      conversionFromResult(result({ id: "b", totalEprCents: 30000, paymentOption: "plan", collectedAs: null, amountCollectedCents: 0 }), b, 2)!,
      conversionFromResult(result({ id: "c", outcome: "lost", totalEprCents: 99999 }), c, 3)!,
    ];
    assert.deepEqual(totals(rows, currentIds(rows)), { won: 2, lost: 1, winRate: 2 / 3, eprWonCents: 40000, collectedUpfrontCents: 10000 });
  });

  it("an order lost and later won counts once, as won", () => {
    const lost = conversionFromResult(result({ id: "r1", outcome: "lost", at: "2026-10-01T10:00:00Z" }), patient, 1)!;
    const won = conversionFromResult(result({ id: "r2", outcome: "won", at: "2026-10-05T10:00:00Z", totalEprCents: 20000, amountCollectedCents: 20000 }), patient, 2)!;
    const rows = [lost, won];
    assert.deepEqual(totals(rows, currentIds(rows)), { won: 1, lost: 0, winRate: 1, eprWonCents: 20000, collectedUpfrontCents: 20000 });
  });

  it("seed: every order past Patient Sales was won, and some orders in Patient Sales are won too", () => {
    const ps = seedCallResults(generatePatients());
    const rows = conversionsFromResults(ps);
    assert.equal(new Set(rows.map((r) => r.id)).size, rows.length, "unique conversion IDs");
    assert.equal(rows[0].id, conversionId(1));
    assert.ok(ps.some((p) => p.primeStatus === "Patient Sales" && currentConversion(rows, p.id)?.outcome === "won"));
    const later = ps.filter((p) => ["Billing", "In Treatment", "Awaiting Delivery"].includes(p.primeStatus!));
    assert.ok(later.every((p: Patient) => currentConversion(rows, p.id)?.outcome === "won"));
  });
});
