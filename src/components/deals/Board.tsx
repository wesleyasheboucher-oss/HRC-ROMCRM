"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FieldCtx } from "@/lib/fields";
import type { BoardColumn } from "@/lib/pipelines";
import type { Patient } from "@/lib/types";
import { PatientCard } from "./PatientCard";

/** Must match the drawer width in DealsPage: min(1200px, 100% - 260px), which always leaves one full column visible. */
const drawerWidth = (pageWidth: number) => Math.min(1200, pageWidth - 260);
const GUTTER = 24; // px-6

export function Board({
  columns,
  byStage,
  cardFields,
  ctx,
  selectedId,
  drawerOpen,
  onSelect,
}: {
  /** The line's columns (surgery-date stages for Ortho, enrollment calls for Cardiac), in order */
  columns: BoardColumn[];
  byStage: Record<string, Patient[]>;
  cardFields: string[];
  ctx: FieldCtx;
  selectedId: string | null;
  drawerOpen: boolean;
  onSelect: (id: string) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  // While the drawer is open, columns keep the width they had before it opened and the board gets extra room on the right,
  // so any column can be scrolled into the strip the drawer leaves visible.
  const [frozen, setFrozen] = useState<{ col: number; spacer: number } | null>(null);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (drawerOpen) {
      if (frozen) return;
      const col = el.querySelector("section")?.getBoundingClientRect().width ?? 220;
      setFrozen({ col, spacer: drawerWidth(el.clientWidth) });
    } else if (frozen) {
      el.scrollTo({ left: 0, behavior: "smooth" });
      const t = setTimeout(() => setFrozen(null), 300); // after the drawer has slid out
      return () => clearTimeout(t);
    }
  }, [drawerOpen, frozen]);

  // Bring the selected card into view: its column into the visible strip, the card into its column's scroll area.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !selectedId || !frozen) return;
    const card = el.querySelector<HTMLElement>(`[data-patient="${CSS.escape(selectedId)}"]`);
    const column = card?.closest("section");
    if (!card || !column) return;

    const visible = el.clientWidth - drawerWidth(el.clientWidth);
    const colLeft = column.offsetLeft - el.scrollLeft;
    if (colLeft < GUTTER || colLeft + column.offsetWidth > visible) {
      el.scrollTo({ left: Math.max(0, column.offsetLeft - GUTTER), behavior: "smooth" });
    }

    const list = card.parentElement;
    if (list) {
      const c = card.getBoundingClientRect();
      const l = list.getBoundingClientRect();
      if (c.top < l.top) list.scrollBy({ top: c.top - l.top - 8, behavior: "smooth" });
      else if (c.bottom > l.bottom) list.scrollBy({ top: c.bottom - l.bottom + 8, behavior: "smooth" });
    }
  }, [selectedId, frozen]);

  return (
    <div ref={scrollerRef} className="scroll-thin flex h-full gap-6 overflow-x-auto px-6 pb-4">
      {columns.map((stage) => {
        const patients = byStage[stage.id] ?? [];
        return (
          <section
            key={stage.id}
            className="flex h-full min-w-[220px] flex-1 flex-col"
            style={frozen ? { flex: `0 0 ${frozen.col}px` } : undefined}
          >
            <header className="mb-4 flex items-baseline justify-between border-b border-border pb-3">
              <h3 className="text-[13px] font-semibold tracking-tight text-ink">{stage.label}</h3>
              {/* D-04: patient count replaces Pipedrive's "Covered Lives" */}
              <span
                className="text-xs tabular-nums text-muted"
                title={`${patients.length} ${patients.length === 1 ? "patient" : "patients"}`}
              >
                {patients.length}
              </span>
            </header>
            <div className="scroll-thin -mx-1 flex-1 space-y-3 overflow-y-auto px-1 pb-4">
              {patients.map((p) => (
                <PatientCard
                  key={p.id}
                  patient={p}
                  fields={cardFields}
                  ctx={ctx}
                  selected={p.id === selectedId}
                  onClick={() => onSelect(p.id)}
                />
              ))}
              {patients.length === 0 && <p className="rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted">No patients</p>}
            </div>
          </section>
        );
      })}
      {frozen && <div aria-hidden className="shrink-0" style={{ width: frozen.spacer }} />}
    </div>
  );
}
