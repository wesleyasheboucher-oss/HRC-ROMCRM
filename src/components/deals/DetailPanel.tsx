"use client";

import { Check, ChevronDown, ChevronUp, Phone, Truck, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  ATTEMPT_STAGES,
  CALL_STEPS,
  callCount,
  displayValue,
  ESTIMATE_LINES,
  estimateLines,
  estimateTotal,
  planType,
  FIELDS,
  logisticsType,
  PCSP_FIELDS,
  userDisplayName,
  type FieldCtx,
} from "@/lib/fields";
import { callResultSection, lostSection } from "@/lib/details";
import { hrcLine } from "@/lib/assignment";
import { lineOf, PRIME_STATUSES, primeStatusOf, SUBSTATUSES, substatusOf, type PrimeStatus } from "@/lib/orderStatus";
import { ACTIVITY_TAB, detailValueNode, RecordTabs } from "./RecordTabs";
import { CoverageChip, DealStatusChip, PlanTagChip } from "./Tags";
import { canViewAllCoordinators, useStore } from "@/lib/store";
import type { EstimateStatus, Patient } from "@/lib/types";
import { Select, cx } from "../ui";
import { daysOut } from "@/lib/stages";
import { allowable } from "@/lib/derive";
import { formatDate, formatDateTime, parseISODate, startOfToday } from "@/lib/dates";
import { conversionsFor, currentConversion, PAYMENT_TYPE_LABELS } from "@/lib/conversions";
import { formatCentsExact } from "@/lib/copilot/calculator";

// PCSP fields left out of the drawer at reviewer request.
// ID shows next to the name in the header; iOMS Order ID removed. BT Patient ID / BT Order ID stay.
// Call Stage is driven by the calls tracker in the header, so it has no field row.
const HIDDEN_IN_PANEL = new Set(["salesStatus", "id", "iomsOrderId", "callStage", "selfPayChargeDate", "agreedSelfPayAmount", "surgeryDate", "insuranceName", "firstName"]);
// Patient Name is hidden too: the full name is already in the header
// Surgery Date gets its own large block above the estimate box
// Shown in the estimate box instead of the field list
// Logistics Type shows with the truck under the phone numbers instead of in the field list
// Order Status and Substatus show (and, for managers / admins, change) in the header instead of the field list
const IN_ESTIMATE_BOX = new Set(["financialEstimate", "logisticsType", "primeStatus", "substatus"]);

