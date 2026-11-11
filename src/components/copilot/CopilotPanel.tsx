"use client";

import { AlertTriangle, ChevronDown, CreditCard, MessageSquareQuote } from "lucide-react";
import { useMemo, useState } from "react";
import {
  calculate,
  DEFAULT_OPTIONS,
  FHA_OPTIONS,
  formatCents,
  formatCentsExact,
  MAX_MONTHS,
  methodLabel,
  PAYMENT_LABELS,
  CARD_HOLD_CENTS,
  type CallOptions,
  type Calc,
  type FhaPercent,
  type PaymentMethod,
  type PaymentOption,
} from "@/lib/copilot/calculator";
import { deliveryId, LIBRARY, outcomeId, toParagraphs } from "@/lib/copilot/library";
import { renderScript, fill, scriptContext, tokenValues, type Block, type Line, type Segment } from "@/lib/copilot/render";
import { useScriptEdits } from "@/lib/copilot/scriptStore";
import type { RebuttalTag } from "@/lib/copilot/scripts";
import { ESTIMATE_LINES } from "@/lib/fields";
import { useStore } from "@/lib/store";
import type { EstimateStatus, Patient } from "@/lib/types";
import { ChoiceGroup, Stepper, Switch, cx } from "../ui";
import { SaveResult } from "./SaveResult";

/**
 * Call Co-Pilot tab: the call script for this patient on the left, the pricing calculator on the right.
 * Everything is read from the record; the rep only sets what the record can't know yet.
 * Call-time choices reset when you switch patients (the parent keys this component by patient id).
 */
export function CopilotPanel({ patient }: { patient: Patient }) {
  const { currentUser } = useStore();
  const [opts, setOpts] = useState<CallOptions>(DEFAULT_OPTIONS);
  const set = (patch: Partial<CallOptions>) => setOpts((o) => ({ ...o, ...patch }));

  const calc = useMemo(() => calculate(patient, opts), [patient, opts]);
  const values = useMemo(() => tokenValues(patient, calc, currentUser.firstName), [patient, calc, currentUser.firstName]);
  const ctx = useMemo(() => scriptContext(values, calc), [values, calc]);

  // Wording comes from the Call Scripts page (saved edits, or the original)
  const { script } = useScriptEdits();
  const intro = script("intro");
  const education = script("education");
  const outcome = calc.scenario ? script(outcomeId(calc.scenario.key)) : null;
  const delivery = script(deliveryId(calc.logistics));
  const sections = [
    { id: "intro", title: intro.title, blocks: renderScript(intro.content, ctx) },
    { id: "education", title: education.title, blocks: renderScript(education.content, ctx) },
    { id: "outcome", title: outcome ? `Insurance Outcome — ${outcome.title}` : "Insurance Outcome", blocks: outcome ? renderScript(outcome.content, ctx) : [] },
    { id: "delivery", title: delivery.title, blocks: renderScript(delivery.content, ctx) },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 @[640px]:grid-cols-[minmax(0,1fr)_340px]">
      {/* Script */}
      <div className="min-w-0 space-y-3">
        <nav aria-label="Script sections" className="flex flex-wrap gap-1.5">
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#copilot-${s.id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(`copilot-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted hover:border-brand hover:text-brand-ink"
            >
              {s.id === "outcome" ? "Insurance Outcome" : s.title.split(" — ")[0]}
            </a>
          ))}
        </nav>

        {sections.map((s) => (
          <ScriptSection key={s.id} id={`copilot-${s.id}`} title={s.title} defaultOpen={s.id === "outcome" || s.id === "intro"}>
            {s.id === "outcome" && (
              <OutcomeHeader calc={calc} />
            )}
            {s.blocks.map((b, i) => (
              <ScriptBlock key={i} block={b} />
            ))}
          </ScriptSection>
        ))}
      </div>

      {/* Calculator + rebuttals */}
      <div className="space-y-3 @[640px]:sticky @[640px]:top-0 @[640px]:self-start">
        <Calculator calc={calc} opts={opts} set={set} />
        <SaveResult patient={patient} calc={calc} opts={opts} scriptTitle={outcome?.title} />
        <Rebuttals calc={calc} values={values} />
      </div>
    </div>
  );
}

