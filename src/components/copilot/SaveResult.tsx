"use client";

import { Check, ChevronDown, FileSignature, History, Trash2 } from "lucide-react";
import { useState } from "react";
import type { LostReason } from "@/lib/lostReasons";
import { RadialLostReason } from "./RadialLostReason";
import { formatCents, formatCentsExact, type Calc, type CallOptions } from "@/lib/copilot/calculator";
import {
  buildResult,
  COLLECTED_AS_LABELS,
  defaultSummary,
  FORM_LABELS,
  formFor,
  OUTCOME_LABELS,
  recentDuplicate,
  resultLines,
  wonBlocker,
} from "@/lib/copilot/result";
import { formatDateTime } from "@/lib/dates";
import { userDisplayName } from "@/lib/fields";
import { canViewAllCoordinators, useStore } from "@/lib/store";
import type { CallOutcome, CallResult, Patient } from "@/lib/types";
import { Button, cx } from "../ui";

const OUTCOME_STYLE: Record<CallOutcome, string> = {
  won: "bg-payer-commercial text-white",
  lost: "bg-payer-medicare text-white",
  payment_collected: "bg-brand text-white",
};

/**
 * Call result card (Base44's Save Result card): confirm the form was signed, pick WON or LOST, then save.
 * The result is recorded on the patient with an Activity entry built from it; there's no summary to copy elsewhere.
 */
