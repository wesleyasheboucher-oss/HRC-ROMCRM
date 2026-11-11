/**
 * The editable script library: every script the Call Co-Pilot can show, with the original wording from
 * scripts.ts as the default. Edits are stored separately (see scriptStore.ts) as overrides on top of
 * the originals, so any script can always be restored to the wording it shipped with.
 *
 * Which script is picked for a patient is decided in code (scenario.ts), not here. Editing a script
 * changes what the rep reads, never when it's shown.
 */
import { GAP_EXCEPTION_FAR_DAYS, type ScenarioKey } from "./scenario";
import { DELIVERY_SCRIPTS, INTRODUCTION, OUTCOME_SCRIPTS, PATIENT_EDUCATION, REBUTTALS, type RebuttalTag } from "./scripts";

export type ScriptGroup = "opening" | "outcome" | "delivery" | "rebuttal";

export const GROUP_LABELS: Record<ScriptGroup, string> = {
  opening: "Opening",
  outcome: "Insurance outcome",
  delivery: "Delivery & next steps",
  rebuttal: "Rebuttals",
};

export interface ScriptText {
  title: string;
  content: string;
}

export interface LibraryEntry extends ScriptText {
  id: string;
  group: ScriptGroup;
  /** When the Co-Pilot shows this script. Read-only: the rules live in scenario.ts. */
  usedWhen: string;
  scenarioKey?: ScenarioKey;
  logistics?: keyof typeof DELIVERY_SCRIPTS;
  rebuttalTags?: RebuttalTag[];
}

const USED_WHEN: Record<ScenarioKey, string> = {
  va_pending: "The patient's plan is VA.",
  gap_exception: `The rep turns on "Gap exception" (not Traditional Medicare) and surgery is ${GAP_EXCEPTION_FAR_DAYS} days away or less.`,
  gap_exception_60_plus: `The rep turns on "Gap exception" (not Traditional Medicare) and surgery is more than ${GAP_EXCEPTION_FAR_DAYS} days away.`,
  oon_both: "DME and therapy are both out of network.",
  oon_dme_denied_ot: "DME is out of network and therapy is not covered (self-pay).",
  oon_ot_denied_dme: "Therapy is out of network and DME is not covered (self-pay).",
  oon_dme_only: "DME is out of network and therapy is in network (or pending).",
  oon_rtm_only: "Therapy is out of network and DME is in network.",
  pending_inn: "DME authorization is pending and therapy is in network. Also used when only therapy is pending.",
  pending_oon: "DME authorization is pending and therapy is out of network.",
  pending_denied: "DME authorization is pending and therapy is not covered.",
  medicare_missed_window: "Traditional Medicare and surgery was 2 or more days ago, so the 48-hour start window has passed.",
  medicare_hip: 'Traditional Medicare and the rep turns on "Hip procedure".',
  medicare_medicaid: 'Traditional Medicare and the rep turns on "Medicaid secondary".',
  medicare_zero_epr: "Traditional Medicare, DME covered, and the estimate is $0.",
  medicare_covered: "Traditional Medicare and DME is covered.",
  zero_epr: "Medicare Advantage or commercial and the total estimate is $0.",
  medadv_covered: "Medicare Advantage with DME and therapy both covered.",
  medadv_partial_rtm_denied: "Medicare Advantage with DME covered and therapy not covered.",
  medadv_partial_dme_denied: "Medicare Advantage with therapy covered and DME not covered.",
  commercial_covered: "Commercial (or Worker's Comp) with DME and therapy both covered.",
  commercial_partial_rtm_denied: "Commercial with DME covered and therapy not covered.",
  commercial_partial_dme_denied: "Commercial with therapy covered and DME not covered.",
  not_covered: "Nothing is covered by insurance (or Traditional Medicare with DME not covered).",
};

