"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { FilterDrawer, type FilterDraft } from "@/components/filters/FilterDrawer";
import { FiltersMenu } from "@/components/filters/FiltersMenu";
import { TabsBar } from "@/components/filters/TabsBar";
import { Button, Input, Select, SlideOver, cx } from "@/components/ui";
import { conversionsFor, currentIds, PAYMENT_TYPE_LABELS, totals } from "@/lib/conversions";
import { formatCentsExact } from "@/lib/copilot/calculator";
import { addDays, formatDate, startOfToday, toISODate } from "@/lib/dates";
import { userDisplayName } from "@/lib/fields";
import { ALL_OWNERS, assignedFilterIds, boardScope, isBoardScope, matchesFilter, newId, STANDARD_VIEWS, tabsForUser, type EvalCtx } from "@/lib/filters";
import { lineOf, LINE_LABELS } from "@/lib/orderStatus";
import { PIPELINE_PATH } from "@/lib/pipelines";
import { cleanQuick, activeQuickKeys } from "@/lib/quickFilters";
import { canViewAllCoordinators, useStore } from "@/lib/store";
import type { Conversion, Line, Patient, SavedFilter } from "@/lib/types";

type Range = "all" | "month" | "30" | "90" | "custom";
const RANGE_LABELS: Record<Range, string> = { all: "All time", month: "This month", "30": "Last 30 days", "90": "Last 90 days", custom: "Custom" };
// Explicit order: object keys that look like numbers ("30", "90") would otherwise come first
const RANGES: Range[] = ["all", "month", "30", "90", "custom"];

/**
 * Every row in the conversions table, with the board's filter tools: saved views and the Filters drawer
 * (applied to each row's order), the HRC who won or lost it, a date range on the won / lost date, outcome and line.
 * Totals at the top count orders, each once by its current outcome.
 */
