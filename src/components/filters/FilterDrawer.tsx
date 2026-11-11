"use client";

import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CALL_STAGES, CLASSIFICATIONS, DEAL_STATUS_LABELS, DEAL_STATUSES, FIELDS_BY_KEY, LENGTHS_OF_NEED, PLAN_TAG_META, PLAN_TAGS, SALES_STATUSES, userDisplayName, WIP_STATES } from "@/lib/fields";
import { cond, ME_TOKEN, operatorsFor } from "@/lib/filters";
import {
  cleanQuick,
  COVERAGE_CHOICE_LABELS,
  DATE_PRESET_LABELS,
  type CountRule,
  type CoverageChoice,
  type DatePreset,
  type DateRange,
  type QuickFilters,
  type QuickKey,
  type YesNo,
} from "@/lib/quickFilters";
import { STAGES } from "@/lib/stages";
import type { Condition, SavedFilter, User } from "@/lib/types";
import { ConditionRow } from "./ConditionRow";
import { Button, Input, Select, cx } from "../ui";

/** What the drawer edits: quick filters plus advanced conditions (the board-owner scope is kept out of sight by the page). */
export interface FilterDraft {
  quick: QuickFilters;
  all: Condition[];
  any: Condition[];
}

const COVERAGE_CHOICES: CoverageChoice[] = ["covered", "partial", "selfpay", "unverified"];

/**
 * Filters drawer: every section can be turned on on its own, in any combination.
 * The count on the main button updates live; nothing changes on the board until it's pressed.
 */