function OutcomeHeader({ calc }: { calc: Calc }) {
  if (!calc.ready) {
    return (
      <p className="rounded-md bg-surface-2 px-3 py-2 text-[13px] text-muted">
        Insurance isn&apos;t verified yet (WIP State not 13 or 15), so there&apos;s no estimate to quote. The outcome script appears once it is.
      </p>
    );
  }
  return (
    <div className="mb-3 space-y-2">
      <p className="text-xs text-muted">
        <span className="font-medium text-ink">Why this script:</span> {calc.scenario!.reason}
      </p>
      {calc.scenario!.approximate && (
        <p className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle size={14} className="mt-px shrink-0" />
          {calc.scenario!.approximate}
        </p>
      )}
    </div>
  );
}

function ScriptSection({ id, title, defaultOpen, children }: { id: string; title: string; defaultOpen: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section id={id} className="scroll-mt-2 rounded-lg border border-border">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-ink hover:bg-surface-2/60"
      >
        <ChevronDown size={15} className={cx("shrink-0 text-muted transition-transform duration-200", !open && "-rotate-90")} />
        {title}
      </button>
      {open && <div className="space-y-3 border-t border-border px-4 py-3">{children}</div>}
    </section>
  );
}

export function ScriptBlock({ block }: { block: Block }) {
  const [open, setOpen] = useState(!block.folded);
  const body = (
    <div className="space-y-2">
      {block.lines.map((l, i) => (
        <ScriptLine key={i} line={l} />
      ))}
    </div>
  );
  if (!block.title) return body;
  return (
    <div className={cx("rounded-md border", block.folded ? "border-dashed border-border" : "border-border bg-surface-2/40")}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-semibold text-ink">
        <ChevronDown size={13} className={cx("shrink-0 text-muted transition-transform duration-200", !open && "-rotate-90")} />
        {block.title}
      </button>
      {open && <div className="px-3 pb-3">{body}</div>}
    </div>
  );
}

export function Segments({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((s, i) =>
        s.kind === "text" ? (
          <span key={i}>{s.text}</span>
        ) : s.kind === "value" ? (
          <span key={i} className="rounded bg-brand-soft px-0.5 font-semibold text-brand-ink">
            {s.text}
          </span>
        ) : (
          <span key={i} className="rounded border border-dashed border-amber-400 bg-amber-50 px-1 text-amber-900" title="Fill this in on the call">
            {s.text}
          </span>
        ),
      )}
    </>
  );
}

function ScriptLine({ line }: { line: Line }) {
  if (line.kind === "heading") return <p className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{line.text}</p>;
  if (line.kind === "direction")
    return (
      <p className="text-xs italic text-muted">
        <Segments segments={line.segments} />
      </p>
    );
  return (
    <p className="border-l-2 border-brand/40 pl-3 text-[14px] leading-relaxed text-ink">
      <Segments segments={line.segments} />
    </p>
  );
}

const STATUS_STYLE: Record<EstimateStatus, { label: string; dot: string }> = {
  covered: { label: "In network", dot: "bg-payer-commercial" },
  oon: { label: "Out of network", dot: "bg-[#e08a00]" },
  self_pay: { label: "Self pay", dot: "bg-payer-medicare" },
  pending_auth: { label: "Pending auth", dot: "bg-[#f5c518]" },
};

/** Self-pay OT has no price of its own: it's included in the RTM self-pay rate. */
function IncludedInRtm() {
  return (
    <span className="text-[11px] text-muted" title="Self-pay OT is included in the RTM self-pay rate">
      Incl. in RTM
    </span>
  );
}

