/**
 * Turns script text into structured, filled-in blocks. One renderer for every script (Base44 had two
 * that formatted and filled the same script differently).
 *
 * Placeholders: [NAME] in any case, with "-", "_" or spaces, optionally preceded by "$" (the value
 * already has one). Unknown placeholders are left in and flagged so the rep can fill them by hand.
 */
import { formatDate } from "../dates";
import type { Patient } from "../types";
import { formatCents, installments, MAX_MONTHS, type Calc } from "./calculator";

export type Segment = { text: string; kind: "text" | "value" | "blank" };
export type Line =
  | { kind: "spoken"; segments: Segment[] }
  | { kind: "direction"; segments: Segment[] }
  | { kind: "heading"; text: string };
export interface Block {
  /** null for the main body; otherwise the sub-section title (Fallback, 3A, If They Choose…). */
  title: string | null;
  /** Fallbacks start folded: they're only needed if the patient pushes back. */
  folded: boolean;
  lines: Line[];
}

const norm = (s: string) => s.trim().toUpperCase().replace(/[-\s]+/g, "_");

export function tokenValues(p: Patient, c: Calc, hrcName: string): Record<string, string> {
  const g = c.groups;
  const money = (n: number) => formatCents(n);
  const epr = money(c.totalEpr);
  const selfPayTotal = money(c.totalSelfPay);
  const twelve = installments(c.agreed > 0 ? c.agreed : c.totalSelfPay, MAX_MONTHS);
  const v: Record<string, string> = {
    HRC_NAME: hrcName,
    PATIENT_NAME: `${p.firstName} ${p.lastName}`,
    PATIENT_FIRST_NAME: p.firstName,
    PHYSICIAN_NAME: p.physicianName.replace(/^Dr\.?\s+/i, ""),
    SURGERY_DATE: formatDate(p.surgeryDate),
    PLAN_DAYS: String(c.days),
    NEXT_YEAR: String(c.nextYear ?? new Date().getFullYear() + 1),

    PATIENT_RESPONSIBILITY: epr,
    TOTAL_EPR: epr,
    TOTAL_EPR_AMOUNT: epr,
    INSURANCE_AMOUNT: epr,
    TOTAL_SELF_PAY_AMOUNT: selfPayTotal,
    TOTAL_SELF_PAY_RATE: selfPayTotal,
    FULL_SELF_PAY_AMOUNT: selfPayTotal,
    DENIAL_AMOUNT: money(c.ifDenied),
    DUE_TODAY: money(c.collectedToday),
    INSURANCE_PORTION: money(c.totalInsurance),

    DME_EPR: money(g.dme.estimate),
    RTM_EPR: money(g.therapy.estimate),
    DME_SELF_PAY_AMOUNT: money(g.dme.selfPay),
    DME_SELF_PAY_RATE: money(g.dme.selfPay),
    RTM_SELF_PAY_AMOUNT: money(g.therapy.selfPay),
    RTM_SELF_PAY_RATE: money(g.therapy.selfPay),
    DEPOSIT_AMOUNT: money(g.dme.selfPay + g.therapy.estimate),
    DME_EPR_PLUS_RTM_SELF_PAY: money(g.dme.estimate + g.therapy.selfPay),
    DME_SELF_PAY_PLUS_RTM_EPR: money(g.dme.selfPay + g.therapy.estimate),

    TWELVE_MONTH_PAYMENT: money(twelve[twelve.length - 1]),
  };
  return v;
}

const TOKEN = /\$?\[([A-Za-z0-9_\- ]+)\]/g;

export function fill(text: string, values: Record<string, string>): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index), kind: "text" });
    const val = values[norm(m[1])];
    out.push(val !== undefined ? { text: val, kind: "value" } : { text: `[${m[1]}]`, kind: "blank" });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), kind: "text" });
  return out;
}

export interface RenderContext {
  values: Record<string, string>;
  /** Show the Medicare Advantage 48-hour block (3B). */
  medicareAdvantage: boolean;
  /** Show "MEDICARE ONLY:" lines (Traditional Medicare or Medicare Advantage). */
  medicare: boolean;
  /** Show the "keeping your insurance next year?" check. */
  crossesYear: boolean;
}

export function scriptContext(values: Record<string, string>, c: Calc): RenderContext {
  return {
    values,
    medicareAdvantage: c.insurance === "medicare_advantage",
    medicare: c.insurance === "medicare" || c.insurance === "medicare_advantage",
    crossesYear: c.nextYear !== null,
  };
}

// Lines never contain newlines (content is split on them first), so no dotAll flag is needed
const QUOTED = /^["“](.*)["”]$/;

function parseLine(raw: string, ctx: RenderContext): Line | null {
  let line = raw.trim();
  if (!line) return null;

  const conditionalYear = /^CONDITIONAL IF TP GOES INTO \[NEXT_YEAR\]:\s*/i;
  if (conditionalYear.test(line)) {
    if (!ctx.crossesYear) return null;
    line = line.replace(conditionalYear, "");
  }
  const medicareOnly = /^MEDICARE ONLY:\s*/i;
  if (medicareOnly.test(line)) {
    if (!ctx.medicare) return null;
    line = line.replace(medicareOnly, "");
  }

  // [Heading] on its own line, as long as it isn't a value placeholder
  const heading = line.match(/^\[([^\]]+)\]$/);
  if (heading && ctx.values[norm(heading[1])] === undefined) return { kind: "heading", text: heading[1] };

  const quoted = line.match(QUOTED);
  if (quoted) return { kind: "spoken", segments: fill(quoted[1], ctx.values) };
  if (/^\(.*\)$/.test(line)) return { kind: "direction", segments: fill(line.slice(1, -1), ctx.values) };
  // Mixed lines like `"Question?" (If changing insurance, …)`: speak the quote, keep the rest as a direction
  const lead = line.match(/^["“](.*?)["”]\s*(.*)$/);
  if (lead && lead[2]) {
    return { kind: "spoken", segments: [...fill(lead[1], ctx.values), { text: ` ${lead[2]}`, kind: "text" }] };
  }
  return { kind: "direction", segments: fill(line, ctx.values) };
}

export function renderScript(content: string, ctx: RenderContext): Block[] {
  const blocks: Block[] = [];
  let current: Block = { title: null, folded: false, lines: [] };
  let wantTitle = false;
  const startBlock = (title: string) => {
    if (current.lines.length || current.title) blocks.push(current);
    current = { title, folded: /^fallback/i.test(title), lines: [] };
  };

  for (const raw of content.split("\n")) {
    const t = raw.trim();
    if (t === "---") {
      wantTitle = true;
      continue;
    }
    if (wantTitle && t) {
      wantTitle = false;
      startBlock(t);
      continue;
    }
    if (/^fallback\b/i.test(t) && current.title === null) {
      startBlock(t);
      continue;
    }
    const line = parseLine(raw, ctx);
    if (line) current.lines.push(line);
  }
  if (current.lines.length || current.title) blocks.push(current);

  // 3B is the Medicare Advantage 48-hour window; drop it for everyone else
  return blocks.filter((b) => !(b.title?.startsWith("3B") && !ctx.medicareAdvantage));
}
