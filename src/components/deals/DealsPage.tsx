"use client";

import { ArrowDownWideNarrow, ArrowUpNarrowWide, Columns3, LayoutGrid, List, Search, SlidersHorizontal, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { startOfToday } from "@/lib/dates";
import { coverage, COVERAGE_META, COVERAGES, DEFAULT_CARD_FIELDS, DEFAULT_LIST_COLUMNS, FIELDS_BY_KEY, PLAN_TAG_META, planTag, userDisplayName, type FieldCtx } from "@/lib/fields";
import { ALL_OWNERS, assignedFilterIds, boardScope, isBoardScope, matchesFilter, ME_TOKEN, newId, OPERATOR_LABELS, operatorNeedsValue, STANDARD_VIEWS, tabsForUser, type EvalCtx } from "@/lib/filters";
import { activeQuickKeys, cleanQuick, FIELD_TO_QUICK, QUICK_LABELS, quickValueText, sameQuick, type QuickKey } from "@/lib/quickFilters";
import { STAGES } from "@/lib/stages";
import { lineOf, LINE_LABELS } from "@/lib/orderStatus";
import { boardColumns, columnOf, PIPELINE_PATH } from "@/lib/pipelines";
import { canViewAllCoordinators, useStore } from "@/lib/store";
import type { Condition, Line, Patient, SavedFilter, StageId } from "@/lib/types";
import { FilterDrawer, type FilterDraft } from "../filters/FilterDrawer";
import { FiltersMenu } from "../filters/FiltersMenu";
import { TabsBar } from "../filters/TabsBar";
import { Button, Input, Select, SlideOver, cx } from "../ui";
import { Board } from "./Board";
import { FieldsPickerModal } from "./CardFieldsModal";
import { PatientCard } from "./PatientCard";
import { DetailPanel } from "./DetailPanel";
import { ListView } from "./ListView";

const SORT_FIELDS = ["expectedCloseDate", "surgeryDate", "firstName", "financialEstimate", "age", "createdAt"];

/** Patient Pipeline for one line: Ortho (columns by days to surgery) or Cardiac (columns by enrollment call). */
export function DealsPage({ line = "ortho" }: { line?: Line }) {
  const store = useStore();
  const { patients: allPatients, filters, assignments, currentUser, users, usersById, prefsFor, updatePrefs } = store;
  const prefs = prefsFor(currentUser.id);
  // Each line has its own board: only that line's orders
  const patients = useMemo(() => allPatients.filter((p) => lineOf(p) === line), [allPatients, line]);
  const columns = boardColumns(line);
  const isLead = canViewAllCoordinators(currentUser);

  const [view, setView] = useState<"board" | "list">("board"); // D-01: board by default
  const [activeId, setActiveId] = useState("std_all");
  const [viewingOwner, setViewingOwner] = useState(isLead ? ALL_OWNERS : currentUser.id);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cardFieldsOpen, setCardFieldsOpen] = useState(false); // card fields (board) or columns (list)
  // Filters changed from the drawer or chip row but not saved: shown as an "Unsaved view" tab on top of the active view
  const [unsaved, setUnsaved] = useState<FilterDraft | null>(null);
  // Filters drawer: open/closed, kept mounted while it slides out; which section to jump to; a field to start an advanced condition on
  const [drawer, setDrawer] = useState<{ open: boolean; focus?: QuickKey | null; seedField?: string | null; key: number } | null>(null);
  const openDrawer = (opts: { focus?: QuickKey | null; seedField?: string | null } = {}) => setDrawer({ open: true, key: Date.now(), ...opts });
  const closeDrawer = () => setDrawer((d) => (d ? { ...d, open: false } : d));

  // Global search in the top bar links here with ?open=<patientId>.
  const searchParams = useSearchParams();
  const router = useRouter();
  const openParam = searchParams.get("open");
  useEffect(() => {
    if (!openParam) return;
    setSelectedId(openParam);
    // Make sure the patient is on screen: coordinators see their own book, leads see everyone.
    setActiveId("std_all");
    if (isLead) setViewingOwner(ALL_OWNERS);
    setSearch("");
    router.replace(PIPELINE_PATH[line]);
  }, [openParam, isLead, router, line]);

  const meId = isLead ? viewingOwner : currentUser.id;
  const today = useMemo(() => startOfToday(), []);
  const ctx: EvalCtx = useMemo(() => ({ usersById, today, meId }), [usersById, today, meId]);
  const fieldCtx: FieldCtx = ctx;

  const tabs = tabsForUser(currentUser, filters, assignments, prefs);
  const assignedIds = assignedFilterIds(currentUser, assignments);
  const allFilters = [...STANDARD_VIEWS, ...filters];
  const active = allFilters.find((f) => f.id === activeId) ?? STANDARD_VIEWS[0];
  // The board scope (owner + HRC status) stays with the view; the drawer edits everything else
  const scope = active.all.filter(isBoardScope);
  const viewDraft: FilterDraft = { quick: active.quick ?? {}, all: active.all.filter((c) => !isBoardScope(c)), any: active.any };
  const current: FilterDraft = unsaved ?? viewDraft;
  const effective = useMemo(() => ({ all: [...scope, ...current.all], any: current.any, quick: current.quick }), [scope, current]);
  const selectView = (id: string) => {
    setActiveId(id);
    setUnsaved(null);
  };
  /** Applies a draft: back to the plain view if it matches it, otherwise an unsaved view. */
  const applyDraft = (d: FilterDraft) => {
    const clean = { ...d, quick: cleanQuick(d.quick) };
    setUnsaved(sameDraft(clean, viewDraft) ? null : clean);
  };

  const sorted = useMemo(() => {
    const field = FIELDS_BY_KEY[prefs.sort.field];
    const dir = prefs.sort.dir === "asc" ? 1 : -1;
    const q = search.trim().toLowerCase();
    return patients
      .filter((p) => matchesFilter(p, effective, ctx))
      .filter((p) => matchesSearch(p, q))
      .sort((a, b) => {
        const va = field.get(a, ctx);
        const vb = field.get(b, ctx);
        if (va === vb) return 0;
        if (va === null || va === "") return 1;
        if (vb === null || vb === "") return -1;
        return (va < vb ? -1 : 1) * dir;
      });
  }, [patients, effective, ctx, prefs.sort, search]);

  // F-09: stages stay in place under any filter
  const byStage = useMemo(() => {
    const groups = Object.fromEntries(columns.map((s) => [s.id, [] as Patient[]])) as Record<string, Patient[]>;
    for (const p of sorted) groups[columnOf(line, p, today)].push(p);
    return groups;
  }, [sorted, today, columns, line]);

  // Order used by the panel's up/down arrows matches what's on screen.
  const navOrder = useMemo(() => (view === "board" ? columns.flatMap((s) => byStage[s.id]) : sorted), [view, byStage, sorted, columns]);
  const selectedIdx = navOrder.findIndex((p) => p.id === selectedId);

  // The panel keeps showing the last patient while it slides out after close.
  const [panelId, setPanelId] = useState<string | null>(null);
  if (selectedId && selectedId !== panelId) setPanelId(selectedId);
  // Any order can open in the panel (e.g. from search), even one not on this board
  const panelPatient = allPatients.find((p) => p.id === panelId);

  // Live count for the drawer's main button: same scope and search as the page
  const countDraft = useCallback(
    (d: FilterDraft) => {
      const q = search.trim().toLowerCase();
      const f = { all: [...scope, ...d.all], any: d.any, quick: d.quick };
      return patients.filter((p) => matchesFilter(p, f, ctx) && matchesSearch(p, q)).length;
    },
    [patients, ctx, scope, search],
  );
  const insuranceOptions = useMemo(() => [...new Set(patients.map((p) => p.insuranceName).filter(Boolean))].sort(), [patients]);
  const stateOptions = useMemo(() => [...new Set(patients.map((p) => p.state).filter(Boolean))].sort(), [patients]);
  const canEditView = (f: SavedFilter) => !f.standard && (f.createdById === currentUser.id || currentUser.role === "admin");

  const saveAs = (d: FilterDraft, name: string, visibility: SavedFilter["visibility"]) => {
    // A new view always starts on the board owner's Patient Sales orders, like the standard views
    const f: SavedFilter = {
      id: newId("f"),
      name,
      createdById: currentUser.id,
      visibility,
      all: [...(scope.length ? scope : boardScope()), ...d.all],
      any: d.any,
      quick: cleanQuick(d.quick),
    };
    store.saveFilter(f);
    if (!prefs.pinnedFilterIds.includes(f.id)) updatePrefs(currentUser.id, { pinnedFilterIds: [...prefs.pinnedFilterIds, f.id] });
    selectView(f.id);
    closeDrawer();
  };
  const updateView = (d: FilterDraft) => {
    store.saveFilter({ ...active, all: [...scope, ...d.all], any: d.any, quick: cleanQuick(d.quick) });
    setUnsaved(null);
    closeDrawer();
  };
  const deleteView = () => {
    store.deleteFilter(active.id);
    selectView("std_all");
    closeDrawer();
  };

  // Chip row: one chip per drawer section in use, then one per advanced condition
  const stageName = (id: StageId) => STAGES.find((s) => s.id === id)?.label ?? id;
  const userName = (id: string) => userDisplayName(usersById[id]);
  const quickKeys = activeQuickKeys(current.quick);
  const activeCount = quickKeys.length + current.all.length + current.any.length;
  const removeQuick = (k: QuickKey) => applyDraft({ ...current, quick: { ...current.quick, [k]: undefined } });
  const removeCondition = (id: string) => applyDraft({ ...current, all: current.all.filter((c) => c.id !== id), any: current.any.filter((c) => c.id !== id) });

  const togglePin = (id: string) =>
    updatePrefs(currentUser.id, {
      pinnedFilterIds: prefs.pinnedFilterIds.includes(id) ? prefs.pinnedFilterIds.filter((x) => x !== id) : [...prefs.pinnedFilterIds, id],
    });

  // Toolbar legend: counts per plan tag and per coverage tag
  const planCounts: Record<string, number> = {};
  const coverageCounts: Record<string, number> = {};
  for (const p of sorted) {
    planCounts[planTag(p)] = (planCounts[planTag(p)] ?? 0) + 1;
    const c = coverage(p);
    if (c) coverageCounts[c] = (coverageCounts[c] ?? 0) + 1;
  }

  const coordinators = users.filter((u) => u.role === "coordinator");
  const activeIsTab = tabs.some((t) => t.id === active.id);

  return (
    <div
      className="relative flex h-full overflow-hidden"
      // Clicking outside the drawer closes it, unless the click is on a patient (which opens that patient instead)
      onClick={(e) => {
        if (!selectedId) return;
        const target = e.target as HTMLElement;
        if (target.closest("[data-drawer],[data-patient]")) return;
        setSelectedId(null);
      }}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 px-6 pb-4 pt-8">
          <h1 className="text-lg font-semibold">Patient Pipeline · {LINE_LABELS[line]}</h1>
          <div className="flex rounded-md border border-border bg-surface p-0.5">
            <ViewBtn active={view === "board"} onClick={() => setView("board")} title="Pipeline view">
              <LayoutGrid size={15} />
            </ViewBtn>
            <ViewBtn active={view === "list"} onClick={() => setView("list")} title="List view">
              <List size={15} />
            </ViewBtn>
          </div>
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, ID, insurance, phone" className="w-72 pl-7" />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm tabular-nums text-muted">
              <span className="font-semibold text-ink">{sorted.length}</span> patients
            </span>
            {isLead && (
              // F-08: managers/admins can look at any coordinator's board
              <Select value={viewingOwner} onChange={(e) => setViewingOwner(e.target.value)} className="w-48" title="Whose board">
                <option value={ALL_OWNERS}>All coordinators</option>
                {coordinators.map((u) => (
                  <option key={u.id} value={u.id}>
                    {userDisplayName(u)}
                  </option>
                ))}
              </Select>
            )}
            <div className="flex items-center">
              <Select
                value={prefs.sort.field}
                onChange={(e) => updatePrefs(currentUser.id, { sort: { ...prefs.sort, field: e.target.value } })}
                className="rounded-r-none"
                title="Sort by"
              >
                {/* Sorting from a list header can pick any field; keep it selectable here too */}
                {[...SORT_FIELDS, ...(SORT_FIELDS.includes(prefs.sort.field) ? [] : [prefs.sort.field])].map((k) => (
                  <option key={k} value={k}>
                    Sort: {FIELDS_BY_KEY[k].label}
                  </option>
                ))}
              </Select>
              <button
                className="h-8 rounded-r-md border border-l-0 border-border bg-surface px-2 text-muted hover:bg-surface-2"
                title={prefs.sort.dir === "asc" ? "Ascending" : "Descending"}
                onClick={() => updatePrefs(currentUser.id, { sort: { ...prefs.sort, dir: prefs.sort.dir === "asc" ? "desc" : "asc" } })}
              >
                {prefs.sort.dir === "asc" ? <ArrowUpNarrowWide size={15} /> : <ArrowDownWideNarrow size={15} />}
              </button>
            </div>
            <Button onClick={() => setCardFieldsOpen(true)} title={view === "list" ? "Choose list columns" : "Choose card fields"}>
              <Columns3 size={14} /> {view === "list" ? "Columns" : "Card fields"}
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
                selectView("std_all");
                openDrawer();
              }}
            />
            <Button onClick={() => openDrawer()} className={cx(drawer?.open && "border-brand")} aria-haspopup="dialog">
              <SlidersHorizontal size={14} /> Filters
              {activeCount > 0 && (
                <span className="min-w-[18px] rounded-full bg-brand px-1.5 text-[11px] font-semibold leading-[18px] text-white tabular-nums">{activeCount}</span>
              )}
            </Button>
          </div>
        </div>

        {/* Tabs + legend */}
        <div className="flex items-center gap-4 px-6 pb-6">
          <TabsBar
            standard={STANDARD_VIEWS}
            assigned={tabs.filter((t) => assignedIds.has(t.id))}
            pinned={tabs.filter((t) => !t.standard && !assignedIds.has(t.id))}
            activeId={unsaved ? "" : active.id}
            onSelect={selectView}
            onReorder={(ids) => updatePrefs(currentUser.id, { pinnedFilterIds: ids })}
            onUnpin={togglePin}
          />
          {!activeIsTab && !unsaved && (
            <span className="flex h-8 items-center gap-2 rounded-md border border-dashed border-brand px-3 text-sm text-brand-ink">
              {active.name}
              <button className="text-xs underline" onClick={() => togglePin(active.id)}>
                Pin
              </button>
            </span>
          )}
          {unsaved && (
            <span className="flex h-8 shrink-0 items-center gap-1 rounded-md bg-brand pl-3 pr-1 text-sm font-medium text-white">
              <button onClick={() => openDrawer()} title={`Based on ${active.name}. Open the filters to save it as a view.`}>
                Unsaved view
              </button>
              <button onClick={() => setUnsaved(null)} className="rounded p-1 opacity-70 hover:bg-white/15 hover:opacity-100" title={`Discard changes, back to ${active.name}`}>
                <X size={13} />
              </button>
            </span>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-3 text-xs text-muted">
            {(["COMM", "MCR", "MCR ADV"] as const).map((t) => (
              <span key={t} className="flex items-center gap-1.5" title={PLAN_TAG_META[t].title}>
                <span className={cx("rounded px-1 py-0.5 text-[9px] font-semibold leading-none", PLAN_TAG_META[t].className)}>{t}</span>
                <span className="tabular-nums">{planCounts[t] ?? 0}</span>
              </span>
            ))}
            <span className="h-4 w-px bg-border" />
            {COVERAGES.map((c) => (
              <span key={c} className="flex items-center gap-1.5">
                <span className={cx("h-2 w-2 rounded-full", COVERAGE_META[c].dot)} />
                <span className="capitalize">{COVERAGE_META[c].label.toLowerCase()}</span>
                <span className="tabular-nums">{coverageCounts[c] ?? 0}</span>
              </span>
            ))}
          </div>
        </div>

        {activeCount > 0 && (
          <div className="-mt-3 flex flex-wrap items-center gap-2 px-6 pb-4">
            {quickKeys.map((k) => (
              <FilterChip
                key={k}
                label={QUICK_LABELS[k]}
                value={quickValueText(k, current.quick, { stage: stageName, user: userName })}
                onOpen={() => openDrawer({ focus: k })}
                onRemove={() => removeQuick(k)}
              />
            ))}
            {[...current.all, ...current.any].map((c) => (
              <FilterChip key={c.id} label={FIELDS_BY_KEY[c.field]?.label ?? c.field} value={conditionText(c, userName)} onOpen={() => openDrawer({ focus: null, seedField: null })} onRemove={() => removeCondition(c.id)} />
            ))}
            <button onClick={() => applyDraft({ quick: {}, all: [], any: [] })} className="text-xs font-medium text-brand-ink hover:underline">
              Clear all
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1">
          {view === "board" ? (
            <Board columns={columns} byStage={byStage} cardFields={prefs.cardFields} ctx={fieldCtx} selectedId={selectedId} drawerOpen={!!selectedId} onSelect={setSelectedId} />
          ) : (
            <ListView
              patients={sorted}
              columns={prefs.listColumns ?? DEFAULT_LIST_COLUMNS}
              ctx={fieldCtx}
              selectedId={selectedId}
              sort={prefs.sort}
              onSort={(sort) => updatePrefs(currentUser.id, { sort })}
              onFilterBy={(key) => (FIELD_TO_QUICK[key] ? openDrawer({ focus: FIELD_TO_QUICK[key] }) : openDrawer({ seedField: key }))}
              onSelect={setSelectedId}
            />
          )}
        </div>
      </div>

      {/* Dims the page while the drawer is open; the open patient's card sits above it. Clicks pass through to the board. */}
      <div
        aria-hidden
        className={cx(
          "pointer-events-none absolute inset-0 z-20 bg-slate-900/20 transition-opacity duration-300 motion-reduce:transition-none",
          selectedId ? "opacity-100" : "opacity-0",
        )}
      />

      {panelPatient && (
        <SlideOver
          open={!!selectedId}
          onExited={() => setPanelId(null)}
          className="absolute inset-y-0 right-0 z-30 w-[min(1200px,calc(100%-260px))]"
        >
          <DetailPanel
            patient={panelPatient}
            ctx={fieldCtx}
            onClose={() => setSelectedId(null)}
            onPrev={selectedIdx > 0 ? () => setSelectedId(navOrder[selectedIdx - 1].id) : null}
            onNext={selectedIdx >= 0 && selectedIdx < navOrder.length - 1 ? () => setSelectedId(navOrder[selectedIdx + 1].id) : null}
          />
        </SlideOver>
      )}

      {/* Filters drawer, over the page with a dimmed backdrop */}
      {drawer && (
        <>
          <div
            aria-hidden
            onClick={closeDrawer}
            className={cx("absolute inset-0 z-40 bg-slate-900/30 transition-opacity duration-300", drawer.open ? "opacity-100" : "pointer-events-none opacity-0")}
          />
          <SlideOver open={drawer.open} onExited={() => setDrawer(null)} className="absolute inset-y-0 right-0 z-50">
            <FilterDrawer
              key={drawer.key}
              initial={current}
              scope={scope}
              focus={drawer.focus}
              seedField={drawer.seedField}
              baseView={active}
              canUpdateBase={canEditView(active)}
              showOwners={isLead}
              coordinators={coordinators}
              insuranceOptions={insuranceOptions}
              stateOptions={stateOptions}
              count={countDraft}
              onApply={(d) => {
                applyDraft(d);
                closeDrawer();
              }}
              onSaveAs={saveAs}
              onUpdateBase={updateView}
              onDeleteBase={deleteView}
              onClose={closeDrawer}
            />
          </SlideOver>
        </>
      )}

      {cardFieldsOpen &&
        (view === "list" ? (
          <FieldsPickerModal
            title="List columns"
            description="Choose which columns appear in your list view, and in what order. Any field can be a column, including the record tabs. This only changes your own list."
            chosenLabel="Columns"
            initial={prefs.listColumns ?? DEFAULT_LIST_COLUMNS}
            defaults={DEFAULT_LIST_COLUMNS}
            onClose={() => setCardFieldsOpen(false)}
            onSave={(listColumns) => {
              updatePrefs(currentUser.id, { listColumns });
              setCardFieldsOpen(false);
            }}
          />
        ) : (
          <FieldsPickerModal
            title="Card fields"
            description="Choose which fields appear on your board cards. This only changes your own board. The first field is shown in bold."
            chosenLabel="On my cards"
            initial={prefs.cardFields}
            defaults={DEFAULT_CARD_FIELDS}
            preview={(fields) => {
              const sample = sorted[0] ?? patients[0];
              return sample ? <PatientCard patient={sample} fields={fields} ctx={fieldCtx} /> : null;
            }}
            onClose={() => setCardFieldsOpen(false)}
            onSave={(cardFields) => {
              updatePrefs(currentUser.id, { cardFields });
              setCardFieldsOpen(false);
            }}
          />
        ))}
    </div>
  );
}

function ViewBtn({ active, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return (
    <button
      className={cx("flex h-7 w-8 items-center justify-center rounded", active ? "bg-brand-soft text-brand-ink" : "text-muted hover:bg-surface-2")}
      {...props}
    />
  );
}


const matchesSearch = (p: Patient, q: string) => !q || `${p.firstName} ${p.lastName} ${p.id} ${p.insuranceName} ${p.mobilePhone}`.toLowerCase().includes(q);

const conditionsKey = (cs: Condition[]) => JSON.stringify(cs.map((c) => [c.field, c.operator, c.value]));
function sameDraft(a: FilterDraft, b: FilterDraft) {
  return sameQuick(a.quick, b.quick) && conditionsKey(a.all) === conditionsKey(b.all) && conditionsKey(a.any) === conditionsKey(b.any);
}

/** "is Medicare", "contains Aetna", "is empty"… for an advanced condition's chip. */
function conditionText(c: Condition, userName: (id: string) => string) {
  const field = FIELDS_BY_KEY[c.field];
  const value = c.value === ME_TOKEN ? "board owner" : field?.type === "user" ? userName(c.value) : c.value;
  return operatorNeedsValue(c.operator) ? `${OPERATOR_LABELS[c.operator]} ${value || "…"}` : OPERATOR_LABELS[c.operator];
}

/** One active filter above the board: click to edit it in the drawer, × to remove it. */
function FilterChip({ label, value, onOpen, onRemove }: { label: string; value: string; onOpen: () => void; onRemove: () => void }) {
  return (
    <span className="inline-flex h-7 max-w-[360px] items-center rounded-full bg-brand-soft text-[13px] text-brand-ink">
      <button onClick={onOpen} className="min-w-0 truncate pl-3 pr-1" title={`${label}: ${value}`}>
        {label}: <span className="font-semibold">{value}</span>
      </button>
      <button onClick={onRemove} className="mr-1 rounded-full p-1 hover:bg-brand/10" aria-label={`Remove ${label} filter`}>
        <X size={12} />
      </button>
    </span>
  );
}
