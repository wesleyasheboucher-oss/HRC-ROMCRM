// Unit tests for the Call Co-Pilot logic. Run: npm run test:copilot
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toISODate, addDays, parseISODate } from "../dates";
import { allowable, estimateLines } from "../derive";
import type { EstimateLine, EstimateLineKey, EstimateStatus, Patient } from "../types";
import { calculate, DEFAULT_OPTIONS, installments, type CallOptions } from "./calculator";
import { renderScript, tokenValues, fill } from "./render";
import { resolveScenario, type ScenarioInput } from "./scenario";
import { INTRODUCTION, OUTCOME_SCRIPTS, REBUTTALS } from "./scripts";
import { buildResult, collectedToday, defaultSummary, deletePatch, DUPLICATE_WINDOW_MS, formFor, recentDuplicate, savePatch, wonBlocker } from "./result";
import { applyLabel, applyRestore, applySave, diffLines, EMPTY_EDITS, LIBRARY, LIBRARY_BY_ID, resolveScript, sanitize, scriptVersions, TOKEN_DOCS, toParagraphs } from "./library";

const TODAY = parseISODate("2026-11-03");

function patient(
  insuranceName: string,
  lines: Partial<Record<EstimateLineKey, [EstimateStatus, number | null]>>,
  extra: Partial<Patient> = {},
): Patient {
  const def: [EstimateStatus, number | null] = ["covered", 100];
  const est = Object.fromEntries(
    (["dme", "rtm", "ot"] as const).map((k) => {
      const [status, amount] = lines[k] ?? def;
      return [k, { status, amount } satisfies EstimateLine];
    }),
  ) as Record<EstimateLineKey, EstimateLine>;
  return {
    id: "1",
    firstName: "James",
    lastName: "Shaw",
    ownerId: null,
    callStage: "New Not Called",
    wipState: "13 Ins Cleared: PendConfirmation",
    salesStatus: "",
    btPatientId: "",
    btOrderId: "",
    state: "TN",
    lengthOfNeed: "42",
    age: 60,
    classification: "Ortho",
    doctorNotes: "",
    physicianName: "Dr. Alan Whitcomb",
    iomsOrderId: "",
    mcr: "NO",
    va: "NO",
    insuranceName,
    homePhone: "",
    mobilePhone: "",
    secondaryPhone: "",
    selfPayChargeDate: "",
    agreedSelfPayAmount: null,
    surgeryDate: toISODate(addDays(TODAY, 9)),
    expectedCloseDate: "",
    financialEstimate: null,
    logisticsType: "BTX",
    estimate: est,
    createdAt: "",
    createdBy: "",
    nextTask: null,
    history: [],
    ...extra,
  };
}
const opts = (o: Partial<CallOptions> = {}): CallOptions => ({ ...DEFAULT_OPTIONS, ...o });
const calc = (p: Patient, o: Partial<CallOptions> = {}) => calculate(p, opts(o), TODAY);

describe("installments", () => {
  it("adds up exactly, odd cents on the first payment", () => {
    const parts = installments(100000, 3);
    assert.deepEqual(parts, [33334, 33333, 33333]);
    assert.equal(parts.reduce((a, b) => a + b), 100000);
  });
  it("clamps to 1–12", () => {
    assert.equal(installments(500, 0).length, 1);
    assert.equal(installments(500, 40).length, 12);
  });
});