function Calculator({ calc, opts, set }: { calc: Calc; opts: CallOptions; set: (p: Partial<CallOptions>) => void }) {
  const [fhaOn, setFhaOn] = useState(opts.fha > 0);
  const isMedicare = calc.insurance === "medicare";
  // All self-pay: insurance is $0 and self-pay repeats the patient portion, so only the patient portion is shown
  const allSelfPay = Object.values(calc.lines).every((l) => l.viaSelfPay);
  const cardOnFileHint = calc.scenario?.key?.startsWith("gap_exception") ? "No hold · nothing collected today" : `${formatCents(CARD_HOLD_CENTS)} hold collected today`;
  const hasSelfPayShare = calc.method === "full_self_pay" || calc.method === "self_pay_portion" || (calc.method === "estimate" && calc.selfPayPortion > 0);

  return (
    <section className="rounded-lg border border-border bg-surface">
      <header className="flex items-baseline justify-between border-b border-border px-3 py-2">
        <h3 className="text-sm font-semibold">Calculator</h3>
        <span className="text-xs text-muted">{calc.days}-day treatment plan</span>
      </header>

      {!calc.ready ? (
        <p className="px-3 py-3 text-[13px] text-muted">Waiting on insurance verification. Nothing to quote yet.</p>
      ) : (
        <div className="space-y-3 px-3 py-3 text-[13px]">
          {/* Lines from the record */}
          <table className="w-full">
            <thead>
              <tr className="text-[11px] text-muted">
                <th className="pb-1 text-left align-bottom font-medium">Service</th>
                <th className="pb-1 pl-1 text-right align-bottom font-medium leading-tight">Patient portion</th>
                {!allSelfPay && (
                  <>
                    <th className="pb-1 pl-1 text-right align-bottom font-medium leading-tight">Insurance portion</th>
                    <th className="pb-1 pl-1 text-right align-bottom font-medium opacity-60">Self-pay</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {ESTIMATE_LINES.map(({ key, label, title }) => {
                const l = calc.lines[key];
                const st = STATUS_STYLE[l.status];
                const group = key === "dme" ? "dme" : "therapy";
                return (
                  <tr key={key} className="align-top">
                    <td className="py-1">
                      <span className="flex items-center gap-1.5" title={title}>
                        <span className={cx("h-2 w-2 shrink-0 rounded-full", st.dot)} />
                        <span className="font-medium">{label}</span>
                      </span>
                      <span className="ml-3.5 block text-[11px] text-muted">{st.label}</span>
                      {l.status !== l.recordStatus && <span className="ml-3.5 block text-[11px] text-muted">Record says {STATUS_STYLE[l.recordStatus].label.toLowerCase()}</span>}
                      {l.status === "oon" && (
                        <span className="ml-3.5 mt-1 block whitespace-nowrap">
                          <Switch
                            size="sm"
                            checked={opts.oonSelfPay[group]}
                            onChange={(v) => set({ oonSelfPay: { ...opts.oonSelfPay, [group]: v } })}
                            label="Use self-pay"
                            hint="Patient takes the self-pay price instead of going through out-of-network benefits"
                          />
                        </span>
                      )}
                    </td>
                    <td className="py-1 pl-1 text-right tabular-nums">
                      {key === "ot" && l.viaSelfPay ? <IncludedInRtm /> : formatCents(l.owe)}
                    </td>
                    {!allSelfPay && (
                      <>
                        <td
                          className="py-1 pl-1 text-right tabular-nums"
                          title={l.status === "pending_auth" ? "If the authorization is approved" : l.viaSelfPay ? "Not billed to insurance" : "Payer allowable minus the patient portion"}
                        >
                          {l.viaSelfPay ? <span className="text-muted">—</span> : formatCents(l.insurance)}
                        </td>
                        <td className="py-1 pl-1 text-right tabular-nums text-muted opacity-60">{key === "ot" ? <IncludedInRtm /> : formatCents(l.selfPay)}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border font-semibold">
                <td className="pt-1.5">Total</td>
                <td className="pl-1 pt-1.5 text-right tabular-nums">{formatCents(calc.totalEpr)}</td>
                {!allSelfPay && (
                  <>
                    <td className="pl-1 pt-1.5 text-right tabular-nums">{formatCents(calc.totalInsurance)}</td>
                    <td className="pl-1 pt-1.5 text-right font-normal tabular-nums text-muted opacity-60">{formatCents(calc.totalSelfPay)}</td>
                  </>
                )}
              </tr>
            </tfoot>
          </table>

          {/* What the record doesn't know yet */}
          <fieldset className="space-y-1 border-t border-border pt-2.5">
            <legend className="sr-only">Call details</legend>
            {calc.insurance !== "medicare" && calc.insurance !== "va" && (
              <Switch checked={opts.gapException} onChange={(v) => set({ gapException: v })} label="Gap exception (single case)" />
            )}
            {isMedicare && (
              <>
                <Switch checked={opts.medicaid} onChange={(v) => set({ medicaid: v })} label="Medicaid secondary" />
                <Switch checked={opts.hip} onChange={(v) => set({ hip: v })} label="Hip procedure (DME not covered)" />
              </>
            )}
            {calc.missedWindow && (
              <p className="flex items-center gap-1.5 text-xs text-payer-medicare">
                <AlertTriangle size={13} /> Surgery was {-calc.daysToSurgery} days ago: Medicare&apos;s 48-hour window has passed.
              </p>
            )}
          </fieldset>

          {/* What the patient agrees to pay */}
          {calc.method !== "none" && (
            <div className="space-y-2 border-t border-border pt-2.5">
              <p className="text-[11px] font-medium text-muted">Patient pays</p>
              {calc.methods.length > 1 ? (
                <ChoiceGroup
                  label="Patient pays"
                  value={calc.method}
                  onChange={(m) => set({ method: m as PaymentMethod })}
                  options={calc.methods.map((m) => ({
                    value: m,
                    label: methodLabel(m, calc),
                    hint: m === "self_pay_portion" ? "Manager approval" : m === "card_on_file" ? cardOnFileHint : undefined,
                  }))}
                />
              ) : (
                <p className="text-xs">
                  {methodLabel(calc.method, calc)}
                  {calc.method === "card_on_file" && <span className="block text-[11px] text-muted">{cardOnFileHint}</span>}
                </p>
              )}
              {hasSelfPayShare && (
                <div className="space-y-1">
                  <Switch
                    checked={fhaOn}
                    onChange={(v) => {
                      setFhaOn(v);
                      if (!v) set({ fha: 0 });
                    }}
                    label="FHA discount"
                  />
                  {fhaOn && (
                    <ChoiceGroup
                      layout="row"
                      label="FHA discount"
                      value={opts.fha === 0 ? null : opts.fha}
                      onChange={(f) => set({ fha: f as FhaPercent })}
                      options={FHA_OPTIONS.filter((f) => f !== 0).map((f) => ({ value: f, label: `${f}%` }))}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* How they pay it */}
          {calc.paymentOptions.length > 0 && (
            <div className="space-y-1 border-t border-border pt-2.5">
              <p className="text-[11px] font-medium text-muted">Payment</p>
              <ChoiceGroup
                label="Payment"
                value={calc.payment}
                onChange={(o) => set({ payment: o as PaymentOption })}
                options={calc.paymentOptions.map((o) => ({
                  value: o,
                  label: PAYMENT_LABELS[o],
                  hint: o === "plan" ? `Up to ${MAX_MONTHS} monthly payments` : undefined,
                }))}
              />
              {calc.payment === "plan" && (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] font-medium text-muted">Plan length</span>
                  <Stepper
                    label="Months"
                    value={Math.max(2, opts.months)}
                    min={2}
                    max={MAX_MONTHS}
                    onChange={(n) => set({ payment: "plan", months: n })}
                    format={(n) => `${n} months`}
                  />
                </div>
              )}
            </div>
          )}

          {/* Result */}
          <div className="space-y-1 rounded-md bg-surface-2 px-3 py-2.5">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-medium text-muted">Collected today</span>
              <span className="text-2xl font-semibold tabular-nums">{formatCentsExact(calc.collectedToday)}</span>
            </div>
            {calc.payment === "plan" && (
              <p className="text-right text-xs">
                {calc.installments.length} × <span className="font-semibold tabular-nums">{formatCents(calc.installments[calc.installments.length - 1])}</span>
                {calc.installments[0] !== calc.installments[1] && <span className="text-muted"> (first {formatCents(calc.installments[0])})</span>}
              </p>
            )}
            {calc.payment === "card_on_file" && (
              <dl className="space-y-0.5 border-t border-border/70 pt-1.5 text-xs">
                <div className="flex justify-between">
                  <dt className="text-muted">Card hold</dt>
                  <dd className="tabular-nums">{formatCentsExact(calc.hold)}</dd>
                </div>
              </dl>
            )}
            {calc.method !== "none" && calc.method !== "card_on_file" && (calc.payment !== "upfront" || calc.fhaSavings > 0) && (
              <p className="text-right text-[11px] text-muted">
                Total agreed {formatCents(calc.agreed)}
                {calc.fhaSavings > 0 && <> (was {formatCents(calc.agreedBeforeFha)}, FHA −{formatCents(calc.fhaSavings)})</>}
              </p>
            )}
            {calc.payment === null && <p className="text-right text-[11px] text-muted">Nothing to collect on this call</p>}
            {calc.cardOnFile && (
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <CreditCard size={13} /> Card on file
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/** All rebuttals, with the ones that fit this patient first. */
function Rebuttals({ calc, values }: { calc: Calc; values: Record<string, string> }) {
  const [open, setOpen] = useState<string | null>(null);
  const lines = Object.values(calc.lines);
  const fits: Record<RebuttalTag, boolean> = {
    insurance: lines.some((l) => !l.viaSelfPay),
    self_pay: lines.some((l) => l.viaSelfPay),
    oon: lines.some((l) => l.status === "oon"),
    exception: calc.scenario?.key === "gap_exception" || calc.scenario?.key === "gap_exception_60_plus",
    surgery_far: calc.daysToSurgery > 21,
  };
  const { script } = useScriptEdits();
  const all = LIBRARY.filter((e) => e.group === "rebuttal").map((e) => {
    const s = script(e.id);
    return { id: e.id, label: s.title, tags: e.rebuttalTags ?? [], paragraphs: toParagraphs(s.content) };
  });
  type R = (typeof all)[number];
  const suggested = (r: R) => r.tags.some((t) => fits[t]);
  const relevant = (r: R) => r.tags.length === 0 || suggested(r);
  const ordered = [...all.filter(suggested), ...all.filter((r) => !suggested(r) && relevant(r)), ...all.filter((r) => !relevant(r))];

  return (
    <section className="rounded-lg border border-border">
      <h3 className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm font-semibold">
        <MessageSquareQuote size={15} className="text-muted" /> Rebuttals
      </h3>
      <ul className="divide-y divide-border">
        {ordered.map((r) => (
          <li key={r.id}>
            <button
              onClick={() => setOpen((o) => (o === r.id ? null : r.id))}
              aria-expanded={open === r.id}
              className={cx("flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-surface-2/60", !relevant(r) && "text-muted")}
            >
              <ChevronDown size={13} className={cx("shrink-0 text-muted transition-transform duration-200", open !== r.id && "-rotate-90")} />
              <span className="flex-1">{r.label}</span>
              {suggested(r) && <span className="rounded bg-brand-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase text-brand-ink">Fits</span>}
            </button>
            {open === r.id && (
              <RebuttalBody paragraphs={r.paragraphs} values={values} className="px-3 pb-3 pl-8" />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A rebuttal's paragraphs: "(…)" paragraphs are directions for the rep, the rest is read aloud. */
export function RebuttalBody({ paragraphs, values, className }: { paragraphs: string[]; values: Record<string, string>; className?: string }) {
  return (
    <div className={cx("space-y-2 text-[13px] leading-relaxed", className)}>
      {paragraphs.map((t, i) =>
        /^\([\s\S]*\)$/.test(t) ? (
          <p key={i} className="text-xs italic text-muted">
            <Segments segments={fill(t.slice(1, -1), values)} />
          </p>
        ) : (
          <p key={i}>
            <Segments segments={fill(t, values)} />
          </p>
        ),
      )}
    </div>
  );
}