const DELIVERY_WHEN: Record<keyof typeof DELIVERY_SCRIPTS, string> = {
  DME: "The patient's logistics type is DME (field service / DME delivery).",
  BTX: "The patient's logistics type is BTX (third-party logistics).",
  AIT: "The patient's logistics type is AIT (delivery with self-training).",
};

const TAG_WHEN: Record<RebuttalTag, string> = {
  insurance: "part of the program goes through insurance",
  self_pay: "part of the program is self-pay",
  oon: "a line is out of network",
  exception: "a gap exception is requested",
  surgery_far: "surgery is more than 3 weeks away",
};

/** Rebuttals are stored as paragraphs; in the editor they're one text with a blank line between paragraphs. */
export const toParagraphs = (content: string) =>
  content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

export const LIBRARY: LibraryEntry[] = [
  { id: "intro", group: "opening", ...INTRODUCTION, usedWhen: "Every call, first section." },
  { id: "education", group: "opening", ...PATIENT_EDUCATION, usedWhen: "Every call, after the introduction." },
  ...(Object.keys(OUTCOME_SCRIPTS) as ScenarioKey[]).map(
    (k): LibraryEntry => ({ id: `outcome:${k}`, group: "outcome", ...OUTCOME_SCRIPTS[k], scenarioKey: k, usedWhen: USED_WHEN[k] }),
  ),
  ...(Object.keys(DELIVERY_SCRIPTS) as (keyof typeof DELIVERY_SCRIPTS)[]).map(
    (k): LibraryEntry => ({ id: `delivery:${k}`, group: "delivery", ...DELIVERY_SCRIPTS[k], logistics: k, usedWhen: DELIVERY_WHEN[k] }),
  ),
  ...REBUTTALS.map(
    (r): LibraryEntry => ({
      id: `rebuttal:${r.id}`,
      group: "rebuttal",
      title: r.label,
      content: r.paragraphs.join("\n\n"),
      rebuttalTags: r.tags,
      usedWhen: r.tags.length
        ? `Always listed. Marked "Fits" and shown first when ${r.tags.map((t) => TAG_WHEN[t]).join(", or when ")}.`
        : "Always listed in the Rebuttals panel.",
    }),
  ),
];

export const LIBRARY_BY_ID: Record<string, LibraryEntry> = Object.fromEntries(LIBRARY.map((e) => [e.id, e]));

export const outcomeId = (k: ScenarioKey) => `outcome:${k}`;
export const deliveryId = (k: keyof typeof DELIVERY_SCRIPTS) => `delivery:${k}`;