export function FilterDrawer({
  initial,
  scope,
  focus,
  seedField,
  baseView,
  canUpdateBase,
  showOwners,
  coordinators,
  insuranceOptions,
  stateOptions,
  count,
  countNoun = ["patient", "patients"],
  onApply,
  onSaveAs,
  onUpdateBase,
  onDeleteBase,
  onClose,
}: {
  initial: FilterDraft;
  /** The view's hidden scope conditions (board owner, HRC status) */
  scope?: Condition[];
  /** Section to scroll to and highlight on open (from a chip or a list column) */
  focus?: QuickKey | null;
  /** Field with no drawer section: start with an advanced condition on it */
  seedField?: string | null;
  baseView: SavedFilter;
  canUpdateBase: boolean;
  showOwners: boolean;
  coordinators: User[];
  insuranceOptions: string[];
  stateOptions: string[];
  /** Patients the draft would show */
  count: (d: FilterDraft) => number;
  /** What the count is of, singular and plural (the main button reads "Show 12 patients") */
  countNoun?: [string, string];
  onApply: (d: FilterDraft) => void;
  onSaveAs: (d: FilterDraft, name: string, visibility: SavedFilter["visibility"]) => void;
  onUpdateBase: (d: FilterDraft) => void;
  onDeleteBase: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<FilterDraft>(() => {
    if (!seedField) return initial;
    const f = FIELDS_BY_KEY[seedField];
    if (!f) return initial;
    const c = cond(f.key, operatorsFor(f.type)[0], f.type === "user" ? ME_TOKEN : (f.options?.[0] ?? ""));
    return { ...initial, all: [...initial.all, c] };
  });
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<SavedFilter["visibility"]>("private");
  const q = draft.quick;
  const set = <K extends QuickKey>(k: K, v: QuickFilters[K] | undefined) => setDraft((d) => ({ ...d, quick: cleanQuick({ ...d.quick, [k]: v }) }));
  const n = useMemo(() => count(draft), [count, draft]);

  // Esc closes (capture, so the patient drawer's own Esc doesn't also fire)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  // Scroll to the section that was asked for, and flash it
  const body = useRef<HTMLDivElement>(null);
  const [flash, setFlash] = useState<string | null>(focus ?? (seedField ? "advanced" : null));
  useEffect(() => {
    const id = focus ?? (seedField ? "advanced" : null);
    if (!id) return;
    body.current?.querySelector(`[data-section="${id}"]`)?.scrollIntoView({ block: "center" });
    const t = setTimeout(() => setFlash(null), 1400);
    return () => clearTimeout(t);
  }, [focus, seedField]);

  const sectionProps = (key: string) => ({ sectionKey: key, flash: flash === key });
  const empty = Object.keys(q).length === 0 && draft.all.length === 0 && draft.any.length === 0;

  return (
    <div data-drawer className="flex h-full w-[min(520px,100vw)] flex-col border-l border-border bg-surface shadow-2xl" role="dialog" aria-label="Filters">
      <div className="flex items-start justify-between gap-4 border-b border-border px-6 pb-4 pt-6">
        <div>
          <h2 className="text-xl font-semibold">Filters</h2>
          <p className="mt-1 text-sm text-muted">Turn on any or all. Save the combination as a view.</p>
        </div>
        <button onClick={onClose} className="rounded-md border border-border p-2 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Close filters">
          <X size={16} />
        </button>
      </div>

      <div ref={body} className="scroll-thin flex-1 overflow-y-auto px-6">
        <Section title="Status" {...sectionProps("dealStatus")}>
          <Chips options={DEAL_STATUSES.map((s) => ({ value: s, label: DEAL_STATUS_LABELS[s] }))} value={q.dealStatus} onChange={(v) => set("dealStatus", v)} />
        </Section>

        <Section title="Stage" hint="Days until surgery, as on the board" {...sectionProps("stage")}>
          <Chips options={STAGES.map((s) => ({ value: s.id, label: s.label }))} value={q.stage} onChange={(v) => set("stage", v)} />
        </Section>

        <Section title="Plan" {...sectionProps("plan")}>
          <Chips options={PLAN_TAGS.map((t) => ({ value: t, label: PLAN_TAG_META[t].title }))} value={q.plan} onChange={(v) => set("plan", v)} />
        </Section>

        <Section title="Coverage" {...sectionProps("coverage")}>
          <Chips options={COVERAGE_CHOICES.map((c) => ({ value: c, label: COVERAGE_CHOICE_LABELS[c] }))} value={q.coverage} onChange={(v) => set("coverage", v)} />
        </Section>

        <Section title="WIP state" {...sectionProps("wipState")}>
          <Chips options={WIP_STATES.map((s) => ({ value: s, label: s }))} value={q.wipState} onChange={(v) => set("wipState", v)} />
        </Section>

        <div className="grid grid-cols-2 gap-x-4 border-b border-border">
          <Section title="Call stage" inRow {...sectionProps("callStage")}>
            <MultiSelect placeholder="Select call stages…" options={CALL_STAGES} value={q.callStage} onChange={(v) => set("callStage", v)} />
          </Section>
          <Section title="Sales status" inRow {...sectionProps("salesStatus")}>
            <MultiSelect placeholder="Select sales statuses…" options={SALES_STATUSES} value={q.salesStatus} onChange={(v) => set("salesStatus", v)} />
          </Section>
        </div>

        <div className="grid grid-cols-2 gap-x-4 border-b border-border">
          <Section title="Insurance" inRow {...sectionProps("insurance")}>
            <MultiSelect placeholder="Select insurance…" options={insuranceOptions} value={q.insurance} onChange={(v) => set("insurance", v)} searchable />
          </Section>
          <Section title="State" inRow {...sectionProps("state")}>
            <MultiSelect placeholder="Select states…" options={stateOptions} value={q.state} onChange={(v) => set("state", v)} searchable />
          </Section>
        </div>

        <div className="grid grid-cols-2 gap-x-4 border-b border-border">
          <Section title="Classification" inRow {...sectionProps("classification")}>
            <Chips options={CLASSIFICATIONS.map((c) => ({ value: c, label: c }))} value={q.classification} onChange={(v) => set("classification", v)} />
          </Section>
          <Section title="Length of need" inRow {...sectionProps("lengthOfNeed")}>
            <Chips options={LENGTHS_OF_NEED.map((d) => ({ value: d, label: `${d} days` }))} value={q.lengthOfNeed} onChange={(v) => set("lengthOfNeed", v)} />
          </Section>
        </div>

        {showOwners && (
          <Section title="Coordinator" {...sectionProps("owners")}>
            <People coordinators={coordinators} value={q.owners} onChange={(v) => set("owners", v)} />
          </Section>
        )}

        <Section title="Surgery date" {...sectionProps("surgery")}>
          <DateFilter presets={["past", "today", "next7", "next30", "custom"]} value={q.surgery} onChange={(v) => set("surgery", v)} />
        </Section>

        <Section title="Expected close date" {...sectionProps("expectedClose")}>
          <DateFilter presets={["past", "today", "next7", "next30", "custom"]} value={q.expectedClose} onChange={(v) => set("expectedClose", v)} />
        </Section>

        <Section title="Created" {...sectionProps("created")}>
          <DateFilter presets={["today", "last7", "last30", "custom"]} value={q.created} onChange={(v) => set("created", v)} />
        </Section>

        <Section title="Calls made" {...sectionProps("calls")}>
          <CountFilter value={q.calls} onChange={(v) => set("calls", v)} unit="calls" />
        </Section>

        <div className="grid grid-cols-2 gap-x-4 border-b border-border">
          <Section title="Financial estimate" inRow {...sectionProps("estimate")}>
            <div className="flex items-center gap-2">
              <Select
                value={q.estimate?.op ?? "gte"}
                onChange={(e) => q.estimate && set("estimate", { ...q.estimate, op: e.target.value as "gte" | "lte" })}
                className="w-32"
                aria-label="Estimate comparison"
              >
                <option value="gte">at or above</option>
                <option value="lte">at or below</option>
              </Select>
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
                <Input
                  type="number"
                  min={0}
                  value={q.estimate?.amount ?? ""}
                  onChange={(e) =>
                    set("estimate", e.target.value === "" ? undefined : { op: q.estimate?.op ?? "gte", amount: Math.max(0, Number(e.target.value)) })
                  }
                  placeholder="Any"
                  className="w-full pl-5"
                  aria-label="Estimate amount"
                />
              </div>
            </div>
          </Section>
          <Section title="Age" inRow {...sectionProps("age")}>
            <div className="flex items-center gap-2">
              <NumberBox value={q.age?.min} onChange={(min) => set("age", { ...q.age, min })} placeholder="Min" label="Minimum age" />
              <span className="text-sm text-muted">to</span>
              <NumberBox value={q.age?.max} onChange={(max) => set("age", { ...q.age, max })} placeholder="Max" label="Maximum age" />
            </div>
          </Section>
        </div>

        <div className="grid grid-cols-2 gap-x-4 border-b border-border">
          <Section title="Medicare (MCR)" inRow {...sectionProps("mcr")}>
            <AnyYesNo value={q.mcr} onChange={(v) => set("mcr", v)} label="Medicare" />
          </Section>
          <Section title="VA" inRow {...sectionProps("va")}>
            <AnyYesNo value={q.va} onChange={(v) => set("va", v)} label="VA" />
          </Section>
        </div>

        <Section title="Advanced conditions" hint="Any field, including the record tabs" {...sectionProps("advanced")} last>
          <Conditions label="Match all of these" joiner="And" list={draft.all} scope={scope} onChange={(all) => setDraft((d) => ({ ...d, all }))} />
          {draft.any.length > 0 ? (
            <div className="mt-3">
              <Conditions label="And at least one of these" joiner="Or" list={draft.any} onChange={(any) => setDraft((d) => ({ ...d, any }))} />
            </div>
          ) : (
            <button
              onClick={() => setDraft((d) => ({ ...d, any: [cond("insuranceName", "contains", "")] }))}
              className="mt-2 text-xs font-medium text-muted hover:text-brand-ink hover:underline"
            >
              + Add an &ldquo;at least one of&rdquo; group
            </button>
          )}
        </Section>
      </div>

      {/* Save as view */}
      {saving && (
        <div className="space-y-2 border-t border-border bg-surface-2/60 px-6 py-3">
          <div className="flex gap-2">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && name.trim() && onSaveAs(draft, name.trim(), visibility)}
              placeholder="View name, e.g. Medicare, surgery this week"
              className="min-w-0 flex-1"
              aria-label="View name"
            />
            <Select value={visibility} onChange={(e) => setVisibility(e.target.value as SavedFilter["visibility"])} className="w-36" aria-label="Who can see it">
              <option value="private">Only me</option>
              <option value="shared">Shared</option>
            </Select>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSaving(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" disabled={!name.trim()} onClick={() => onSaveAs(draft, name.trim(), visibility)}>
              Save view
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-border px-6 py-4">
        <button
          onClick={() => setDraft({ quick: {}, all: [], any: [] })}
          disabled={empty}
          className="mr-auto text-sm font-medium text-brand-ink hover:underline disabled:text-muted disabled:no-underline"
        >
          Clear all
        </button>
        {canUpdateBase && (
          <>
            <button
              onClick={() => confirm(`Delete the view "${baseView.name}"?`) && onDeleteBase()}
              className="text-sm text-muted hover:text-payer-medicare hover:underline"
            >
              Delete view
            </button>
            <Button onClick={() => onUpdateBase(draft)} title={`Save these filters to "${baseView.name}"`}>
              Update view
            </Button>
          </>
        )}
        {!saving && <Button onClick={() => setSaving(true)}>Save as view</Button>}
        <Button variant="primary" onClick={() => onApply(draft)} className="min-w-[150px]">
          Show {n} {n === 1 ? countNoun[0] : countNoun[1]}
        </Button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Pieces
   --------------------------------------------------------------------------- */

function Section({
  title,
  hint,
  children,
  sectionKey,
  flash,
  last,
  inRow,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  sectionKey: string;
  flash: boolean;
  last?: boolean;
  /** One of two side by side: the row draws the divider */
  inRow?: boolean;
}) {
  return (
    <section
      data-section={sectionKey}
      className={cx("-mx-2 rounded-lg px-2 py-4 transition-colors duration-700", !last && !inRow && "border-b border-border", flash && "bg-brand-soft")}
    >
      <h3 className="mb-2.5 text-sm font-semibold text-ink">
        {title}
        {hint && <span className="ml-2 text-xs font-normal text-muted">{hint}</span>}
      </h3>
      {children}
    </section>
  );
}

/** Toggle chips: pick any number; none picked = section off. */
function Chips<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value?: T[]; onChange: (v: T[]) => void }) {
  const picked = value ?? [];
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = picked.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? picked.filter((x) => x !== o.value) : [...picked, o.value])}
            className={cx(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors",
              on ? "border-brand bg-brand-soft font-medium text-brand-ink" : "border-border bg-surface text-ink hover:border-slate-400",
            )}
          >
            {on && <Check size={13} strokeWidth={2.5} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Segmented control, the selected option filled. */
function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex overflow-hidden rounded-md border border-border">
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx("h-8 px-3.5 text-[13px] transition-colors", i > 0 && "border-l border-border", on ? "bg-brand font-medium text-white" : "bg-surface text-ink hover:bg-surface-2")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function AnyYesNo({ value, onChange, label }: { value?: YesNo; onChange: (v: YesNo | undefined) => void; label: string }) {
  return (
    <Segmented
      label={label}
      value={value ?? "any"}
      onChange={(v) => onChange(v === "any" ? undefined : (v as YesNo))}
      options={[
        { value: "any", label: "Any" },
        { value: "YES", label: "Yes" },
        { value: "NO", label: "No" },
      ]}
    />
  );
}

/** Dropdown with checkboxes; optional search for long lists. */
function MultiSelect({ options, value, onChange, placeholder, searchable }: { options: string[]; value?: string[]; onChange: (v: string[]) => void; placeholder: string; searchable?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const picked = value ?? [];
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);
  const shown = options.filter((o) => !query || o.toLowerCase().includes(query.toLowerCase()));
  const toggle = (o: string) => onChange(picked.includes(o) ? picked.filter((x) => x !== o) : [...picked, o]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cx(
          "flex h-9 w-full items-center gap-2 rounded-md border bg-surface px-3 text-left text-[13px] transition-colors",
          open ? "border-brand" : "border-border hover:border-slate-400",
        )}
      >
        <span className={cx("min-w-0 flex-1 truncate", picked.length ? "font-medium text-brand-ink" : "text-muted")}>
          {picked.length === 0 ? placeholder : picked.length === 1 ? picked[0] : `${picked.length} selected`}
        </span>
        {picked.length > 0 && (
          <span
            role="button"
            aria-label="Clear"
            onClick={(e) => {
              e.stopPropagation();
              onChange([]);
            }}
            className="rounded p-0.5 text-muted hover:bg-surface-2 hover:text-ink"
          >
            <X size={13} />
          </span>
        )}
        <ChevronDown size={14} className="shrink-0 text-muted" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-10 z-10 rounded-md border border-border bg-surface p-1 shadow-xl">
          {searchable && (
            <div className="relative mb-1">
              <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
              <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="w-full pl-7" />
            </div>
          )}
          <ul className="scroll-thin max-h-56 overflow-y-auto">
            {shown.map((o) => {
              const on = picked.includes(o);
              return (
                <li key={o}>
                  <button type="button" onClick={() => toggle(o)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-surface-2">
                    <span
                      aria-hidden
                      className={cx("flex h-4 w-4 shrink-0 items-center justify-center rounded border", on ? "border-brand bg-brand text-white" : "border-slate-300")}
                    >
                      {on && <Check size={11} strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{o}</span>
                  </button>
                </li>
              );
            })}
            {shown.length === 0 && <li className="px-2 py-1.5 text-xs text-muted">No matches</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Picked coordinators as removable pills, an "Unassigned" chip, and a picker to add more. */
function People({ coordinators, value, onChange }: { coordinators: User[]; value?: string[]; onChange: (v: string[]) => void }) {
  const picked = value ?? [];
  const people = picked.filter((id) => id !== "");
  const unassigned = picked.includes("");
  const rest = coordinators.filter((u) => !picked.includes(u.id));
  return (
    <div className="flex flex-wrap items-center gap-2">
      {people.map((id) => (
        <span key={id} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-brand-soft pl-3 pr-1.5 text-[13px] font-medium text-brand-ink">
          {userDisplayName(coordinators.find((u) => u.id === id))}
          <button onClick={() => onChange(picked.filter((x) => x !== id))} className="rounded-full p-0.5 hover:bg-brand/10" aria-label="Remove">
            <X size={12} />
          </button>
        </span>
      ))}
      <Chips options={[{ value: "", label: "Unassigned" }]} value={unassigned ? [""] : []} onChange={(v) => onChange(v.length ? [...picked, ""] : picked.filter((x) => x !== ""))} />
      {rest.length > 0 && (
        <div className="relative">
          <Select
            value=""
            onChange={(e) => e.target.value && onChange([...picked, e.target.value])}
            className="h-8 appearance-none rounded-full pl-7 pr-3 text-[13px]"
            aria-label="Add coordinator"
          >
            <option value="">Add coordinator</option>
            {rest.map((u) => (
              <option key={u.id} value={u.id}>
                {userDisplayName(u)}
              </option>
            ))}
          </Select>
          <Plus size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
        </div>
      )}
    </div>
  );
}

function DateFilter({ presets, value, onChange }: { presets: DatePreset[]; value?: DateRange; onChange: (v: DateRange | undefined) => void }) {
  return (
    <div className="space-y-2.5">
      <Chips
        options={presets.map((p) => ({ value: p, label: DATE_PRESET_LABELS[p] }))}
        value={value ? [value.preset] : []}
        // Single choice: picking another preset replaces the current one; picking it again turns it off
        onChange={(v) => {
          const next = v.find((p) => p !== value?.preset);
          onChange(next ? { preset: next } : undefined);
        }}
      />
      {value?.preset === "custom" && (
        <div className="flex items-center gap-2">
          <Input type="date" value={value.from ?? ""} onChange={(e) => onChange({ ...value, from: e.target.value || undefined })} className="w-40" aria-label="From" />
          <span className="text-sm text-muted">to</span>
          <Input type="date" value={value.to ?? ""} onChange={(e) => onChange({ ...value, to: e.target.value || undefined })} className="w-40" aria-label="To" />
        </div>
      )}
    </div>
  );
}

function CountFilter({ value, onChange, unit }: { value?: CountRule; onChange: (v: CountRule | undefined) => void; unit: string }) {
  return (
    <div className="flex items-center gap-2">
      <Select value={value?.op ?? "gte"} onChange={(e) => value && onChange({ ...value, op: e.target.value as CountRule["op"] })} className="w-32" aria-label="Comparison">
        <option value="gte">at least</option>
        <option value="lte">at most</option>
        <option value="eq">exactly</option>
      </Select>
      <NumberBox value={value?.n} onChange={(n) => onChange(n === undefined ? undefined : { op: value?.op ?? "gte", n })} placeholder="Any" label="Number" />
      <span className="text-sm text-muted">{unit}</span>
    </div>
  );
}

function NumberBox({ value, onChange, placeholder, label }: { value?: number; onChange: (v: number | undefined) => void; placeholder: string; label: string }) {
  return (
    <Input
      type="number"
      min={0}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? undefined : Math.max(0, Math.floor(Number(e.target.value))))}
      placeholder={placeholder}
      className="w-20"
      aria-label={label}
    />
  );
}

function Conditions({
  label,
  joiner,
  list,
  onChange,
  scope = [],
}: {
  label: string;
  joiner: string;
  list: Condition[];
  onChange: (l: Condition[]) => void;
  /** Hidden view scope (e.g. Order Status is Patient Sales) that also narrows pick-lists */
  scope?: Condition[];
}) {
  // Only an ALL group narrows the Substatus list by its Order Status; in an "at least one of" group the rows are alternatives
  const narrowBy = joiner === "And" ? [...scope, ...list] : undefined;
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted">{label}</p>
      <div className="space-y-2">
        {list.map((c, i) => (
          <ConditionRow
            key={c.id}
            condition={c}
            joiner={i === 0 ? "Where" : joiner}
            onChange={(nc) => onChange(list.map((x) => (x.id === c.id ? nc : x)))}
            onRemove={() => onChange(list.filter((x) => x.id !== c.id))}
            siblings={narrowBy}
            compact
          />
        ))}
        <button onClick={() => onChange([...list, cond("insuranceName", "contains", "")])} className="inline-flex items-center gap-1 text-sm font-medium text-brand-ink hover:underline">
          <Plus size={14} /> Add condition
        </button>
      </div>
    </div>
  );
}