export function SaveResult({ patient, calc, opts, scriptTitle }: { patient: Patient; calc: Calc; opts: CallOptions; scriptTitle?: string }) {
  const { currentUser, saveCallResult, deleteCallResult } = useStore();
  const [formSigned, setFormSigned] = useState(false);
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [saved, setSaved] = useState<CallResult | null>(null);
  const [confirmDup, setConfirmDup] = useState(false);
  // LOST opens the lost-reason wheel; the outcome is only set once a reason is picked
  const [lost, setLost] = useState<LostReason | null>(null);
  const [reasonAnchor, setReasonAnchor] = useState<HTMLElement | null>(null);

  const form = formFor(calc);
  const blocker = wonBlocker(calc, formSigned);
  const duplicate = outcome ? recentDuplicate(patient, outcome) : null;

  const choose = (o: CallOutcome) => {
    setOutcome(o);
    setConfirmDup(false);
  };

  const canSave =
    !!outcome && (outcome !== "lost" || !!lost) && (outcome !== "won" || !blocker) && (!duplicate || confirmDup);

  const doSave = () => {
    if (!outcome || !canSave) return;
    const r = buildResult({
      outcome,
      patient,
      calc,
      opts,
      formSigned,
      // Activity entry for the record, built from the data (not edited or copied)
      note: defaultSummary(outcome, patient, calc, opts, scriptTitle, formSigned, undefined, lost),
      lost,
      user: { id: currentUser.id, name: userDisplayName(currentUser) },
    });
    // Saved on the record, and a WON / LOST result also adds a row to the conversions table
    saveCallResult(patient.id, r);
    setSaved(r);
  };

  const startOver = () => {
    setSaved(null);
    setOutcome(null);
    setFormSigned(false);
    setLost(null);
    setConfirmDup(false);
  };

  return (
    <section className="rounded-lg border border-border bg-surface">
      <h3 className="border-b border-border px-3 py-2 text-sm font-semibold">Call result</h3>

      {saved ? (
        <div className="space-y-2 px-3 py-3 text-[13px]">
          <p className="flex items-center gap-2 font-medium text-payer-commercial">
            <Check size={15} /> {OUTCOME_LABELS[saved.outcome]} saved
          </p>
          <p className="text-xs text-muted">
            Added to this patient&apos;s Activity
            {saved.outcome !== "lost" && (
              <>
                {" "}· {formatCentsExact(saved.amountCollectedCents)} collected today{saved.collectedAs && <> ({COLLECTED_AS_LABELS[saved.collectedAs].toLowerCase()})</>}
                {saved.paymentOption === "card_on_file" && (
                  <>
                    {" "}· card on file{saved.holdCents ? ` with a ${formatCents(saved.holdCents)} hold` : ""}
                  </>
                )}
              </>
            )}
            .
          </p>
          <Button size="sm" onClick={startOver}>
            Save another result
          </Button>
        </div>
      ) : (
        <div className="space-y-3 px-3 py-3 text-[13px]">
          <button
            onClick={() => setFormSigned((v) => !v)}
            aria-pressed={formSigned}
            className={cx(
              "flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-[13px] font-medium transition-colors",
              formSigned ? "border-payer-commercial bg-payer-commercial text-white" : "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100",
            )}
          >
            {formSigned ? <Check size={15} /> : <FileSignature size={15} />}
            {formSigned ? `${FORM_LABELS[form]} signed` : `Confirm ${FORM_LABELS[form]} was signed`}
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => choose("won")}
              disabled={!!blocker}
              title={blocker ?? undefined}
              className={cx(
                "h-10 rounded-md text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40",
                outcome === "won" ? "bg-payer-commercial ring-2 ring-payer-commercial/40 ring-offset-1" : "bg-payer-commercial/85 hover:bg-payer-commercial",
              )}
            >
              WON
            </button>
            <button
              onClick={(e) => setReasonAnchor(e.currentTarget)}
              title="Pick why the patient was lost"
              className={cx(
                "h-10 rounded-md text-sm font-semibold text-white transition",
                outcome === "lost" ? "bg-payer-medicare ring-2 ring-payer-medicare/40 ring-offset-1" : "bg-payer-medicare/85 hover:bg-payer-medicare",
              )}
            >
              LOST
            </button>
          </div>
          {blocker && outcome !== "won" && <p className="text-[11px] text-muted">{blocker}</p>}
          {outcome === "lost" && lost && (
            <div className="flex items-start gap-2 rounded-md border border-payer-medicare/30 bg-red-50 px-2.5 py-2 text-xs dark:bg-red-950/30">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-payer-medicare">{lost.reason}</p>
                <p className="text-ink">{lost.sub}</p>
              </div>
              <button onClick={(e) => setReasonAnchor(e.currentTarget)} className="shrink-0 font-medium text-brand-ink hover:underline">
                Change
              </button>
            </div>
          )}
          {reasonAnchor && (
            <RadialLostReason
              anchor={reasonAnchor}
              onPick={(r) => {
                setLost(r);
                choose("lost");
              }}
              onClose={() => setReasonAnchor(null)}
            />
          )}

          {outcome && (
            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-[11px] text-muted">
                Order <span className="font-medium text-ink">{patient.iomsOrderId || "—"}</span> (IOMS, from the record)
              </p>
              {duplicate && (
                <label className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
                  <input type="checkbox" checked={confirmDup} onChange={(e) => setConfirmDup(e.target.checked)} className="mt-0.5" />
                  <span>
                    {duplicate.by} already saved {OUTCOME_LABELS[outcome].toLowerCase()} for this patient at {formatDateTime(duplicate.at)}. Save another one anyway?
                  </span>
                </label>
              )}
              <Button variant="primary" className="w-full" onClick={doSave} disabled={!canSave}>
                Save result
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Deleting a result voids its conversion row instead of removing it */}
      <SavedResults patient={patient} canDelete={canViewAllCoordinators(currentUser)} onDelete={(id) => deleteCallResult(patient.id, id)} />
    </section>
  );
}

function SavedResults({ patient, canDelete, onDelete }: { patient: Patient; canDelete: boolean; onDelete: (id: string) => void }) {
  const results = patient.callResults ?? [];
  const [open, setOpen] = useState<string | null>(null);
  if (!results.length) return null;
  return (
    <div className="border-t border-border">
      <p className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
        <History size={12} /> Saved results
      </p>
      <ul className="pb-1">
        {results.map((r) => (
          <li key={r.id} className="px-3 py-1 text-[12px]">
            <button onClick={() => setOpen((o) => (o === r.id ? null : r.id))} aria-expanded={open === r.id} className="flex w-full items-center gap-1.5 text-left">
              <ChevronDown size={12} className={cx("shrink-0 text-muted transition-transform", open !== r.id && "-rotate-90")} />
              <span className={cx("shrink-0 whitespace-nowrap rounded px-1.5 py-px text-[10px] font-semibold uppercase", OUTCOME_STYLE[r.outcome])}>{r.outcome === "payment_collected" ? "Payment" : OUTCOME_LABELS[r.outcome]}</span>
              {r.outcome !== "lost" && <span className="tabular-nums">{formatCentsExact(r.amountCollectedCents)}</span>}
              {r.collectedAs && <span className="text-[11px] text-muted">{COLLECTED_AS_LABELS[r.collectedAs].toLowerCase()}</span>}
              <span className="ml-auto truncate text-[11px] text-muted">{formatDateTime(r.at)}</span>
            </button>
            {open === r.id && (
              <div className="mt-1 space-y-1 pl-4 text-[11px] text-muted">
                <p>
                  By {r.by} · order {r.orderId || "—"}
                  {r.formSigned && <> · {FORM_LABELS[r.formSigned]} signed</>}
                </p>
                {r.outcome !== "lost" && (
                  <p>
                    Agreed {formatCents(r.amountAgreedCents)}
                    {r.paymentOption === "plan" && <> over {r.months} months</>} · collected {formatCentsExact(r.amountCollectedCents)}
                    {r.collectedAs && <> ({COLLECTED_AS_LABELS[r.collectedAs].toLowerCase()})</>}
                  </p>
                )}
                {r.lostReason && (
                  <p>
                    Reason: <span className="font-medium text-ink">{r.lostReason}</span> · {r.lostSubReason}
                  </p>
                )}
                {r.outcome !== "payment_collected" && resultLines(r).map((l) => <p key={l}>{l}</p>)}
                {canDelete && (
                  <button
                    onClick={() => window.confirm("Delete this saved result? The Activity note stays.") && onDelete(r.id)}
                    className="flex items-center gap-1 font-medium text-payer-medicare hover:underline"
                  >
                    <Trash2 size={11} /> Delete result
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