/** Placeholders the editor offers, with what each one fills in. Every key here is produced by tokenValues (render.ts). */
export const TOKEN_DOCS: { token: string; desc: string; group: "Patient" | "Totals" | "By service" }[] = [
  { token: "HRC_NAME", desc: "Rep's first name", group: "Patient" },
  { token: "PATIENT_NAME", desc: "Patient's full name", group: "Patient" },
  { token: "PATIENT_FIRST_NAME", desc: "Patient's first name", group: "Patient" },
  { token: "PHYSICIAN_NAME", desc: 'Surgeon\'s name without "Dr."', group: "Patient" },
  { token: "SURGERY_DATE", desc: "Surgery date", group: "Patient" },
  { token: "PLAN_DAYS", desc: "Treatment plan length (30, 42 or 60)", group: "Patient" },
  { token: "NEXT_YEAR", desc: "The year the treatment plan runs into", group: "Patient" },
  { token: "TOTAL_EPR", desc: "Total estimated patient responsibility through insurance", group: "Totals" },
  { token: "PATIENT_RESPONSIBILITY", desc: "Same as TOTAL_EPR", group: "Totals" },
  { token: "INSURANCE_AMOUNT", desc: "Same as TOTAL_EPR", group: "Totals" },
  { token: "TOTAL_EPR_AMOUNT", desc: "Same as TOTAL_EPR", group: "Totals" },
  { token: "TOTAL_SELF_PAY_AMOUNT", desc: "Full self-pay price for all services", group: "Totals" },
  { token: "TOTAL_SELF_PAY_RATE", desc: "Same as TOTAL_SELF_PAY_AMOUNT", group: "Totals" },
  { token: "FULL_SELF_PAY_AMOUNT", desc: "Same as TOTAL_SELF_PAY_AMOUNT", group: "Totals" },
  { token: "DENIAL_AMOUNT", desc: "What the patient owes if authorization is denied", group: "Totals" },
  { token: "DUE_TODAY", desc: "Collected today: the full amount when paid upfront, or the card hold ($0 on a monthly plan)", group: "Totals" },
  { token: "INSURANCE_PORTION", desc: "What insurance is expected to pay in total", group: "Totals" },
  { token: "TWELVE_MONTH_PAYMENT", desc: "Monthly payment over 12 months", group: "Totals" },
  { token: "DME_EPR", desc: "DME estimate through insurance", group: "By service" },
  { token: "RTM_EPR", desc: "Therapy (RTM + OT) estimate through insurance", group: "By service" },
  { token: "DME_SELF_PAY_AMOUNT", desc: "DME self-pay price", group: "By service" },
  { token: "DME_SELF_PAY_RATE", desc: "Same as DME_SELF_PAY_AMOUNT", group: "By service" },
  { token: "RTM_SELF_PAY_AMOUNT", desc: "Therapy (RTM + OT) self-pay price", group: "By service" },
  { token: "RTM_SELF_PAY_RATE", desc: "Same as RTM_SELF_PAY_AMOUNT", group: "By service" },
  { token: "DEPOSIT_AMOUNT", desc: "DME self-pay + therapy estimate", group: "By service" },
  { token: "DME_EPR_PLUS_RTM_SELF_PAY", desc: "DME estimate + therapy self-pay", group: "By service" },
  { token: "DME_SELF_PAY_PLUS_RTM_EPR", desc: "DME self-pay + therapy estimate", group: "By service" },
];

// ---- Edits (pure; the React store in scriptStore.ts wraps these) ----

export interface ScriptEdit extends ScriptText {
  at: string;
  by: string;
}

export interface ChangeEntry {
  id: string;
  scriptId: string;
  at: string;
  by: string;
  action: "edited" | "restored";
  before: ScriptText;
  after: ScriptText;
  /** Short name for the version this change created, e.g. "Q4 pricing wording". Can be set or changed later. */
  label?: string;
  /** Why it changed, entered on save. */
  note?: string;
}

export interface EditsState {
  edits: Record<string, ScriptEdit>;
  log: ChangeEntry[];
}

export const EMPTY_EDITS: EditsState = { edits: {}, log: [] };

/** The wording the Co-Pilot uses for a script: the saved edit if there is one, otherwise the original. */
export function resolveScript(state: EditsState, id: string): ScriptText & { edited: boolean; edit?: ScriptEdit } {
  const original = LIBRARY_BY_ID[id];
  const edit = state.edits[id];
  return edit ? { title: edit.title, content: edit.content, edited: true, edit } : { title: original.title, content: original.content, edited: false };
}

const normalize = (t: ScriptText): ScriptText => ({ title: t.title.trim(), content: t.content.replace(/\r\n/g, "\n").replace(/\s+$/, "") });
const same = (a: ScriptText, b: ScriptText) => a.title === b.title && a.content === b.content;

/**
 * Saves new wording for a script. Saving text identical to the original clears the edit, so the script
 * reads as "original" again. Saving with no change does nothing.
 */