export function DetailPanel({
  patient,
  ctx,
  onClose,
  onPrev,
  onNext,
}: {
  patient: Patient;
  ctx: FieldCtx;
  onClose: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
}) {
  const { users, currentUser, updatePatient, setOrderStatus, usersById } = useStore();
  const canReassign = canViewAllCoordinators(currentUser);
  // Kept while moving between patients, so ↑/↓ compares the same tab across patients
  const [tab, setTab] = useState(ACTIVITY_TAB);

  // D-14: keyboard navigation between patients while the panel is open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,select,textarea")) return;
      if (e.key === "ArrowUp" && onPrev) {
        e.preventDefault();
        onPrev();
      }
      if (e.key === "ArrowDown" && onNext) {
        e.preventDefault();
        onNext();
      }
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPrev, onNext, onClose]);

  /** Clicking a tracker block sets the call count (to fix a mistake). Call Stage follows while it's an attempt stage. */
  const setCalls = (n: number) => {
    const before = callCount(patient);
    if (n === before) return;
    const syncStage = ATTEMPT_STAGES.includes(patient.callStage) && n < ATTEMPT_STAGES.length;
    updatePatient(
      patient.id,
      { callAttempts: n, ...(syncStage ? { callStage: ATTEMPT_STAGES[n] } : {}) },
      `Calls made changed: ${before} → ${n}`,
    );
  };

  return (
    <aside data-drawer className="flex h-full w-full flex-col border-l border-border bg-surface shadow-[-12px_0_32px_rgba(15,23,42,0.12)]">
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-border px-5 pb-3 pt-4">
        <div className="flex flex-col gap-0.5 pt-0.5">
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-surface-2" title="Close (Esc)">
            <X size={16} />
          </button>
          <button disabled={!onPrev} onClick={onPrev ?? undefined} className="rounded p-1 text-muted hover:bg-surface-2 disabled:opacity-30" title="Previous patient (↑)">
            <ChevronUp size={16} />
          </button>
          <button disabled={!onNext} onClick={onNext ?? undefined} className="rounded p-1 text-muted hover:bg-surface-2 disabled:opacity-30" title="Next patient (↓)">
            <ChevronDown size={16} />
          </button>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h2 className="truncate text-xl font-semibold">
              {patient.firstName} {patient.lastName}
            </h2>
            <span className="shrink-0 text-sm tabular-nums text-muted" title="ID">
              ID {patient.id}
            </span>
            <DealStatusChip patient={patient} size="md" />
            <PlanTagChip patient={patient} size="md" />
            <CoverageChip patient={patient} size="md" />
            <div className="ml-auto flex items-center gap-2 text-xs text-muted">
              Owner
              {canReassign ? (
                <Select
                  value={patient.ownerId ?? ""}
                  onChange={(e) =>
                    updatePatient(
                      patient.id,
                      { ownerId: e.target.value || null },
                      `Owner changed to ${userDisplayName(usersById[e.target.value])}`,
                    )
                  }
                  className="h-7 w-44 text-xs"
                >
                  <option value="">Unassigned</option>
                  {users
                    // An HRC works one line: only HRCs on this order's line (and the current owner, if not)
                    .filter((u) => u.role === "coordinator" && (hrcLine(u) === lineOf(patient) || u.id === patient.ownerId))
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {userDisplayName(u)}
                      </option>
                    ))}
                </Select>
              ) : (
                <span className="font-medium text-ink">{userDisplayName(usersById[patient.ownerId ?? ""])}</span>
              )}
            </div>
          </div>

          <OrderStatus patient={patient} canChange={canReassign} onChange={(prime, sub) => setOrderStatus(patient.id, prime, sub)} />
          <CallTracker calls={callCount(patient)} onSet={setCalls} />
        </div>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        <div className="scroll-thin w-1/3 min-w-[340px] overflow-y-auto border-r border-border px-4 py-4">
          <SurgeryDate iso={patient.surgeryDate} today={ctx.today} />
          <EstimateBox patient={patient} />
          <PhoneBlock patient={patient} ctx={ctx} />
          <div className="space-y-1">
            {PCSP_FIELDS.filter((f) => !HIDDEN_IN_PANEL.has(f.key) && f.type !== "phone").map((f) => (
              <FieldRow key={f.key} label={f.label}>
                {displayValue(f, patient, ctx) || <span className="text-muted">–</span>}
              </FieldRow>
            ))}
            {FIELDS.filter((f) => f.section === "romcrm" && !IN_ESTIMATE_BOX.has(f.key)).map((f) => (
              <FieldRow key={f.key} label={f.label}>
                {displayValue(f, patient, ctx) || <span className="text-muted">–</span>}
              </FieldRow>
            ))}
          </div>
          <CallResultBlock patient={patient} />
        </div>

        <div className="min-w-0 flex-1">
          <RecordTabs patient={patient} tab={tab} onTab={setTab} />
        </div>
      </div>
    </aside>
  );
}

/**
 * iOMS order status. Managers and admins get a picker so the demo can move orders (each change writes history);
 * coordinators see it read-only. Picking a prime status moves to its first substatus.
 */
