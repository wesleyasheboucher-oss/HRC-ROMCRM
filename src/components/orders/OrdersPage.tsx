"use client";

import {
  ArrowRight,
  CalendarClock,
  Columns3,
  Handshake,
  HeartPulse,
  Inbox,
  Landmark,
  PackageCheck,
  Receipt,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Truck,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FieldsPickerModal } from "@/components/deals/CardFieldsModal";
import { DetailPanel } from "@/components/deals/DetailPanel";
import { ListView } from "@/components/deals/ListView";
import { FilterDrawer, type FilterDraft } from "@/components/filters/FilterDrawer";
import { FiltersMenu } from "@/components/filters/FiltersMenu";
import { TabsBar } from "@/components/filters/TabsBar";
import { Button, Input, Select, SlideOver, cx } from "@/components/ui";
import { startOfToday } from "@/lib/dates";
import { DEFAULT_ORDERS_COLUMNS, FIELDS_BY_KEY, userDisplayName } from "@/lib/fields";
import {
  ALL_OWNERS,
  assignedFilterIds,
  boardScope,
  isBoardScope,
  matchesFilter,
  ME_TOKEN,
  MY_ORDERS_VIEW,
  newId,
  STANDARD_VIEWS,
  tabsForUser,
  type EvalCtx,
} from "@/lib/filters";
import { HRC_STATUS, isPrimeStatus, lineOf, PRIME_STATUSES, primeStatusOf, SUBSTATUSES, substatusOf, type PrimeStatus } from "@/lib/orderStatus";
import { activeQuickKeys, cleanQuick, FIELD_TO_QUICK, type QuickKey } from "@/lib/quickFilters";
import { canViewAllCoordinators, useStore } from "@/lib/store";
import type { Line, Patient, SavedFilter } from "@/lib/types";

const STATUS_ICONS: Record<PrimeStatus, LucideIcon> = {
  "Order Intake": Inbox,
  Verifications: ShieldCheck,
  "Patient Sales": Handshake,
  "Delivery Scheduling": CalendarClock,
  "Awaiting Delivery": Truck,
  "Delivered — Awaiting Treatment Start": PackageCheck,
  "In Treatment": HeartPulse,
  Billing: Receipt,
  "Insurance Collections": Landmark,
  "Patient Collections": Wallet,
};

/** All Orders tabs: "My orders" stands in for the board's "All Patients" (here they'd be the same view). */
const ORDER_STANDARD_VIEWS: SavedFilter[] = [MY_ORDERS_VIEW, ...STANDARD_VIEWS.filter((v) => v.id !== "std_all")];

/**
 * All Orders (Notion: "All orders are viewable in their relative statuses and are viewable by HRCs, and can be filtered
 * down to the individual HRC, to see where their orders are"). The ten prime statuses as a row of steps with counts;
 * pick one for its substatuses and its orders. Not a kanban: no columns of cards, no drag and drop.
 * Filters (views, the Filters drawer, HRC, line, search) change the counts and the list together.
 */
