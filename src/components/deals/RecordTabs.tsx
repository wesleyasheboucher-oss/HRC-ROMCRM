"use client";

import { ChevronDown, FileText, Mail, Phone, X, Check } from "lucide-react";
import { useMemo, useState } from "react";
import { formatCents } from "@/lib/copilot/calculator";
import { formatDate } from "@/lib/dates";
import { detailTabs, type DetailField, type DetailSection, type DetailValue } from "@/lib/details";
import type { Patient } from "@/lib/types";
import { cx } from "../ui";
import { ActivityPanel } from "./ActivityPanel";
import { CopilotPanel } from "../copilot/CopilotPanel";

export const ACTIVITY_TAB = "activity";
export const COPILOT_TAB = "copilot";

/** Right side of the patient drawer: Activity plus the record tabs from the current CRM. */
export function RecordTabs({ patient, tab, onTab }: { patient: Patient; tab: string; onTab: (t: string) => void }) {
  const tabs = useMemo(() => detailTabs(patient), [patient]);
  const all = [{ key: ACTIVITY_TAB, label: "Activity" }, { key: COPILOT_TAB, label: "Call Co-Pilot" }, ...tabs.map(({ key, label }) => ({ key, label }))];
  const current = tabs.find((t) => t.key === tab);
  const activeKey = current ? current.key : tab === COPILOT_TAB ? COPILOT_TAB : ACTIVITY_TAB;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div role="tablist" aria-label="Patient record" className="scroll-thin flex shrink-0 gap-1 overflow-x-auto border-b border-border px-5">
        {all.map((t) => {
          const on = t.key === activeKey;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={on}
              onClick={() => onTab(t.key)}
              className={cx(
                "relative whitespace-nowrap px-2.5 pb-2.5 pt-3 text-[13px] font-medium transition-colors",
                on ? "text-brand-ink" : "text-muted hover:text-ink",
              )}
            >
              {t.label}
              <span
                className={cx(
                  "absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand transition-transform duration-200",
                  on ? "scale-x-100" : "scale-x-0",
                )}
              />
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="@container scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {current ? (
          <div key={current.key} className="radial-center-text space-y-4">
            {current.sections.map((s) => (
              <Section key={s.title} section={s} />
            ))}
          </div>
        ) : activeKey === COPILOT_TAB ? (
          // Keyed by patient so call-time choices reset when moving to the next patient
          <CopilotPanel key={patient.id} patient={patient} />
        ) : (
          <ActivityPanel patient={patient} />
        )}
      </div>
    </div>
  );
}

function Section({ section }: { section: DetailSection }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="rounded-lg border border-border">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-ink hover:bg-surface-2/60"
      >
        <ChevronDown size={15} className={cx("text-muted transition-transform duration-200", !open && "-rotate-90")} />
        {section.title}
      </button>
      {open && (
        <div className="border-t border-border px-3 py-2">
          {section.files ? (
            <ul className="divide-y divide-border">
              {section.files.map((f) => (
                <li key={f} className="flex items-center gap-2 py-1.5 text-[13px]">
                  <FileText size={14} className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate" title={f}>
                    {f}
                  </span>
                  <button className="rounded border border-border px-2 py-0.5 text-xs font-medium text-brand-ink hover:bg-brand-soft" title="Not wired up in the POC">
                    Open
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <dl className="grid grid-cols-1 gap-x-6 @[560px]:grid-cols-2">
              {section.fields.map((f) => (
                <Row key={f.label} field={f} />
              ))}
            </dl>
          )}
        </div>
      )}
    </section>
  );
}

function Row({ field }: { field: DetailField }) {
  return (
    <div className="grid min-h-8 grid-cols-[150px_1fr] items-center gap-3 border-b border-border/60 py-1 text-[13px] last:border-b-0">
      <dt className="text-xs text-muted">{field.label}</dt>
      <dd className="min-w-0 break-words">{detailValueNode(field.v)}</dd>
    </div>
  );
}

/** How a record-tab value is shown (also used for the Call Result block in the drawer's left column). */
export function detailValueNode(v: DetailValue): React.ReactNode {
  const empty = <span className="text-muted">–</span>;
  let value: React.ReactNode;
  switch (v.kind) {
    case "phone":
      value = v.value ? (
        <a href={`tel:${v.value}`} className="inline-flex items-center gap-1 text-brand-ink hover:underline">
          <Phone size={12} /> {v.value}
        </a>
      ) : (
        empty
      );
      break;
    case "email":
      value = v.value ? (
        <a href={`mailto:${v.value}`} className="inline-flex min-w-0 items-center gap-1 text-brand-ink hover:underline">
          <Mail size={12} className="shrink-0" /> <span className="truncate">{v.value}</span>
        </a>
      ) : (
        empty
      );
      break;
    case "check":
      value = (
        <span
          role="img"
          aria-label={v.value ? "Yes" : "No"}
          className={cx(
            "inline-flex h-4 w-4 items-center justify-center rounded-[4px] border",
            v.value ? "border-brand bg-brand text-white" : "border-slate-300 bg-surface",
          )}
        >
          {v.value && <Check size={11} strokeWidth={3.5} />}
        </span>
      );
      break;
    case "yesno":
      value = (
        <span className={cx("inline-flex items-center gap-1.5 font-medium", v.value ? "text-payer-commercial" : "text-payer-medicare")}>
          <span className={cx("flex h-4 w-4 items-center justify-center rounded-full text-white", v.value ? "bg-payer-commercial" : "bg-payer-medicare")}>
            {v.value ? <Check size={11} strokeWidth={3.5} /> : <X size={11} strokeWidth={3.5} />}
          </span>
          {v.value ? "Yes" : "No"}
        </span>
      );
      break;
    case "date":
      value = v.value ? formatDate(v.value) : empty;
      break;
    case "money":
      value = v.value === null ? empty : <span className="tabular-nums">{formatCents(v.value)}</span>;
      break;
    default:
      value = v.value || empty;
  }
  return value;
}