function OrderStatus({ patient, canChange, onChange }: { patient: Patient; canChange: boolean; onChange: (prime: string, sub: string) => void }) {
  const prime = primeStatusOf(patient);
  const sub = substatusOf(patient);
  return (
    <div className="mt-2 flex items-center gap-2 text-xs">
      <span className="text-muted">Order status</span>
      {canChange ? (
        <>
          <Select value={prime} onChange={(e) => onChange(e.target.value, SUBSTATUSES[e.target.value as PrimeStatus][0])} className="h-7 w-64 text-xs" aria-label="Prime status">
            {PRIME_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <Select value={sub} onChange={(e) => onChange(prime, e.target.value)} className="h-7 w-56 text-xs" aria-label="Substatus">
            {SUBSTATUSES[prime].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </>
      ) : (
        <span className="font-medium text-ink">
          {prime} <span className="text-muted">·</span> {sub}
        </span>
      )}
    </div>
  );
}

// Blue = new / not called, then calls 1–6 run green → yellow → orange → red
const CALL_COLORS = ["#2a65c7", "#1c9a4f", "#6fcf8a", "#e5b300", "#ef8a1a", "#e8582c", "#d64545"];
// Light fills that need dark text
const DARK_TEXT = new Set([2, 3]);

function CallTracker({ calls, onSet }: { calls: number; onSet: (n: number) => void }) {
  const last = CALL_STEPS.length - 1;
  const current = Math.min(calls, last);
  return (
    <div className="mt-3">
      <div className="flex gap-0.5" role="group" aria-label={`Calls made: ${calls}`}>
        {CALL_STEPS.map((label, i) => {
          const reached = i <= current;
          return (
            <button
              key={label}
              type="button"
              onClick={() => onSet(i)}
              title={`Set calls made to ${label.toLowerCase()}`}
              aria-pressed={i === current}
              style={reached ? { backgroundColor: CALL_COLORS[i] } : undefined}
              className={cx(
                "flex h-6 flex-1 items-center justify-center text-[11px] font-medium transition-[filter] first:rounded-l last:rounded-r hover:brightness-95",
                !reached && "bg-surface-2 text-muted",
                reached && (DARK_TEXT.has(i) ? "text-black" : "text-white"),
              )}
            >
              {i === last && calls > last ? `${calls} calls` : label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Solid circles: green ✓ Covered and red ✕ Self pay with a white mark, yellow ! Pending auth with a black mark
const STATUS_META: Record<EstimateStatus, { label: string; circle: string; mark: React.ReactNode }> = {
  covered: { label: "In network", circle: "bg-payer-commercial text-white", mark: <Check size={11} strokeWidth={3.5} /> },
  oon: { label: "Out of network", circle: "bg-[#e08a00] text-white", mark: <Check size={11} strokeWidth={3.5} /> },
  self_pay: { label: "Self pay", circle: "bg-payer-medicare text-white", mark: <X size={11} strokeWidth={3.5} /> },
  pending_auth: { label: "Pending auth", circle: "bg-[#f5c518] text-black", mark: <span className="text-[11px] font-extrabold leading-none">!</span> },
};

const usd = (n: number | null) =>
  n === null ? "–" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** Phone numbers sit at the top of the drawer in a larger size so coordinators can dial straight away. */
function PhoneBlock({ patient, ctx }: { patient: Patient; ctx: FieldCtx }) {
  const phones = PCSP_FIELDS.filter((f) => f.type === "phone");
  return (
    <section className="mb-4 space-y-1.5 border-b border-border px-0.5 pb-3">
      {phones.map((f) => {
        const value = patient[f.key as keyof Patient];
        return (
          <div key={f.key} className="flex items-baseline justify-between gap-3">
            <span className="text-xs font-medium text-muted">{f.label.replace(" Phone", "")}</span>
            {value ? (
              <a className="inline-flex items-center gap-1.5 text-lg font-semibold tabular-nums text-brand-ink hover:underline" href={`tel:${value}`}>
                <Phone size={15} />
                {displayValue(f, patient, ctx)}
              </a>
            ) : (
              <span className="text-lg text-muted">–</span>
            )}
          </div>
        );
      })}
      {/* Logistics type: how the equipment gets to the patient */}
      <div className="flex items-center justify-between gap-3 pt-1.5" title="Logistics type">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
          <Truck size={22} strokeWidth={2.25} className="text-payer-commercial" /> Logistics
        </span>
        <span className="rounded-md bg-surface-2 px-2 py-0.5 text-sm font-semibold tracking-wide text-ink">{logisticsType(patient)}</span>
      </div>
    </section>
  );
}

function SurgeryDate({ iso, today }: { iso: string; today?: Date }) {
  const n = daysOut(iso, today ?? startOfToday());
  const rel = n === 0 ? "Today" : n > 0 ? `in ${n} ${n === 1 ? "day" : "days"}` : `${-n} ${n === -1 ? "day" : "days"} ago`;
  return (
    <section className="mb-3 flex items-baseline justify-between gap-3 px-0.5">
      <p className="shrink-0 whitespace-nowrap text-xs font-medium text-muted">Surgery Date</p>
      <p className="flex items-baseline gap-2 whitespace-nowrap">
        <span className="text-xl font-semibold text-ink">
          {parseISODate(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) /* 13 November 2026 */}
        </span>
        <span className={cx("text-sm", n < 0 ? "text-muted" : n <= 3 ? "font-medium text-payer-medicare" : "text-muted")}>{rel}</span>
      </p>
    </section>
  );
}

/** Total estimate on top, DME / RTM / OT lines below; the total is the sum of the three. */
function EstimateBox({ patient }: { patient: Patient }) {
  const lines = estimateLines(patient);
  return (
    <section className="mb-4 rounded-lg border border-border bg-surface-2/50 p-3">
      {/* Payer, then plan type */}
      <div className="mb-3 border-b border-border pb-3">
        <p className="text-base font-semibold leading-tight text-ink">{patient.insuranceName || "No payer on file"}</p>
        <p className="mt-0.5 text-xs text-muted">{planType(patient)}</p>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-bold text-ink">Coverage &amp; Estimate</span>
        <span className="text-xl font-semibold tabular-nums text-ink">{usd(estimateTotal(patient))}</span>
      </div>
      <ul className="mt-2.5 space-y-1.5 border-t border-border pt-2.5">
        {ESTIMATE_LINES.map(({ key, label, title }) => {
          const line = lines[key];
          const { label: statusLabel, circle, mark } = STATUS_META[line.status];
          return (
            <li key={key} className="flex items-center gap-2 text-[13px]">
              <span role="img" aria-label={statusLabel} title={statusLabel} className={cx("flex h-4 w-4 shrink-0 items-center justify-center rounded-full", circle)}>
                {mark}
              </span>
              <span className="w-9 font-medium" title={title}>
                {label}
              </span>
              <span className="text-xs text-muted">{statusLabel}</span>
              <span
                className="ml-auto tabular-nums"
                title={`${line.status === "self_pay" ? "Self-pay price" : line.status === "oon" ? "Out-of-network allowable" : "Payer allowable"} ${usd(Math.round(allowable(patient, key, line.status)))} (EVA rate card)`}
              >
                {usd(line.amount)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const HIDDEN_IN_RESULT_BLOCK = new Set(["Open/Won/Lost Status", "First Won Date", "First Lost Date"]);

/**
 * HRC Conversion, at the bottom of the column: the current outcome (same fields as the Home Rehab Coordinator tab),
 * then its history from the conversions table when there's any.
 */
function CallResultBlock({ patient }: { patient: Patient }) {
  // Lost reason lives in its own section on the HRC tab; the drawer keeps it in this one block
  const result = callResultSection(patient);
  const section = { ...result, fields: [...result.fields, ...lostSection(patient).fields] };
  const decided = (patient.callResults ?? []).length > 0;
  return (
    <section className="mt-4 border-t border-border pt-3">
      <h3 className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
        HRC Conversion <DealStatusChip patient={patient} />
      </h3>
      {decided ? (
        <div className="space-y-1">
          {/* Status is in the heading; empty fields (payment on a LOST, lost reason on a WON) and the
              First Won / First Lost dates (usually the same as the status date) are left out here */}
          {section.fields
            .filter((f) => !HIDDEN_IN_RESULT_BLOCK.has(f.label) && f.v.value !== "" && f.v.value !== null)
            .map((f) => (
              <FieldRow key={f.label} label={f.label}>
                {detailValueNode(f.v)}
              </FieldRow>
            ))}
        </div>
      ) : (
        <p className="text-xs text-muted">No call result saved yet. Save one from the Call Co-Pilot tab.</p>
      )}
      <ConversionHistory patient={patient} />
    </section>
  );
}

/** The order's rows in the conversions table, newest first; voided rows struck through. Nothing when there are none. */
function ConversionHistory({ patient }: { patient: Patient }) {
  const { conversions } = useStore();
  const rows = conversionsFor(conversions, patient.id);
  const current = currentConversion(conversions, patient.id);
  if (rows.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">History · {rows.length}</p>
      <ul className="space-y-1.5">
        {rows.map((c) => (
          <li key={c.id} className={cx("rounded-md border border-border px-2.5 py-1.5 text-[12px]", c.voided && "bg-surface-2/50 text-muted")}>
            <div className={cx("flex items-center gap-2", c.voided && "line-through")}>
              <span className={cx("rounded px-1.5 py-px text-[10px] font-semibold uppercase", c.voided ? "bg-surface-2" : c.outcome === "won" ? "bg-payer-commercial text-white" : "bg-payer-medicare text-white")}>
                {c.outcome}
              </span>
              <span className="font-mono text-[11px]">{c.id}</span>
              <span className="ml-auto text-[11px] text-muted">{formatDate(c.decidedAt.slice(0, 10))}</span>
            </div>
            <p className={cx("mt-0.5 text-[11px] text-muted", c.voided && "line-through")}>
              {c.hrcName} · EPR {formatCentsExact(c.eprCents)}
              {c.outcome === "won" && <> · {PAYMENT_TYPE_LABELS[c.paymentType]}</>}
              {c.collectedUpfrontCents > 0 && <> · {formatCentsExact(c.collectedUpfrontCents)} upfront</>}
              {c.installmentCents > 0 && <> · {formatCentsExact(c.installmentCents)} over {c.installmentMonths} months</>}
              {c.lostReason && <> · {c.lostReason} ({c.lostSubReason})</>}
            </p>
            {c.voided && <p className="text-[11px]">Voided by {c.voided.by}, {formatDateTime(c.voided.at)}</p>}
            {current?.id === c.id && rows.length > 1 && <p className="text-[11px] font-medium text-brand-ink">Current outcome</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-7 grid-cols-[124px_1fr] items-center gap-3 text-[13px]">
      <span className="truncate text-xs text-muted" title={label}>
        {label}
      </span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}
