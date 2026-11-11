"use client";

import { displayValue, FIELDS_BY_KEY, type FieldCtx } from "@/lib/fields";
import { daysOut } from "@/lib/stages";
import type { Patient } from "@/lib/types";
import { cx } from "../ui";
import { dealStatus } from "@/lib/fields";
import { CoverageChip, DealStatusChip, PlanTagChip } from "./Tags";

function daysLabel(n: number) {
  if (n < 0) return `${-n}d ago`;
  if (n === 0) return "Today";
  return `${n}d`;
}

export function PatientCard({
  patient,
  fields,
  ctx,
  selected,
  onClick,
}: {
  patient: Patient;
  fields: string[];
  ctx: FieldCtx;
  selected?: boolean;
  onClick?: () => void;
}) {
  const n = daysOut(patient.surgeryDate, ctx.today);

  return (
    <button
      type="button"
      data-patient={patient.id}
      onClick={onClick}
      className={cx(
        "group flex w-full flex-col gap-1.5 rounded-lg border bg-surface py-2 pl-3 pr-2 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-shadow hover:shadow-md",
        // The open patient sits above the dimmed backdrop (z-20) and below the drawer (z-30)
        selected
          ? "relative z-[25] border-brand shadow-lg ring-2 ring-brand/30"
          : "border-border",
      )}
    >
      <div className="flex w-full gap-2">
        <div className="min-w-0 flex-1">
          {fields.map((key, i) => {
            const field = FIELDS_BY_KEY[key];
            if (!field) return null;
            const v = displayValue(field, patient, ctx);
            if (!v) return null;
            return (
              <div
                key={key}
                title={`${field.label}: ${v}`}
                className={cx(
                  "truncate",
                  i === 0
                    ? "text-[13px] font-semibold text-ink"
                    : "text-xs leading-[18px] text-muted",
                )}
              >
                {v}
              </div>
            );
          })}
        </div>

        {/* Days to surgery top right */}
        <span
          className="h-fit shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted"
          title={`Surgery ${displayValue(FIELDS_BY_KEY.surgeryDate, patient, ctx)}`}
        >
          {daysLabel(n)}
        </span>
      </div>

      {/* Plan tag + coverage tag */}
      <div className="flex flex-wrap gap-1">
        <PlanTagChip patient={patient} />
        <CoverageChip patient={patient} />
        {/* Only flag decided patients on the board; Open is the default */}
        {dealStatus(patient) !== "open" && <DealStatusChip patient={patient} />}
      </div>
    </button>
  );
}