export function OrdersPage() {
  const store = useStore();
  const { patients, filters, assignments, currentUser, users, usersById, prefsFor, updatePrefs } = store;
  const prefs = prefsFor(currentUser.id);
  const isLead = canViewAllCoordinators(currentUser);
  const hrcs = users.filter((u) => u.role === "coordinator");
  const today = useMemo(() => startOfToday(), []);

  // Selected status / substatus live in the URL so a view can be linked: /orders?status=Billing&sub=Ready%20for%20Billing
  const router = useRouter();
  const params = useSearchParams();
  const statusParam = params.get("status");
  const status: PrimeStatus | null = statusParam && isPrimeStatus(statusParam) ? statusParam : null;
  const subParam = params.get("sub");
  const sub = status && subParam && (SUBSTATUSES[status] as readonly string[]).includes(subParam) ? subParam : null;
  const setStatus = (s: PrimeStatus | null, sb: string | null = null) => {
    const q = new URLSearchParams();
    if (s) q.set("status", s);
    if (s && sb) q.set("sub", sb);
    router.replace(q.size ? `/orders?${q.toString()}` : "/orders", { scroll: false });
  };

  const [activeId, setActiveId] = useState(MY_ORDERS_VIEW.id);
  const [unsaved, setUnsaved] = useState<FilterDraft | null>(null);
  const [drawer, setDrawer] = useState<{ open: boolean; key: number; focus?: QuickKey | null; seedField?: string | null } | null>(null);
  // "All HRCs" or one HRC. With All HRCs, "me" in a view is the signed-in HRC (managers: everyone)
  const [hrc, setHrc] = useState<string>(ALL_OWNERS);
  const [line, setLine] = useState<"all" | Line>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [columnsOpen, setColumnsOpen] = useState(false);

  const meId = hrc !== ALL_OWNERS ? hrc : isLead ? ALL_OWNERS : currentUser.id;
  const ctx: EvalCtx = useMemo(() => ({ usersById, today, meId }), [usersById, today, meId]);
  const tabs = tabsForUser(currentUser, filters, assignments, prefs).filter((t) => !t.standard);
  const assignedIds = assignedFilterIds(currentUser, assignments);
  const active = [...ORDER_STANDARD_VIEWS, ...STANDARD_VIEWS, ...filters].find((f) => f.id === activeId) ?? MY_ORDERS_VIEW;
  // Views saved on the board carry the board scope (owner + Patient Sales). Here the owner part applies; Patient Sales doesn't,
  // since this page shows every status.
  const ownerScope = active.all.filter((c) => isBoardScope(c) && c.field === "owner");
  const viewDraft: FilterDraft = { quick: active.quick ?? {}, all: active.all.filter((c) => !isBoardScope(c)), any: active.any };
  const current = unsaved ?? viewDraft;
  const selectView = (id: string) => {
    setActiveId(id);
    setUnsaved(null);
  };

  /** Orders that pass every filter except the status row. */
  const filteredFor = useCallback(
    (d: FilterDraft) => {
      const q = search.trim().toLowerCase();
      const f = { all: [...ownerScope, ...d.all], any: d.any, quick: d.quick };
      return patients.filter((p) => {
        if (hrc !== ALL_OWNERS && p.ownerId !== hrc) return false;
        if (line !== "all" && lineOf(p) !== line) return false;
        if (q && !`${p.firstName} ${p.lastName} ${p.id} ${p.iomsOrderId} ${p.insuranceName} ${p.mobilePhone}`.toLowerCase().includes(q)) return false;
        return matchesFilter(p, f, ctx);
      });
    },
    [patients, hrc, line, search, ownerScope, ctx],
  );
  const filtered = useMemo(() => filteredFor(current), [filteredFor, current]);

  const byStatus = useMemo(() => {
    const m = Object.fromEntries(PRIME_STATUSES.map((s) => [s, [] as Patient[]])) as Record<PrimeStatus, Patient[]>;
    for (const p of filtered) m[primeStatusOf(p)].push(p);
    return m;
  }, [filtered]);

  const sorted = useMemo(() => {
    const field = FIELDS_BY_KEY[prefs.sort.field] ?? FIELDS_BY_KEY.surgeryDate;
    const dir = prefs.sort.dir === "asc" ? 1 : -1;
    const list = status ? byStatus[status].filter((p) => !sub || substatusOf(p) === sub) : filtered;
    return [...list].sort((a, b) => {
      const va = field.get(a, ctx);
      const vb = field.get(b, ctx);
      if (va === vb) return 0;
      if (va === null || va === "") return 1;
      if (vb === null || vb === "") return -1;
      return (va < vb ? -1 : 1) * dir;
    });
  }, [status, sub, byStatus, filtered, prefs.sort, ctx]);

  // Detail panel (kept while it slides out)
  const [panelId, setPanelId] = useState<string | null>(null);
  if (selectedId && selectedId !== panelId) setPanelId(selectedId);
  const panelPatient = patients.find((p) => p.id === panelId);
  const idx = sorted.findIndex((p) => p.id === selectedId);

  // An unknown status in the URL (e.g. an old link) falls back to every status
  useEffect(() => {
    if (statusParam && !status) router.replace("/orders", { scroll: false });
  }, [statusParam, status, router]);

  const togglePin = (id: string) =>
    updatePrefs(currentUser.id, {
      pinnedFilterIds: prefs.pinnedFilterIds.includes(id) ? prefs.pinnedFilterIds.filter((x) => x !== id) : [...prefs.pinnedFilterIds, id],
    });
  const openDrawer = (o: { focus?: QuickKey | null; seedField?: string | null } = {}) => setDrawer({ open: true, key: Date.now(), ...o });
  const closeDrawer = () => setDrawer((d) => (d ? { ...d, open: false } : d));
  const canEditView = (f: SavedFilter) => !f.standard && (f.createdById === currentUser.id || currentUser.role === "admin");
  const saveAs = (d: FilterDraft, name: string, visibility: SavedFilter["visibility"]) => {
    // Saved the same way as on the board (with the board scope), so a view works on both pages
    const f: SavedFilter = { id: newId("f"), name, createdById: currentUser.id, visibility, all: [...boardScope(), ...d.all], any: d.any, quick: cleanQuick(d.quick) };
    store.saveFilter(f);
    if (!prefs.pinnedFilterIds.includes(f.id)) updatePrefs(currentUser.id, { pinnedFilterIds: [...prefs.pinnedFilterIds, f.id] });
    selectView(f.id);
    closeDrawer();
  };
  const activeCount = activeQuickKeys(current.quick).length + current.all.length + current.any.length;
  const columns = prefs.ordersColumns ?? DEFAULT_ORDERS_COLUMNS;

  return (
    <div
      className="relative flex h-full overflow-hidden"
      onClick={(e) => {
        if (!selectedId) return;
        if ((e.target as HTMLElement).closest("[data-drawer],[data-patient]")) return;
        setSelectedId(null);
      }}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 px-6 pb-3 pt-8">
          <h1 className="text-lg font-semibold">All Orders</h1>
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, order ID, insurance, phone" className="w-72 pl-7" />
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="text-sm tabular-nums text-muted">
              <span className="font-semibold text-ink">{filtered.length}</span> orders
            </span>
            <Select value={hrc} onChange={(e) => setHrc(e.target.value)} className="w-48" title="Whose orders">
              <option value={ALL_OWNERS}>All HRCs</option>
              {hrcs.map((u) => (
                <option key={u.id} value={u.id}>
                  {userDisplayName(u)}
                  {u.id === currentUser.id ? " (me)" : ""}
                </option>
              ))}
            </Select>
            <Seg
              label="Line"
              value={line}
              onChange={setLine}
              options={[
                { value: "all", label: "Both lines" },
                { value: "ortho", label: "Ortho" },
                { value: "cardiac", label: "Cardiac" },
              ]}
            />
            <Button onClick={() => setColumnsOpen(true)} title="Choose list columns">
              <Columns3 size={14} /> Columns
            </Button>
            <FiltersMenu
              activeId={active.id}
              pinnedIds={prefs.pinnedFilterIds}
              assignedIds={assignedIds}
              onApply={selectView}
              onTogglePin={togglePin}
              onEdit={(f) => {
                selectView(f.id);
                openDrawer();
              }}
              onNew={() => {
                selectView(MY_ORDERS_VIEW.id);
                openDrawer();
              }}
            />
            <Button onClick={() => openDrawer()} aria-haspopup="dialog">
              <SlidersHorizontal size={14} /> Filters
              {activeCount > 0 && <span className="min-w-[18px] rounded-full bg-brand px-1.5 text-[11px] font-semibold leading-[18px] text-white tabular-nums">{activeCount}</span>}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 px-6 pb-4">
          <TabsBar
            standard={ORDER_STANDARD_VIEWS}
            assigned={tabs.filter((t) => assignedIds.has(t.id))}
            pinned={tabs.filter((t) => !assignedIds.has(t.id))}
            activeId={unsaved ? "" : active.id}
            onSelect={selectView}
            onReorder={(ids) => updatePrefs(currentUser.id, { pinnedFilterIds: ids })}
            onUnpin={togglePin}
          />
          {unsaved && (
            <span className="flex h-8 shrink-0 items-center gap-1 rounded-md bg-brand pl-3 pr-1 text-sm font-medium text-white">
              <button onClick={() => openDrawer()}>Unsaved view</button>
              <button onClick={() => setUnsaved(null)} className="rounded p-1 opacity-70 hover:bg-white/15 hover:opacity-100" title={`Back to ${active.name}`}>
                <X size={13} />
              </button>
            </span>
          )}
          {hrc === ALL_OWNERS && !isLead && active.all.some((c) => c.field === "owner" && c.value === ME_TOKEN) && (
            <span className="text-xs text-muted">Showing your orders. Pick an HRC, or another view, to see others.</span>
          )}
        </div>

        {/* The status row: ten steps in order */}
        <div className="px-6 pb-4">
          <ol className="flex flex-wrap items-stretch gap-y-3" aria-label="Order statuses">
            {PRIME_STATUSES.map((s, i) => {
              const Icon = STATUS_ICONS[s];
              const on = status === s;
              const hrcStep = s === HRC_STATUS.prime;
              const n = byStatus[s].length;
              return (
                <li key={s} className="flex min-w-[104px] flex-1 items-stretch">
                  <button
                    onClick={() => setStatus(on ? null : s)}
                    aria-pressed={on}
                    title={on ? "Show every status" : `Show orders in ${s}`}
                    className={cx(
                      "flex min-w-0 flex-1 flex-col rounded-lg border bg-surface px-2.5 py-2.5 text-left transition-[box-shadow,border-color]",
                      on ? "border-brand ring-2 ring-brand/40" : "border-border hover:border-slate-400",
                      hrcStep && !on && "border-payer-commercial/50 bg-emerald-50/50 dark:bg-emerald-950/20",
                      n === 0 && !on && "opacity-60",
                    )}
                  >
                    <span className="flex items-center gap-1.5 text-muted">
                      <Icon size={15} className={cx(hrcStep && "text-payer-commercial", on && "text-brand-ink")} />
                      <span className="text-[11px] font-semibold tabular-nums">{i + 1}</span>
                      {hrcStep && <span className="ml-auto rounded bg-payer-commercial px-1 text-[9px] font-bold uppercase leading-[14px] text-white">HRC</span>}
                    </span>
                    <span className="mt-1 min-h-[42px] text-[11.5px] font-medium leading-tight text-ink">{s}</span>
                    {/* Counts line up along the bottom, however many lines the name takes */}
                    <span className="mt-auto pt-1 text-2xl font-semibold tabular-nums text-ink">{n}</span>
                  </button>
                  {i < PRIME_STATUSES.length - 1 && (
                    <span aria-hidden className="flex shrink-0 items-center px-0.5 text-muted">
                      <ArrowRight size={13} />
                    </span>
                  )}
                </li>
              );
            })}
          </ol>

          {/* Substatus chips for the picked status */}
          {status && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted">{status}:</span>
              {SUBSTATUSES[status].map((sb) => {
                const n = byStatus[status].filter((p) => substatusOf(p) === sb).length;
                const on = sub === sb;
                return (
                  <button
                    key={sb}
                    onClick={() => setStatus(status, on ? null : sb)}
                    aria-pressed={on}
                    className={cx(
                      "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors",
                      on ? "border-brand bg-brand-soft font-medium text-brand-ink" : "border-border bg-surface text-ink hover:border-slate-400",
                    )}
                  >
                    {sb}
                    <span className="tabular-nums text-muted">{n}</span>
                  </button>
                );
              })}
              <button onClick={() => setStatus(null)} className="ml-1 text-xs font-medium text-brand-ink hover:underline">
                Show every status
              </button>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1">
          <ListView
            patients={sorted}
            columns={columns}
            ctx={ctx}
            selectedId={selectedId}
            sort={prefs.sort}
            onSort={(sort) => updatePrefs(currentUser.id, { sort })}
            onFilterBy={(key) => (FIELD_TO_QUICK[key] ? openDrawer({ focus: FIELD_TO_QUICK[key] }) : openDrawer({ seedField: key }))}
            onSelect={setSelectedId}
          />
        </div>
      </div>

      <div aria-hidden className={cx("pointer-events-none absolute inset-0 z-20 bg-slate-900/20 transition-opacity duration-300", selectedId ? "opacity-100" : "opacity-0")} />
      {panelPatient && (
        <SlideOver open={!!selectedId} onExited={() => setPanelId(null)} className="absolute inset-y-0 right-0 z-30 w-[min(1200px,calc(100%-260px))]">
          <DetailPanel
            patient={panelPatient}
            ctx={ctx}
            onClose={() => setSelectedId(null)}
            onPrev={idx > 0 ? () => setSelectedId(sorted[idx - 1].id) : null}
            onNext={idx >= 0 && idx < sorted.length - 1 ? () => setSelectedId(sorted[idx + 1].id) : null}
          />
        </SlideOver>
      )}

      {drawer && (
        <>
          <div aria-hidden onClick={closeDrawer} className={cx("absolute inset-0 z-40 bg-slate-900/30 transition-opacity duration-300", drawer.open ? "opacity-100" : "pointer-events-none opacity-0")} />
          <SlideOver open={drawer.open} onExited={() => setDrawer(null)} className="absolute inset-y-0 right-0 z-50">
            <FilterDrawer
              key={drawer.key}
              initial={current}
              focus={drawer.focus}
              seedField={drawer.seedField}
              baseView={active}
              canUpdateBase={canEditView(active)}
              showOwners={isLead}
              coordinators={hrcs}
              insuranceOptions={[...new Set(patients.map((p) => p.insuranceName).filter(Boolean))].sort()}
              stateOptions={[...new Set(patients.map((p) => p.state).filter(Boolean))].sort()}
              count={(d) => filteredFor(d).length}
              countNoun={["order", "orders"]}
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
                selectView(MY_ORDERS_VIEW.id);
                closeDrawer();
              }}
              onClose={closeDrawer}
            />
          </SlideOver>
        </>
      )}

      {columnsOpen && (
        <FieldsPickerModal
          title="All Orders columns"
          description="Choose which columns appear on the All Orders list, and in what order. This only changes your own list."
          chosenLabel="Columns"
          initial={columns}
          defaults={DEFAULT_ORDERS_COLUMNS}
          onClose={() => setColumnsOpen(false)}
          onSave={(ordersColumns) => {
            updatePrefs(currentUser.id, { ordersColumns });
            setColumnsOpen(false);
          }}
        />
      )}
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