export function ConversionsPage() {
  const store = useStore();
  const { conversions, patients, filters, assignments, currentUser, users, usersById, prefsFor, updatePrefs } = store;
  const prefs = prefsFor(currentUser.id);
  const isLead = canViewAllCoordinators(currentUser);
  const hrcs = users.filter((u) => u.role === "coordinator");
  const today = useMemo(() => startOfToday(), []);

  const [activeId, setActiveId] = useState("std_all");
  const [unsaved, setUnsaved] = useState<FilterDraft | null>(null);
  const [drawer, setDrawer] = useState<{ open: boolean; key: number } | null>(null);
  // Coordinators see the rows they won or lost; managers and admins can pick any HRC
  const [hrc, setHrc] = useState<string>(isLead ? ALL_OWNERS : currentUser.id);
  const [range, setRange] = useState<Range>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [outcome, setOutcome] = useState<"all" | "won" | "lost">("all");
  const [line, setLine] = useState<"all" | Line>("all");
  const [showVoided, setShowVoided] = useState(true);
  const [search, setSearch] = useState("");

  const ctx: EvalCtx = useMemo(() => ({ usersById, today, meId: ALL_OWNERS }), [usersById, today]);
  const tabs = tabsForUser(currentUser, filters, assignments, prefs);
  const assignedIds = assignedFilterIds(currentUser, assignments);
  const active = [...STANDARD_VIEWS, ...filters].find((f) => f.id === activeId) ?? STANDARD_VIEWS[0];
  // The board scope (owner, Patient Sales) doesn't apply here: conversions cover orders in every status, and the HRC picker stands in for the owner
  const viewDraft: FilterDraft = { quick: active.quick ?? {}, all: active.all.filter((c) => !isBoardScope(c)), any: active.any };
  const current = unsaved ?? viewDraft;
  const selectView = (id: string) => {
    setActiveId(id);
    setUnsaved(null);
  };

  const byId = useMemo(() => Object.fromEntries(patients.map((p) => [p.id, p])), [patients]);
  const live = useMemo(() => currentIds(conversions), [conversions]);

  const rangeBounds = useMemo((): { from?: string; to?: string } => {
    const d = (n: number) => toISODate(addDays(today, n));
    if (range === "month") return { from: toISODate(new Date(today.getFullYear(), today.getMonth(), 1)) };
    if (range === "30") return { from: d(-30) };
    if (range === "90") return { from: d(-90) };
    if (range === "custom") return { from: from || undefined, to: to || undefined };
    return {};
  }, [range, from, to, today]);

  const rowsFor = useCallback(
    (d: FilterDraft) => {
      const q = search.trim().toLowerCase();
      const f = { all: d.all, any: d.any, quick: d.quick };
      const okOrder = new Map<string, boolean>();
      return conversions
        .filter((c) => {
          const p = byId[c.patientId];
          if (!p) return false;
          if (!showVoided && c.voided) return false;
          if (hrc !== ALL_OWNERS && c.hrcId !== hrc) return false;
          if (outcome !== "all" && c.outcome !== outcome) return false;
          if (line !== "all" && lineOf(p) !== line) return false;
          const day = c.decidedAt.slice(0, 10);
          if (rangeBounds.from && day < rangeBounds.from) return false;
          if (rangeBounds.to && day > rangeBounds.to) return false;
          if (q && !`${p.firstName} ${p.lastName} ${c.orderId} ${c.id} ${c.hrcName}`.toLowerCase().includes(q)) return false;
          if (!okOrder.has(p.id)) okOrder.set(p.id, matchesFilter(p, f, ctx));
          return okOrder.get(p.id)!;
        })
        .sort((a, b) => (a.decidedAt < b.decidedAt ? 1 : a.decidedAt > b.decidedAt ? -1 : b.id.localeCompare(a.id)));
    },
    [conversions, byId, showVoided, hrc, outcome, line, rangeBounds, search, ctx],
  );
  const rows = useMemo(() => rowsFor(current), [rowsFor, current]);
  const t = totals(rows, live);
  const activeCount = activeQuickKeys(current.quick).length + current.all.length + current.any.length;

  const togglePin = (id: string) =>
    updatePrefs(currentUser.id, {
      pinnedFilterIds: prefs.pinnedFilterIds.includes(id) ? prefs.pinnedFilterIds.filter((x) => x !== id) : [...prefs.pinnedFilterIds, id],
    });
  const closeDrawer = () => setDrawer((d) => (d ? { ...d, open: false } : d));
  const saveAs = (d: FilterDraft, name: string, visibility: SavedFilter["visibility"]) => {
    // Saved views work the same everywhere: they carry the board scope, which this page leaves out
    const f: SavedFilter = { id: newId("f"), name, createdById: currentUser.id, visibility, all: [...boardScope(), ...d.all], any: d.any, quick: cleanQuick(d.quick) };
    store.saveFilter(f);
    if (!prefs.pinnedFilterIds.includes(f.id)) updatePrefs(currentUser.id, { pinnedFilterIds: [...prefs.pinnedFilterIds, f.id] });
    selectView(f.id);
    closeDrawer();
  };
  const canEditView = (f: SavedFilter) => !f.standard && (f.createdById === currentUser.id || currentUser.role === "admin");
  const money = (c: number) => formatCentsExact(c);

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-6 pb-3 pt-8">
        <h1 className="text-lg font-semibold">Conversions</h1>
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search patient, order, CNV ID, HRC" className="w-72 pl-7" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          {isLead ? (
            <Select value={hrc} onChange={(e) => setHrc(e.target.value)} className="w-48" title="HRC who won or lost it">
              <option value={ALL_OWNERS}>All HRCs</option>
              {hrcs.map((u) => (
                <option key={u.id} value={u.id}>
                  {userDisplayName(u)}
                </option>
              ))}
            </Select>
          ) : (
            <span className="text-sm text-muted">Your conversions</span>
          )}
          <FiltersMenu
            activeId={active.id}
            pinnedIds={prefs.pinnedFilterIds}
            assignedIds={assignedIds}
            onApply={selectView}
            onTogglePin={togglePin}
            onEdit={(f) => {
              selectView(f.id);
              setDrawer({ open: true, key: Date.now() });
            }}
            onNew={() => {
              selectView("std_all");
              setDrawer({ open: true, key: Date.now() });
            }}
          />
          <Button onClick={() => setDrawer({ open: true, key: Date.now() })} aria-haspopup="dialog">
            <SlidersHorizontal size={14} /> Filters
            {activeCount > 0 && <span className="min-w-[18px] rounded-full bg-brand px-1.5 text-[11px] font-semibold leading-[18px] text-white tabular-nums">{activeCount}</span>}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 px-6 pb-3">
        <TabsBar
          standard={STANDARD_VIEWS}
          assigned={tabs.filter((x) => assignedIds.has(x.id))}
          pinned={tabs.filter((x) => !x.standard && !assignedIds.has(x.id))}
          activeId={unsaved ? "" : active.id}
          onSelect={selectView}
          onReorder={(ids) => updatePrefs(currentUser.id, { pinnedFilterIds: ids })}
          onUnpin={togglePin}
        />
        {unsaved && (
          <span className="flex h-8 shrink-0 items-center gap-1 rounded-md bg-brand pl-3 pr-1 text-sm font-medium text-white">
            Unsaved view
            <button onClick={() => setUnsaved(null)} className="rounded p-1 opacity-70 hover:bg-white/15 hover:opacity-100" title={`Back to ${active.name}`}>
              <X size={13} />
            </button>
          </span>
        )}
      </div>

      {/* Date range, outcome, line */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-6 pb-4 text-sm">
        <Seg label="Won / lost date" value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r, label: RANGE_LABELS[r] }))} />
        {range === "custom" && (
          <span className="flex items-center gap-2">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" aria-label="From" />
            <span className="text-muted">to</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" aria-label="To" />
          </span>
        )}
        <Seg label="Outcome" value={outcome} onChange={setOutcome} options={[{ value: "all", label: "Won & lost" }, { value: "won", label: "Won" }, { value: "lost", label: "Lost" }]} />
        <Seg label="Line" value={line} onChange={setLine} options={[{ value: "all", label: "Both lines" }, { value: "ortho", label: "Ortho" }, { value: "cardiac", label: "Cardiac" }]} />
        <label className="flex items-center gap-1.5 text-muted">
          <input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} className="accent-[var(--brand)]" />
          Show voided rows
        </label>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3 px-6 pb-4 sm:grid-cols-5">
        {/* Orders, each counted once by its current outcome */}
        <Stat label="Orders won" value={String(t.won)} />
        <Stat label="Orders lost" value={String(t.lost)} />
        <Stat label="Win rate" value={t.winRate === null ? "–" : `${Math.round(t.winRate * 100)}%`} />
        <Stat label="EPR won" value={money(t.eprWonCents)} />
        <Stat label="Collected upfront" value={money(t.collectedUpfrontCents)} />
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-auto px-6 pb-6">
        <table className="w-full min-w-[1180px] border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-surface-2 text-left text-xs font-semibold text-muted">
            <tr>
              {["Conversion", "Won / lost", "Outcome", "iOMS order", "Patient", "Line", "HRC", "EPR", "Payment type", "Collected upfront", "Installment plan", "Lost reason", "Row"].map((h) => (
                <th key={h} className={cx("border-b border-border px-3 py-2", ["EPR", "Collected upfront", "Installment plan"].includes(h) && "text-right")}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <ConversionRow key={c.id} c={c} p={byId[c.patientId]} current={live.has(c.id)} superseded={!c.voided && !live.has(c.id) && conversionsFor(conversions, c.patientId).length > 1} />
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="py-10 text-center text-sm text-muted">No conversions match these filters.</p>}
      </div>

      {drawer && (
        <>
          <div aria-hidden onClick={closeDrawer} className={cx("absolute inset-0 z-40 bg-slate-900/30 transition-opacity duration-300", drawer.open ? "opacity-100" : "pointer-events-none opacity-0")} />
          <SlideOver open={drawer.open} onExited={() => setDrawer(null)} className="absolute inset-y-0 right-0 z-50">
            <FilterDrawer
              key={drawer.key}
              initial={current}
              baseView={active}
              canUpdateBase={canEditView(active)}
              showOwners={isLead}
              coordinators={hrcs}
              insuranceOptions={[...new Set(patients.map((p) => p.insuranceName).filter(Boolean))].sort()}
              stateOptions={[...new Set(patients.map((p) => p.state).filter(Boolean))].sort()}
              count={(d) => rowsFor(d).length}
              countNoun={["conversion", "conversions"]}
              onApply={(d) => {
                setUnsaved(JSON.stringify(d) === JSON.stringify(viewDraft) ? null : { ...d, quick: cleanQuick(d.quick) });
                closeDrawer();
              }}
              onSaveAs={saveAs}
              onUpdateBase={(d) => {
                store.saveFilter({ ...active, all: [...active.all.filter(isBoardScope), ...d.all], any: d.any, quick: cleanQuick(d.quick) });
                setUnsaved(null);
                closeDrawer();
              }}
              onDeleteBase={() => {
                store.deleteFilter(active.id);
                selectView("std_all");
                closeDrawer();
              }}
              onClose={closeDrawer}
            />
          </SlideOver>
        </>
      )}
    </div>
  );
}