export function applySave(state: EditsState, id: string, text: ScriptText, by: string, now = new Date(), meta: { label?: string; note?: string } = {}): EditsState {
  const original = LIBRARY_BY_ID[id];
  if (!original) return state;
  const current = resolveScript(state, id);
  const next = normalize(text);
  if (!next.title) next.title = original.title;
  if (same(next, { title: current.title, content: current.content })) return state;

  const at = now.toISOString();
  const edits = { ...state.edits };
  if (same(next, { title: original.title, content: original.content })) delete edits[id];
  else edits[id] = { ...next, at, by };
  const entry: ChangeEntry = {
    id: `chg_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    scriptId: id,
    at,
    by,
    action: edits[id] ? "edited" : "restored",
    before: { title: current.title, content: current.content },
    after: next,
    ...(meta.label?.trim() ? { label: meta.label.trim() } : {}),
    ...(meta.note?.trim() ? { note: meta.note.trim() } : {}),
  };
  return { edits, log: [entry, ...state.log] };
}

export function applyRestore(state: EditsState, id: string, by: string, now = new Date()): EditsState {
  const original = LIBRARY_BY_ID[id];
  return original ? applySave(state, id, { title: original.title, content: original.content }, by, now) : state;
}

// ---- Versions: the change log read as numbered versions of each script ----

export interface ScriptVersion {
  /** 1 = the original wording; each saved change adds one. */
  n: number;
  /** Change-log id, or "original" for v1. */
  id: string;
  text: ScriptText;
  at: string | null;
  by: string | null;
  kind: "original" | "edited" | "restored";
  label?: string;
  note?: string;
  /** The wording the Co-Pilot uses right now. */
  live: boolean;
}

/** Every version of a script, oldest first. v1 is the wording it shipped with. */
export function scriptVersions(state: EditsState, id: string): ScriptVersion[] {
  const original = LIBRARY_BY_ID[id];
  if (!original) return [];
  const changes = state.log.filter((c) => c.scriptId === id).reverse();
  const versions: ScriptVersion[] = [
    { n: 1, id: "original", text: { title: original.title, content: original.content }, at: null, by: null, kind: "original", live: false },
    ...changes.map((c, i): ScriptVersion => ({ n: i + 2, id: c.id, text: c.after, at: c.at, by: c.by, kind: c.action, label: c.label, note: c.note, live: false })),
  ];
  versions[versions.length - 1].live = true;
  return versions;
}

/** Names (or renames) the version a change created. An empty label clears it. */
export function applyLabel(state: EditsState, changeId: string, label: string): EditsState {
  const t = label.trim();
  let hit = false;
  const log = state.log.map((c) => {
    if (c.id !== changeId) return c;
    hit = true;
    const { label: _old, ...rest } = c;
    void _old;
    return t ? { ...rest, label: t } : rest;
  });
  return hit ? { ...state, log } : state;
}

export type DiffLine = { kind: "same" | "add" | "del"; text: string };

/** Line-by-line diff (longest common subsequence). Scripts are a few hundred lines at most. */
export function diffLines(a: string, b: string): DiffLine[] {
  const x = a.split("\n");
  const y = b.split("\n");
  const m = x.length;
  const n = y.length;
  const L: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (x[i] === y[j]) {
      out.push({ kind: "same", text: x[i] });
      i++;
      j++;
    } else if (L[i + 1][j] >= L[i][j + 1]) out.push({ kind: "del", text: x[i++] });
    else out.push({ kind: "add", text: y[j++] });
  }
  while (i < m) out.push({ kind: "del", text: x[i++] });
  while (j < n) out.push({ kind: "add", text: y[j++] });
  return out;
}

/** Drops edits for scripts that no longer exist (renamed or removed in code). */
export function sanitize(raw: unknown): EditsState {
  const s = raw as Partial<EditsState> | null;
  if (!s || typeof s !== "object") return EMPTY_EDITS;
  const edits = Object.fromEntries(
    Object.entries(s.edits ?? {}).filter(([id, e]) => LIBRARY_BY_ID[id] && typeof e?.content === "string" && typeof e?.title === "string"),
  );
  const log = Array.isArray(s.log) ? s.log.filter((e) => e && LIBRARY_BY_ID[e.scriptId]) : [];
  return { edits, log };
}
