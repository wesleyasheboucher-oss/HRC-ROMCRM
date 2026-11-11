"use client";

import { ArrowDown, ArrowUp, Filter } from "lucide-react";
import { Fragment } from "react";
import {
  coverageBar,
  displayValue,
  FIELDS_BY_KEY,
  type FieldCtx,
} from "@/lib/fields";
import { stageOf } from "@/lib/stages";
import type { Patient, UserPrefs } from "@/lib/types";
import { cx } from "../ui";
import { CoverageChip, DealStatusChip, PlanTagChip } from "./Tags";

/**
 * D-02: List view of the same patients. Columns are the user's own list columns (any registry field).
 * Click a header to sort by it (again to flip direction); the funnel starts a filter on that field.
 */
export function ListView({
  patients,
  columns,
  ctx,
  selectedId,
  sort,
  onSort,
  onFilterBy,
  onSelect,
}: {
  patients: Patient[];
  columns: string[];
  ctx: FieldCtx;
  selectedId: string | null;
  sort: UserPrefs["sort"];
  onSort: (sort: UserPrefs["sort"]) => void;
  onFilterBy: (fieldKey: string) => void;
  onSelect: (id: string) => void;
}) {
  const cols = columns.filter((k) => FIELDS_BY_KEY[k]);
  return (
    // Padding sits outside the scroller so sideways-scrolled cells can't show through it beside the pinned column
    <div className="h-full px-4 pb-3">
      <div className="scroll-thin h-full overflow-auto">
        <table className="w-full border-separate border-spacing-0 rounded-lg bg-surface text-sm">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr>
              <th className="sticky left-0 z-[1] w-1 border-b border-border bg-surface" />
              {cols.map((k, i) => {
                const sorted = sort.field === k;
                return (
                  <Fragment key={k}>
                    <th
                      className={cx(
                        "group whitespace-nowrap border-b border-border px-3 py-1.5 text-left text-xs font-semibold text-muted",
                        // First column (usually the name) stays put while the table scrolls sideways
                        i === 0 &&
                          "sticky left-1 z-[1] bg-surface shadow-[1px_0_0_var(--border)]",
                      )}
                    >
                      <span className="inline-flex items-center gap-1">
                        <button
                          onClick={() =>
                            onSort({
                              field: k,
                              dir:
                                sorted && sort.dir === "asc" ? "desc" : "asc",
                            })
                          }
                          title={`Sort by ${FIELDS_BY_KEY[k].label}`}
                          className={cx(
                            "inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-surface-2 hover:text-ink",
                            sorted && "text-ink",
                          )}
                        >
                          {FIELDS_BY_KEY[k].label}
                          {sorted &&
                            (sort.dir === "asc" ? (
                              <ArrowUp size={12} />
                            ) : (
                              <ArrowDown size={12} />
                            ))}
                        </button>
                        <button
                          onClick={() => onFilterBy(k)}
                          title={`Filter by ${FIELDS_BY_KEY[k].label}`}
                          aria-label={`Filter by ${FIELDS_BY_KEY[k].label}`}
                          className="rounded p-0.5 opacity-0 transition-opacity hover:bg-surface-2 hover:text-brand-ink focus-visible:opacity-100 group-hover:opacity-100"
                        >
                          <Filter size={12} />
                        </button>
                      </span>
                    </th>
                    {i === 0 && (
                      <th className="border-b border-border px-3 py-2 text-left text-xs font-semibold text-muted">
                        Stage
                      </th>
                    )}
                  </Fragment>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {patients.map((p) => (
              <tr
                key={p.id}
                data-patient={p.id}
                ref={
                  p.id === selectedId
                    ? (el) => el?.scrollIntoView({ block: "nearest" })
                    : undefined
                }
                onClick={() => onSelect(p.id)}
                className={cx(
                  "group/row cursor-pointer hover:bg-brand-soft/50",
                  p.id === selectedId && "relative z-[25] bg-brand-soft",
                )}
              >
                <td
                  className={cx(
                    "sticky left-0 z-[1] border-b border-border p-0",
                    sel(p.id === selectedId),
                  )}
                >
                  <span className={cx("block h-9 w-1", coverageBar(p))} />
                </td>
                {cols.map((k, i) => (
                  <Fragment key={k}>
                    <td
                      className={cx(
                        "whitespace-nowrap border-b border-border px-3 py-2",
                        i === 0
                          ? cx(
                              "sticky left-1 z-[1] font-medium shadow-[1px_0_0_var(--border)]",
                              sel(p.id === selectedId),
                            )
                          : "text-muted",
                      )}
                    >
                      {k === "planTag" ? (
                        <PlanTagChip patient={p} />
                      ) : k === "dealStatus" ? (
                        <DealStatusChip patient={p} />
                      ) : k === "coverage" ? (
                        <CoverageChip patient={p} />
                      ) : (
                        displayValue(FIELDS_BY_KEY[k], p, ctx) || "—"
                      )}
                    </td>
                    {i === 0 && (
                      <td className="whitespace-nowrap border-b border-border px-3 py-2 text-xs text-muted">
                        {stageOf(p, ctx.today).label}
                      </td>
                    )}
                  </Fragment>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {patients.length === 0 && (
          <p className="py-10 text-center text-sm text-muted">
            No patients match this view.
          </p>
        )}
      </div>
    </div>
  );
}

/** Sticky cells need their own background (they sit over scrolled content); match the row's hover / selected tint. */
const sel = (selected: boolean) =>
  selected
    ? "bg-[color-mix(in_srgb,var(--brand-soft)_100%,var(--surface))]"
    : "bg-surface group-hover/row:bg-[color-mix(in_srgb,var(--brand-soft)_50%,var(--surface))]";