describe("resolveScenario decision table", () => {
  const base: ScenarioInput = {
    insurance: "commercial",
    dme: "covered",
    therapy: "covered",
    totalEpr: 50000,
    daysToSurgery: 9,
    medicaid: false,
    hip: false,
    gapException: false,
    missedWindow: false,
  };
  const key = (i: Partial<ScenarioInput>) => resolveScenario({ ...base, ...i }).key;
  const cases: [Partial<ScenarioInput>, string][] = [
    [{ insurance: "va", dme: "oon" }, "va_pending"],
    [{ gapException: true }, "gap_exception"],
    [{ gapException: true, daysToSurgery: 61 }, "gap_exception_60_plus"],
    [{ gapException: true, daysToSurgery: 60 }, "gap_exception"],
    [{ dme: "oon", therapy: "oon" }, "oon_both"],
    [{ dme: "oon", therapy: "self_pay" }, "oon_dme_denied_ot"],
    [{ dme: "self_pay", therapy: "oon" }, "oon_ot_denied_dme"],
    [{ dme: "oon" }, "oon_dme_only"],
    [{ therapy: "oon" }, "oon_rtm_only"],
    [{ dme: "pending_auth", therapy: "oon" }, "pending_oon"],
    [{ dme: "pending_auth", therapy: "self_pay" }, "pending_denied"],
    [{ dme: "pending_auth" }, "pending_inn"],
    [{ therapy: "pending_auth" }, "pending_inn"],
    [{ insurance: "medicare", missedWindow: true, hip: true }, "medicare_missed_window"],
    [{ insurance: "medicare", hip: true }, "medicare_hip"],
    [{ insurance: "medicare", medicaid: true }, "medicare_medicaid"],
    [{ insurance: "medicare", totalEpr: 0 }, "medicare_zero_epr"],
    [{ insurance: "medicare" }, "medicare_covered"],
    [{ insurance: "medicare", dme: "self_pay" }, "not_covered"],
    [{ insurance: "medicare", gapException: true }, "medicare_covered"],
    [{ insurance: "medicare_advantage", totalEpr: 0 }, "zero_epr"],
    [{ insurance: "medicare_advantage" }, "medadv_covered"],
    [{ insurance: "medicare_advantage", therapy: "self_pay" }, "medadv_partial_rtm_denied"],
    [{ insurance: "medicare_advantage", dme: "self_pay" }, "medadv_partial_dme_denied"],
    [{ therapy: "self_pay" }, "commercial_partial_rtm_denied"],
    [{ dme: "self_pay" }, "commercial_partial_dme_denied"],
    [{ dme: "self_pay", therapy: "self_pay" }, "not_covered"],
    [{}, "commercial_covered"],
  ];
  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)} → ${expected}`, () => assert.equal(key(input), expected));
  }
  it("flags therapy-only pending as approximate", () => {
    assert.ok(resolveScenario({ ...base, therapy: "pending_auth" }).approximate);
  });
  it("every key has a script", () => {
    for (const [, k] of cases) assert.ok(OUTCOME_SCRIPTS[k as keyof typeof OUTCOME_SCRIPTS], k);
  });
});

describe("calculate", () => {
  it("commercial, all covered: estimate due today, self-pay from the 42-day card", () => {
    const c = calc(patient("BCBS - TN", { dme: ["covered", 1740], rtm: ["covered", 300], ot: ["covered", 430] }));
    assert.equal(c.scenario?.key, "commercial_covered");
    assert.equal(c.totalEpr, 247000);
    assert.equal(c.totalSelfPay, 126000 + 44997, "self-pay OT is included in the RTM self-pay rate");
    assert.equal(c.method, "estimate");
    assert.equal(c.agreed, 247000);
    assert.equal(c.payment, "upfront");
    assert.equal(c.collectedToday, 247000);
  });

  it("insurance portion is the payer allowable minus the patient portion; nothing for self-pay lines", () => {
    const p = patient("BCBS - TN", { dme: ["covered", 1740], rtm: ["self_pay", 450], ot: ["covered", 430] });
    const c = calc(p);
    assert.equal(c.lines.dme.insurance, Math.round(allowable(p, "dme", "covered") * 100) - 174000);
    assert.equal(c.lines.rtm.insurance, 0);
    assert.equal(c.totalInsurance, c.lines.dme.insurance + c.lines.ot.insurance);
    // Out of network bills against the OON card; choosing self-pay drops the insurance portion
    const oon = patient("Cigna", { dme: ["oon", 2500] });
    assert.equal(calc(oon).lines.dme.insurance, Math.round(allowable(oon, "dme", "oon") * 100) - 250000);
    assert.equal(calc(oon, { oonSelfPay: { dme: true, therapy: false } }).lines.dme.insurance, 0);
  });

  it("self-pay lines use the exact self-pay price, not the record's rounded amount", () => {
    const c = calc(patient("BCBS - TN", { dme: ["covered", 1740], rtm: ["self_pay", 450], ot: ["covered", 430] }));
    assert.equal(c.lines.rtm.owe, 44997);
    assert.equal(c.totalEpr, 174000 + 44997 + 43000);
    assert.equal(c.selfPayPortion, 44997);
  });

  it("mixed RTM / OT picks the therapy-denied script and flags it as approximate", () => {
    const c = calc(patient("BCBS - TN", { dme: ["covered", 1740], rtm: ["self_pay", 450], ot: ["covered", 430] }));
    assert.equal(c.scenario?.key, "commercial_partial_rtm_denied");
    assert.match(c.scenario?.approximate ?? "", /RTM is self pay and OT is in network/);
    // Self-pay placeholder is the self-pay line only; estimate placeholder is the insured line only
    assert.equal(c.groups.therapy.selfPay, 44997);
    assert.equal(c.groups.therapy.estimate, 43000);
  });

  it("self-pay OT is included in the RTM self-pay rate; OT only costs extra through insurance", () => {
    // Therapy self pay: RTM's self-pay rate covers OT
    const sp = calc(patient("BCBS - TN", { dme: ["covered", 1000], rtm: ["self_pay", 450], ot: ["self_pay", 302] }));
    assert.equal(sp.lines.ot.owe, 0);
    assert.equal(sp.lines.ot.selfPay, 0);
    assert.equal(sp.groups.therapy.selfPay, 44997);
    // OT through insurance, RTM self pay: OT's estimate is a separate cost
    const mixed = calc(patient("BCBS - TN", { dme: ["covered", 1000], rtm: ["self_pay", 450], ot: ["covered", 150] }));
    assert.equal(mixed.lines.ot.owe, 15000);
    assert.equal(mixed.totalEpr, 100000 + 44997 + 15000);
    // Out of network at the self-pay price: same rule
    const oon = calc(patient("BCBS - TN", { rtm: ["oon", 450], ot: ["oon", 302] }), { oonSelfPay: { dme: false, therapy: true } });
    assert.equal(oon.lines.ot.owe, 0);
    assert.equal(oon.groups.therapy.owe, 44997);
  });

  it("FHA discounts only the self-pay share of today's amount", () => {
    const c = calc(patient("BCBS - TN", { dme: ["covered", 1000], rtm: ["self_pay", 450], ot: ["self_pay", 302] }), { fha: 50 });
    assert.equal(c.selfPayPortion, 44997, "self-pay OT is included in the RTM self-pay rate");
    assert.equal(c.fhaSavings, Math.round(44997 / 2));
    assert.equal(c.agreed, 100000 + 44997 - c.fhaSavings);
  });

  it("monthly plan: installments add up to the agreed amount and nothing counts as collected today", () => {
    const c = calc(patient("BCBS - TN", { dme: ["covered", 1000.01] }), { payment: "plan", months: 3 });
    assert.equal(c.installments.length, 3);
    assert.equal(c.installments.reduce((a, b) => a + b), c.agreed);
    assert.equal(c.collectedToday, 0);
    // months only apply to a plan
    assert.equal(calc(patient("BCBS - TN", {}), { payment: "upfront", months: 6 }).installments.length, 1);
  });

  it("card on file is a 'Patient pays' choice, offered only when no service is self pay", () => {
    // All in network: offered last, not the default; payment is upfront or plan only
    const firm = calc(patient("BCBS - TN", {}));
    assert.equal(firm.methods.at(-1), "card_on_file");
    assert.equal(firm.method, "estimate");
    assert.deepEqual(firm.paymentOptions, ["upfront", "plan"]);
    assert.equal(calc(patient("BCBS - TN", {}), { payment: "card_on_file" }).payment, "upfront", "card on file can't be forced as a payment");

    // All out of network, or a mix of in and out of network: still offered
    assert.ok(calc(patient("BCBS - TN", { dme: ["oon", 1000], rtm: ["oon", 450], ot: ["oon", 302] })).methods.includes("card_on_file"));
    assert.ok(calc(patient("BCBS - TN", { dme: ["covered", 1000], rtm: ["oon", 450], ot: ["covered", 302] })).methods.includes("card_on_file"));

    // Any self-pay service: not offered (on the record, or out of network taken at the self-pay price)
    assert.ok(!calc(patient("BCBS - TN", { dme: ["covered", 1000], rtm: ["self_pay", 450], ot: ["covered", 302] })).methods.includes("card_on_file"));
    assert.ok(!calc(patient("BCBS - TN", { dme: ["oon", 1000] }), { oonSelfPay: { dme: true, therapy: false } }).methods.includes("card_on_file"));

    // Pending authorization: offered after the other choices, not the default
    const pend = patient("BCBS - TN", { dme: ["pending_auth", 200] });
    assert.deepEqual(calc(pend).methods.at(-1), "card_on_file");
    assert.equal(calc(pend).method, "estimate");
    const c = calc(pend, { method: "card_on_file", fha: 50 });
    assert.equal(c.payment, "card_on_file");
    assert.deepEqual(c.paymentOptions, [], "no payment step for card on file");
    assert.equal(c.collectedToday, 2500, "the $25 hold is collected today");
    assert.equal(c.hold, 2500);
    assert.equal(c.agreed, 0, "nothing firm agreed");
    assert.equal(c.fhaSavings, 0);
    assert.ok(c.cardOnFile);
  });

  it("not verified yet: not ready, no outcome script, nothing due", () => {
    const c = calc(patient("BCBS - TN", { dme: ["pending_auth", null], rtm: ["pending_auth", null], ot: ["pending_auth", null] }));
    assert.equal(c.ready, false);
    assert.equal(c.scenario, null);
    assert.equal(c.collectedToday, 0);
    assert.equal(c.payment, null);
  });

  it("gap exception: card on file, $0 today", () => {
    const c = calc(patient("Aetna", {}), { gapException: true });
    assert.deepEqual(c.methods, ["card_on_file"]);
    assert.equal(c.payment, "card_on_file");
    assert.equal(c.collectedToday, 0);
    assert.equal(c.hold, 0);
    assert.ok(c.cardOnFile);
  });

  it("$0 estimate: card on file only, $25 hold collected", () => {
    const c = calc(patient("Humana Gold - MCR", { dme: ["covered", 0], rtm: ["covered", 0], ot: ["covered", 0] }));
    assert.equal(c.scenario?.key, "zero_epr");
    assert.deepEqual(c.methods, ["card_on_file"]);
    assert.equal(c.payment, "card_on_file");
    assert.equal(c.hold, 2500);
    assert.equal(c.collectedToday, 2500);
    assert.equal(tokenValues(patient("Humana Gold - MCR", { dme: ["covered", 0], rtm: ["covered", 0], ot: ["covered", 0] }), c, "Riley").DUE_TODAY, "$25", "scripts still quote the hold as due today");
  });

  it("VA estimate: each line is covered at $0 or self pay, never coinsurance, pending or out of network", () => {
    for (let id = 1; id <= 40; id++) {
      const base = { ...patient("VA COMMUNITY CARE", {}, { id: String(id), va: "YES" }), estimate: undefined };
      for (const wip of ["13 Ins Cleared: PendConfirmation", "15 Not Covered"]) {
        const lines = estimateLines({ ...base, wipState: wip });
        for (const l of Object.values(lines)) {
          assert.ok(l.status === "covered" || l.status === "self_pay", `${id} ${wip} ${l.status}`);
          if (l.status === "covered") assert.equal(l.amount, 0);
        }
      }
    }
  });

  it("Medicare hip makes DME self pay", () => {
    const c = calc(patient("MEDICARE", { dme: ["covered", 200] }), { hip: true });
    assert.equal(c.scenario?.key, "medicare_hip");
    assert.equal(c.lines.dme.status, "self_pay");
    assert.equal(c.lines.dme.owe, 126000);
  });

  it("Medicare missed window: two days after surgery, every line self pay", () => {
    const p = patient("MEDICARE", {}, { surgeryDate: toISODate(addDays(TODAY, -2)) });
    const c = calc(p);
    assert.equal(c.scenario?.key, "medicare_missed_window");
    assert.equal(c.totalEpr, c.totalSelfPay);
    assert.equal(calc(patient("MEDICARE", {}, { surgeryDate: toISODate(addDays(TODAY, -1)) })).missedWindow, false);
  });

  it("out of network: patient can switch that portion to self-pay", () => {
    const p = patient("Cigna", { dme: ["oon", 2500], rtm: ["covered", 100], ot: ["covered", 50] });
    const viaIns = calc(p);
    const viaSp = calc(p, { oonSelfPay: { dme: true, therapy: false } });
    assert.equal(viaIns.scenario?.key, "oon_dme_only");
    assert.equal(viaIns.totalEpr, 250000 + 10000 + 5000);
    assert.equal(viaSp.totalEpr, 126000 + 10000 + 5000);
  });

  it("VA: nothing collected", () => {
    const c = calc(patient("VA Community Care", {}, { va: "YES" }));
    assert.equal(c.scenario?.key, "va_pending");
    assert.equal(c.method, "none");
    assert.equal(c.payment, null);
    assert.equal(c.collectedToday, 0);
  });

  it("treatment plan crossing 1 January asks about next year's insurance", () => {
    assert.equal(calc(patient("Aetna", {}, { surgeryDate: "2026-12-10" })).nextYear, 2027);
    assert.equal(calc(patient("Aetna", {}, { surgeryDate: "2026-11-01" })).nextYear, null);
  });
});

describe("render", () => {
  const p = patient("BCBS - TN", { dme: ["covered", 1740], rtm: ["self_pay", 450], ot: ["covered", 430] });
  const c = calc(p);
  const values = tokenValues(p, c, "Riley");
  const ctx = { values, medicareAdvantage: false, medicare: false, crossesYear: false };
  const text = (content: string) =>
    renderScript(content, ctx)
      .flatMap((b) => b.lines)
      .map((l) => (l.kind === "heading" ? l.text : l.segments.map((s) => s.text).join("")))
      .join("\n");

  it("fills placeholders in any case / separator, and doesn't double the $", () => {
    assert.equal(fill("about $[total-epr] or [Dme_Self_Pay_Rate]", values).map((s) => s.text).join(""), "about $2,619.97 or $1,260");
  });
  it("leaves unknown placeholders in and flags them", () => {
    const segs = fill("at [read full address].", values);
    assert.equal(segs.find((s) => s.kind === "blank")?.text, "[read full address]");
  });
  it("strips Dr. so 'Dr. [PHYSICIAN_NAME]' doesn't read 'Dr. Dr.'", () => {
    assert.equal(values.PHYSICIAN_NAME, "Alan Whitcomb");
  });
  it("drops the Medicare Advantage 3B block for commercial patients", () => {
    const blocks = renderScript(OUTCOME_SCRIPTS.oon_both.content, ctx);
    assert.ok(!blocks.some((b) => b.title?.startsWith("3B")));
    assert.ok(renderScript(OUTCOME_SCRIPTS.oon_both.content, { ...ctx, medicareAdvantage: true }).some((b) => b.title?.startsWith("3B")));
  });
  it("folds fallbacks, including ones without a --- separator", () => {
    const blocks = renderScript(OUTCOME_SCRIPTS.commercial_partial_rtm_denied.content, ctx);
    assert.equal(blocks[0].title, null);
    assert.ok(blocks.some((b) => b.folded && /^Fallback/.test(b.title ?? "")));
  });
  it("hides the next-year check unless the plan crosses 1 January", () => {
    const line = `CONDITIONAL IF TP GOES INTO [NEXT_YEAR]: "Keeping your insurance for [NEXT_YEAR]?"`;
    assert.equal(text(line), "");
    assert.equal(renderScript(line, { ...ctx, crossesYear: true, values: { ...values, NEXT_YEAR: "2027" } })[0].lines.length, 1);
  });
  it("every outcome script renders with no unfilled placeholders", () => {
    for (const [k, s] of Object.entries(OUTCOME_SCRIPTS)) {
      const blanks = renderScript(s.content, { ...ctx, medicareAdvantage: true })
        .flatMap((b) => b.lines)
        .flatMap((l) => (l.kind === "heading" ? [] : l.segments))
        .filter((seg) => seg.kind === "blank");
      assert.deepEqual(blanks, [], k);
    }
  });
});

describe("script library", () => {
  it("has one entry per outcome key, delivery type and rebuttal, with unique ids", () => {
    const ids = LIBRARY.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const k of Object.keys(OUTCOME_SCRIPTS)) assert.ok(LIBRARY_BY_ID[`outcome:${k}`], k);
    for (const k of ["DME", "BTX", "AIT"]) assert.ok(LIBRARY_BY_ID[`delivery:${k}`], k);
    assert.equal(LIBRARY.filter((e) => e.group === "rebuttal").length, REBUTTALS.length);
    for (const e of LIBRARY) assert.ok(e.usedWhen.length > 0, e.id);
  });

  it("documents exactly the placeholders the renderer fills", () => {
    const p = patient("Aetna", {});
    const keys = Object.keys(tokenValues(p, calculate(p, DEFAULT_OPTIONS, TODAY), "Sam")).sort();
    assert.deepEqual(TOKEN_DOCS.map((t) => t.token).sort(), keys);
  });

  it("rebuttal paragraphs survive the round trip through the editor", () => {
    for (const r of REBUTTALS) assert.deepEqual(toParagraphs(LIBRARY_BY_ID[`rebuttal:${r.id}`].content), r.paragraphs);
  });

  it("saves an edit, logs it, and restores the original", () => {
    const now = new Date("2026-11-03T12:00:00Z");
    let s = applySave(EMPTY_EDITS, "intro", { title: "Intro", content: '"Hello [PATIENT_FIRST_NAME]"' }, "Riley", now);
    assert.equal(resolveScript(s, "intro").content, '"Hello [PATIENT_FIRST_NAME]"');
    assert.equal(resolveScript(s, "intro").edited, true);
    assert.equal(s.log.length, 1);
    assert.equal(s.log[0].before.content, INTRODUCTION.content);

    assert.equal(applySave(s, "intro", { title: "Intro", content: '"Hello [PATIENT_FIRST_NAME]"  \n' }, "Riley", now), s, "no-op save");

    s = applyRestore(s, "intro", "Riley", now);
    assert.equal(resolveScript(s, "intro").edited, false);
    assert.equal(resolveScript(s, "intro").content, INTRODUCTION.content);
    assert.equal(s.log[0].action, "restored");
    assert.equal(s.log.length, 2);
  });

  it("saving the original text by hand clears the edit; a blank title keeps the original title", () => {
    const now = new Date("2026-11-03T12:00:00Z");
    let s = applySave(EMPTY_EDITS, "intro", { title: "X", content: "changed" }, "Riley", now);
    s = applySave(s, "intro", { title: INTRODUCTION.title, content: INTRODUCTION.content }, "Riley", now);
    assert.deepEqual(s.edits, {});
    s = applySave(s, "intro", { title: "  ", content: "changed" }, "Riley", now);
    assert.equal(resolveScript(s, "intro").title, INTRODUCTION.title);
  });

  it("reads the change log as numbered versions, with names and notes", () => {
    const t = (min: number) => new Date(`2026-11-03T12:0${min}:00Z`);
    assert.deepEqual(scriptVersions(EMPTY_EDITS, "intro").map((v) => [v.n, v.kind, v.live]), [[1, "original", true]]);
    let s = applySave(EMPTY_EDITS, "intro", { title: "Intro", content: "a" }, "Riley", t(1), { label: " Short intro ", note: "Trimmed" });
    s = applySave(s, "intro", { title: "Intro", content: "b" }, "Jordan", t(2));
    s = applyRestore(s, "intro", "Riley", t(3));
    const vs = scriptVersions(s, "intro");
    assert.deepEqual(vs.map((v) => [v.n, v.kind, v.live]), [[1, "original", false], [2, "edited", false], [3, "edited", false], [4, "restored", true]]);
    assert.equal(vs[1].label, "Short intro");
    assert.equal(vs[1].note, "Trimmed");
    assert.equal(vs[2].by, "Jordan");
    assert.equal(vs[3].text.content, INTRODUCTION.content);

    s = applyLabel(s, vs[2].id, "Jordan's take");
    assert.equal(scriptVersions(s, "intro")[2].label, "Jordan's take");
    s = applyLabel(s, vs[2].id, "  ");
    assert.equal(scriptVersions(s, "intro")[2].label, undefined);
    assert.equal(applyLabel(s, "nope", "x"), s);
  });

  it("diffs scripts line by line", () => {
    assert.deepEqual(diffLines("a\nb\nc", "a\nB\nc\nd"), [
      { kind: "same", text: "a" },
      { kind: "del", text: "b" },
      { kind: "add", text: "B" },
      { kind: "same", text: "c" },
      { kind: "add", text: "d" },
    ]);
  });

  it("drops saved edits for scripts that no longer exist", () => {
    const s = sanitize({ edits: { "outcome:gone": { title: "a", content: "b", at: "", by: "" }, intro: { title: "a", content: "b", at: "", by: "" } }, log: [] });
    assert.deepEqual(Object.keys(s.edits), ["intro"]);
    assert.deepEqual(sanitize(null), EMPTY_EDITS);
  });
});

describe("call result", () => {
  const user = { id: "u_riley", name: "Riley Abbott" };
  const NOW = new Date("2026-11-03T15:00:00Z");

  it("WON needs a verified estimate and the right signed form", () => {
    const mcr = calc(patient("MEDICARE", {}));
    assert.equal(formFor(mcr), "abn");
    assert.match(wonBlocker(mcr, false)!, /ABN/);
    assert.equal(wonBlocker(mcr, true), null);
    const comm = calc(patient("Aetna", {}));
    assert.equal(formFor(comm), "prf");
    assert.match(wonBlocker(comm, false)!, /Patient Responsibility Form/);
  });

  it("snapshots what was agreed; a payment plan records nothing collected at WON", () => {
    const p = patient("Aetna", { dme: ["covered", 500], rtm: ["self_pay", null], ot: ["covered", 100] });
    const o = opts({ payment: "plan", months: 3 });
    const c = calculate(p, o, TODAY);
    const r = buildResult({ outcome: "won", patient: p, calc: c, opts: o, formSigned: true, note: " summary ", user, now: NOW });
    assert.equal(r.amountAgreedCents, c.agreed);
    assert.equal(r.paymentOption, "plan");
    assert.equal(r.collectedAs, null);
    assert.equal(r.totalInsuranceCents, c.totalInsurance);
    assert.equal(r.amountCollectedCents, 0);
    assert.equal(r.months, 3);
    assert.equal(r.formSigned, "prf");
    assert.equal(r.paymentMethod, c.method);
    assert.equal(r.lines.rtm.viaSelfPay, true);
    assert.equal(r.orderId, p.iomsOrderId);
    assert.equal(r.note, "summary");
    assert.equal(r.at, NOW.toISOString());
  });

  it("LOST records no payment; payment-only records the amount", () => {
    const p = patient("Aetna", {});
    const c = calc(p);
    const lost = buildResult({ outcome: "lost", patient: p, calc: c, opts: DEFAULT_OPTIONS, formSigned: false, note: "x", user, now: NOW });
    assert.equal(lost.amountCollectedCents, 0);
    assert.equal(lost.paymentMethod, null);
    assert.equal(lost.collectedAs, null);
    const pay = buildResult({ outcome: "payment_collected", patient: p, calc: c, opts: DEFAULT_OPTIONS, formSigned: false, note: "x", payment: { cents: 12345, as: "upfront", months: 3 }, user, now: NOW });
    assert.equal(pay.amountCollectedCents, 12345);
    assert.equal(pay.collectedAs, "upfront");
    assert.equal(pay.months, 1);
    const inst = buildResult({ outcome: "payment_collected", patient: p, calc: c, opts: DEFAULT_OPTIONS, formSigned: false, note: "x", payment: { cents: 5000, as: "installment", months: 6 }, user, now: NOW });
    assert.equal(inst.collectedAs, "installment");
    assert.equal(inst.paymentOption, "plan");
    assert.equal(inst.months, 6);
  });

  it("card on file records the full estimate, the $25 hold as collected, and the hold; upfront is recorded as upfront", () => {
    const p = patient("Aetna", { dme: ["pending_auth", 200] });
    const o = opts({ method: "card_on_file" });
    const c = calculate(p, o, TODAY);
    assert.equal(collectedToday(c), 2500);
    const r0 = buildResult({ outcome: "won", patient: p, calc: c, opts: o, formSigned: true, note: "x", user, now: NOW });
    assert.equal(r0.paymentMethod, "card_on_file");
    assert.equal(r0.paymentOption, "card_on_file");
    assert.equal(r0.totalEprCents, c.totalEpr);
    assert.equal(r0.amountCollectedCents, 2500);
    assert.equal(r0.collectedAs, "card_hold");
    assert.equal(r0.holdCents, 2500);
    assert.ok(!("chargeLaterCents" in r0));
    assert.match(defaultSummary("won", p, c, o, undefined, true), /Collected today: \$25(\.00)? · card on file with a \$25(\.00)? hold/);
    const up = calculate(p, DEFAULT_OPTIONS, TODAY);
    const r = buildResult({ outcome: "won", patient: p, calc: up, opts: DEFAULT_OPTIONS, formSigned: true, note: "x", user, now: NOW });
    assert.equal(r.collectedAs, "upfront");
    assert.equal(r.amountCollectedCents, up.agreed);
  });

  it("saving adds the result and an Activity note; duplicates within 24 hours are detected", () => {
    const p = patient("Aetna", {});
    const c = calc(p);
    const r = buildResult({ outcome: "won", patient: p, calc: c, opts: DEFAULT_OPTIONS, formSigned: true, note: "hello", user, now: NOW });
    const { patch, history } = savePatch(p, r);
    const saved = { ...p, ...patch };
    assert.equal(saved.callResults![0].id, r.id);
    assert.equal(saved.activities![0].summary, "Result: WON\nhello");
    assert.equal(savePatch(p, { ...r, note: "Result: WON\nx" }).patch.activities![0].summary, "Result: WON\nx");
    assert.match(history, /Won/);
    assert.ok(recentDuplicate(saved, "won", new Date(NOW.getTime() + 60_000)));
    assert.equal(recentDuplicate(saved, "lost", NOW), null);
    assert.equal(recentDuplicate(saved, "won", new Date(NOW.getTime() + DUPLICATE_WINDOW_MS + 1)), null);
    const del = deletePatch(saved, r.id)!;
    assert.deepEqual(del.patch.callResults, []);
  });

  it("the WON summary leads with the result and the signed form", () => {
    const p = patient("MEDICARE", {});
    const c = calc(p);
    const s = defaultSummary("won", p, c, DEFAULT_OPTIONS, "Traditional Medicare — Covered", true);
    assert.match(s, /^Result: WON\nABN signed\./);
    assert.match(s, /Script: Traditional Medicare — Covered/);
  });
});