function ConversionRow({ c, p, current, superseded }: { c: Conversion; p: Patient; current: boolean; superseded: boolean }) {
  const struck = c.voided ? "line-through text-muted" : "";
  const td = "border-b border-border px-3 py-2 align-top";
  return (
    <tr className={cx(c.voided && "bg-surface-2/50")}>
      <td className={cx(td, "whitespace-nowrap font-mono text-xs", struck)}>{c.id}</td>
      <td className={cx(td, "whitespace-nowrap", struck)}>{formatDate(c.decidedAt.slice(0, 10))}</td>
      <td className={td}>
        <span className={cx("rounded px-1.5 py-px text-[10px] font-semibold uppercase", c.voided ? "bg-surface-2 text-muted line-through" : c.outcome === "won" ? "bg-payer-commercial text-white" : "bg-payer-medicare text-white")}>{c.outcome}</span>
      </td>
      <td className={cx(td, "tabular-nums", struck)}>{c.orderId}</td>
      <td className={cx(td, struck)}>
        <Link href={`${PIPELINE_PATH[lineOf(p)]}?open=${encodeURIComponent(p.id)}`} className="text-brand-ink hover:underline">
          {p.firstName} {p.lastName}
        </Link>
      </td>
      <td className={cx(td, struck)}>{LINE_LABELS[lineOf(p)]}</td>
      <td className={cx(td, "whitespace-nowrap", struck)}>{c.hrcName}</td>
      <td className={cx(td, "text-right tabular-nums", struck)}>{formatCentsExact(c.eprCents)}</td>
      <td className={cx(td, "whitespace-nowrap", struck)}>{PAYMENT_TYPE_LABELS[c.paymentType]}</td>
      <td className={cx(td, "text-right tabular-nums", struck)}>{formatCentsExact(c.collectedUpfrontCents)}</td>
      <td className={cx(td, "whitespace-nowrap text-right tabular-nums", struck)}>{c.installmentCents ? `${formatCentsExact(c.installmentCents)} · ${c.installmentMonths} mo` : "–"}</td>
      <td className={cx(td, "text-xs", struck)}>{c.lostReason ? `${c.lostReason} · ${c.lostSubReason}` : "–"}</td>
      <td className={cx(td, "whitespace-nowrap text-xs")}>
        {c.voided ? <span className="text-muted">Voided by {c.voided.by}</span> : current ? <span className="font-medium text-brand-ink">Current</span> : superseded ? <span className="text-muted">Superseded</span> : null}
      </td>
    </tr>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Seg<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex overflow-hidden rounded-md border border-border">
      {options.map((o, i) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx("h-8 px-3 text-[13px] transition-colors", i > 0 && "border-l border-border", o.value === value ? "bg-brand font-medium text-white" : "bg-surface text-ink hover:bg-surface-2")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
