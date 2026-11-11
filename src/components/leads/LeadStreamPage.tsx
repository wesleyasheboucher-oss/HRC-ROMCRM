"use client";

import { Check, ChevronDown, Plus, ShieldOff, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ConditionRow } from "@/components/filters/ConditionRow";
import { Badge, Button, Input, Modal, Select, cx } from "@/components/ui";
import { hrcLine, LOGISTICS_ORDER, PAYER_TYPES } from "@/lib/assignment";
import { formatDate, formatDateTime, startOfToday, toISODate } from "@/lib/dates";
import { estimateTotal, FIELDS_BY_KEY, logisticsType, PAYER_META, payerType, userDisplayName } from "@/lib/fields";
import { cond, OPERATOR_LABELS } from "@/lib/filters";
import { HRC_STATUS, LINE_LABELS, statusText } from "@/lib/orderStatus";
import { daysOut } from "@/lib/stages";
import { canViewAllCoordinators, useStore } from "@/lib/store";
import type { AssignmentLogEntry, AssignmentRule, Condition, Line, OrderTypes, PayerType } from "@/lib/types";

/**
 * Lead Stream for one line (Ortho or Cardiac). Each line has its own page and its own rules: who's active,
 * their weight, daily lead cap and the order types they take. Orders are assigned when they enter
 * Patient Sales · Ready for Conversion with no owner.
 */
export function LeadStreamPage({ line }: { line: Line }) {
  const { rules, usersById, users, updateRule, assignedToday, simulateLeads, reassignOrder, assignmentLog, currentUser, setCurrentUser } = useStore();
  const [editingExclusions, setEditingExclusions] = useState<AssignmentRule | null>(null);
  const lineName = LINE_LABELS[line];
  const counts = assignedToday[line];

  if (!canViewAllCoordinators(currentUser)) {
    const manager = users.find((u) => u.role === "manager");
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="text-lg font-semibold">Lead Stream · {lineName}</h1>
        <p className="mt-2 text-sm text-muted">
          Only managers and admins can change how new orders are shared out. You&apos;re viewing the demo as {userDisplayName(currentUser)}, an HRC.
        </p>
        {manager && (
          <button onClick={() => setCurrentUser(manager.id)} className="mt-5 inline-flex h-9 items-center rounded-md bg-brand px-4 text-sm font-medium text-white hover:brightness-95">
            View as {userDisplayName(manager)} (manager)
          </button>
        )}
      </div>
    );
  }

  // An HRC works one line, so this page lists (and reassigns to) only this line's HRCs
  const hrcs = users.filter((u) => u.role === "coordinator" && hrcLine(u) === line);
  const lineRules = rules
    .filter((r) => r.line === line && usersById[r.userId] && hrcLine(usersById[r.userId]) === line)
    .sort((a, b) => Number(b.active) - Number(a.active) || usersById[a.userId].lastName.localeCompare(usersById[b.userId].lastName));
  const activeWeight = lineRules.filter((r) => r.active).reduce((s, r) => s + r.weight, 0);
  const lineLog = assignmentLog.filter((e) => (e.line ?? "ortho") === line);

  // A-06: who gets the overflow for each payer type right now (first eligible by last name)
  const overflowFor = (t: PayerType) => {
    const first = lineRules
      .filter((r) => r.active && r.orderTypes.payer.includes(t))
      .map((r) => usersById[r.userId])
      .sort((a, b) => a.lastName.localeCompare(b.lastName))[0];
    return first ? userDisplayName(first) : "Unassigned";
  };

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="mb-5 flex items-start gap-4">
          <div>
            <h1 className="text-xl font-semibold">Lead Stream · {lineName}</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              {lineName} orders get an HRC when they enter <span className="font-medium text-ink">{statusText(HRC_STATUS.prime, HRC_STATUS.sub)}</span> with no owner. Each
              goes to the eligible HRC furthest below their weighted share today; HRCs at their daily lead cap are skipped. These rules apply to {lineName} orders only.
            </p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2 rounded-lg border border-border bg-surface p-2">
            <span className="px-1 text-xs font-medium text-muted">Simulate intake</span>
            {[1, 10, 25].map((n) => (
              <Button key={n} size="sm" variant={n === 10 ? "primary" : "secondary"} onClick={() => simulateLeads(n, line)}>
                <Zap size={12} /> {n} {n === 1 ? "order" : "orders"}
              </Button>
            ))}
          </div>
        </div>

        <IncomingOrders line={line} log={lineLog} hrcs={hrcs} onReassign={reassignOrder} />

        <h2 className="mb-2 mt-8 text-base font-semibold">{lineName} HRCs</h2>
        <div className="overflow-visible rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2/70 text-left text-xs font-semibold text-muted">
              <tr>
                <th className="px-4 py-2.5">HRC</th>
                <th className="px-3 py-2.5">Active</th>
                <th className="px-3 py-2.5">Weight</th>
                <th className="px-3 py-2.5">Daily lead cap</th>
                <th className="px-3 py-2.5">Order types</th>
                <th className="px-3 py-2.5">Exclusions</th>
              </tr>
            </thead>
            <tbody>
              {lineRules.map((r) => {
                const u = usersById[r.userId];
                const today = counts[r.userId] ?? 0;
                const share = r.active && activeWeight ? Math.round((r.weight / activeWeight) * 100) : 0;
                const set = (patch: Partial<AssignmentRule>) => updateRule(r.userId, line, patch);
                const atCap = r.active && today >= r.dailyMax;
                return (
                  <tr key={r.userId} className={cx("border-t border-border align-top", !r.active && "bg-surface-2/40")}>
                    <td className={cx("px-4 py-3", !r.active && "opacity-50")}>
                      <p className="font-medium text-ink">{userDisplayName(u)}</p>
                      <p className="text-xs text-muted">{u.email}</p>
                    </td>
                    <td className="px-3 py-3">
                      <Toggle checked={r.active} onChange={(v) => set({ active: v })} label={`${userDisplayName(u)} active on ${lineName}`} />
                    </td>
                    <td className={cx("px-3 py-3", !r.active && "opacity-50")}>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          value={r.weight}
                          onChange={(e) => set({ weight: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
                          className="w-16 text-right"
                          aria-label="Weight"
                        />
                        <span className="whitespace-nowrap text-xs text-muted">{r.active ? `Weight ${r.weight} · ${share}% of leads` : "Off"}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-28 overflow-hidden rounded bg-surface-2">
                        <div className="h-full bg-brand" style={{ width: `${share}%` }} />
                      </div>
                    </td>
                    <td className={cx("px-3 py-3", !r.active && "opacity-50")}>
                      <Input
                        type="number"
                        min={0}
                        value={r.dailyMax}
                        onChange={(e) => set({ dailyMax: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                        className="w-16 text-right"
                        aria-label="Daily lead cap"
                      />
                      <p className={cx("mt-1 text-xs tabular-nums", atCap ? "font-semibold text-payer-medicare" : "text-muted")}>
                        {today} of {r.dailyMax} today{atCap && " · at cap"}
                      </p>
                    </td>
                    <td className={cx("px-3 py-3", !r.active && "opacity-50")}>
                      <OrderTypesCell value={r.orderTypes} onChange={(orderTypes) => set({ orderTypes })} />
                    </td>
                    <td className={cx("px-3 py-3", !r.active && "opacity-50")}>
                      <button onClick={() => setEditingExclusions(r)} className="text-left text-xs hover:underline">
                        {r.exclusions.length === 0 ? (
                          <span className="text-brand-ink">+ Add</span>
                        ) : (
                          r.exclusions.map((c) => (
                            <span key={c.id} className="mb-0.5 flex items-center gap-1 text-ink">
                              <ShieldOff size={11} className="text-payer-medicare" />
                              {FIELDS_BY_KEY[c.field]?.label ?? c.field} {OPERATOR_LABELS[c.operator]} {c.value}
                            </span>
                          ))
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-border bg-surface-2/40 px-4 py-2.5 text-xs text-muted">
            <span>
              Total weight of active HRCs: <span className="font-semibold text-ink">{activeWeight}</span>
            </span>
            <span className="ml-auto">
              Overflow when everyone eligible is at their cap → first by last name:{" "}
              {PAYER_TYPES.slice(0, 3).map((t, i) => (
                <span key={t}>
                  {i > 0 && " · "}
                  {PAYER_META[t].label}: <span className="font-medium text-ink">{overflowFor(t)}</span>
                </span>
              ))}
            </span>
          </div>
        </div>

        <p className="mt-3 text-xs text-muted">
          Payer type comes from the order&apos;s coverage (WIP State + MCR YES/NO), the same rule as the board colours. VA is checked on top of that: a VA order only goes to
          HRCs who take VA <em>and</em> its payer type. Exclusions keep an HRC from receiving any order that matches one of their conditions. An order that comes back to{" "}
          {HRC_STATUS.prime} with an owner keeps that HRC.
        </p>

        <h2 className="mb-2 mt-8 text-base font-semibold">Assignment log</h2>
        <AssignmentLog log={lineLog} />
      </div>

      {editingExclusions && (
        <ExclusionsModal
          rule={editingExclusions}
          onClose={() => setEditingExclusions(null)}
          onSave={(exclusions) => {
            updateRule(editingExclusions.userId, line, { exclusions });
            setEditingExclusions(null);
          }}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Incoming orders: today's arrivals at Patient Sales · Ready for Conversion
   --------------------------------------------------------------------------- */

function IncomingOrders({
  line,
  log,
  hrcs,
  onReassign,
}: {
  line: Line;
  log: AssignmentLogEntry[];
  hrcs: { id: string; firstName: string; lastName: string }[];
  onReassign: (patientId: string, userId: string | null) => void;
}) {
  const { patients, usersById } = useStore();
  const today = useMemo(() => startOfToday(), []);
  const todayIso = toISODate(today);
  const byId = useMemo(() => Object.fromEntries(patients.map((p) => [p.id, p])), [patients]);
  // Newest arrival per order today (a reassignment isn't an arrival)
  const arrivals = useMemo(() => {
    const seen = new Set<string>();
    return log.filter((e) => {
      if ((e.kind ?? "auto") === "reassign" || toISODate(new Date(e.at)) !== todayIso || seen.has(e.patientId) || !byId[e.patientId]) return false;
      seen.add(e.patientId);
      return true;
    });
  }, [log, todayIso, byId]);

  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="text-base font-semibold">Incoming orders</h2>
        <span className="text-xs text-muted">
          {LINE_LABELS[line]} orders that entered {statusText(HRC_STATUS.prime, HRC_STATUS.sub)} today, newest first · {arrivals.length}
        </span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        {arrivals.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">
            No {LINE_LABELS[line].toLowerCase()} orders have arrived today. Use <span className="font-medium text-ink">Simulate intake</span>, or move an order to{" "}
            {statusText(HRC_STATUS.prime, HRC_STATUS.sub)}.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-2/70 text-left text-xs font-semibold text-muted">
              <tr>
                <th className="px-4 py-2">Arrived</th>
                <th className="px-3 py-2">Patient</th>
                <th className="px-3 py-2">iOMS order</th>
                <th className="px-3 py-2">Line</th>
                <th className="px-3 py-2">Payer</th>
                <th className="px-3 py-2">Logistics</th>
                <th className="px-3 py-2">Surgery</th>
                <th className="px-3 py-2 text-right">Estimate</th>
                <th className="px-3 py-2">HRC</th>
              </tr>
            </thead>
            <tbody>
              {arrivals.map((e) => {
                const p = byId[e.patientId];
                const type = payerType(p);
                const d = daysOut(p.surgeryDate, today);
                const est = estimateTotal(p);
                return (
                  <tr key={e.id} className="border-t border-border align-top">
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-muted">{new Date(e.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</td>
                    <td className="px-3 py-2 font-medium">
                      {p.firstName} {p.lastName}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{p.iomsOrderId}</td>
                    <td className="px-3 py-2">{LINE_LABELS[line]}</td>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1.5">
                        <Badge className={cx("text-white", PAYER_META[type].bar)}>{PAYER_META[type].short ?? PAYER_META[type].label}</Badge>
                        {p.va === "YES" && <Badge>VA</Badge>}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">{p.insuranceName}</span>
                    </td>
                    <td className="px-3 py-2">{logisticsType(p)}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {formatDate(p.surgeryDate)}
                      <span className="block text-xs text-muted">{d < 0 ? `${-d} days ago` : d === 0 ? "Today" : `${d} days out`}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{est === null ? "–" : est.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}</td>
                    <td className="px-3 py-2">
                      <Select
                        value={p.ownerId ?? ""}
                        onChange={(ev) => onReassign(p.id, ev.target.value || null)}
                        className={cx("h-7 w-44 text-xs", !p.ownerId && "border-payer-medicare/50 text-payer-medicare")}
                        aria-label={`HRC for ${p.firstName} ${p.lastName}`}
                      >
                        <option value="">Unassigned</option>
                        {hrcs.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.firstName} {u.lastName}
                          </option>
                        ))}
                      </Select>
                      {!p.ownerId && <p className="mt-0.5 max-w-[240px] text-[11px] text-payer-medicare">{e.reason}</p>}
                      {p.ownerId && p.ownerId !== e.assignedToId && (
                        <p className="mt-0.5 text-[11px] text-muted">Reassigned (went to {userDisplayName(usersById[e.assignedToId ?? ""])})</p>
                      )}
                      {p.ownerId && e.kind === "kept" && p.ownerId === e.assignedToId && <p className="mt-0.5 text-[11px] text-muted">Kept existing HRC</p>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function AssignmentLog({ log }: { log: AssignmentLogEntry[] }) {
  const { usersById } = useStore();
  const KIND_LABEL = { auto: "Assigned", kept: "Kept", unassigned: "Unassigned", reassign: "Reassigned" } as const;
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      {log.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted">No orders assigned yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-surface-2/70 text-left text-xs font-semibold text-muted">
            <tr>
              <th className="px-4 py-2">Time</th>
              <th className="px-3 py-2">Order</th>
              <th className="px-3 py-2">Payer type</th>
              <th className="px-3 py-2">What happened</th>
              <th className="px-3 py-2">HRC</th>
              <th className="px-3 py-2">Why</th>
            </tr>
          </thead>
          <tbody>
            {log.slice(0, 100).map((e) => (
              <tr key={e.id} className="border-t border-border">
                <td className="whitespace-nowrap px-4 py-2 text-xs text-muted">{formatDateTime(e.at)}</td>
                <td className="px-3 py-2">{e.patientName}</td>
                <td className="px-3 py-2">
                  <Badge className={cx("text-white", PAYER_META[e.leadType].bar)}>{PAYER_META[e.leadType].label}</Badge>
                </td>
                <td className="px-3 py-2 text-xs">{KIND_LABEL[e.kind ?? "auto"]}</td>
                <td className="px-3 py-2 font-medium">{e.assignedToId ? userDisplayName(usersById[e.assignedToId]) : "—"}</td>
                <td className="px-3 py-2 text-xs text-muted">{e.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Order types cell: checkboxes, all on by default
   --------------------------------------------------------------------------- */

function OrderTypesCell({ value, onChange }: { value: OrderTypes; onChange: (v: OrderTypes) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const off = [
    ...PAYER_TYPES.filter((t) => !value.payer.includes(t)).map((t) => PAYER_META[t].label),
    ...(value.va ? [] : ["VA"]),
    ...LOGISTICS_ORDER.filter((t) => !value.logistics.includes(t)),
  ];
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex max-w-[220px] items-center gap-1 rounded-md border border-border px-2 py-1 text-left text-xs hover:border-slate-400"
      >
        <span className={cx("truncate", off.length ? "text-ink" : "text-muted")}>{off.length ? `Not: ${off.join(", ")}` : "All order types"}</span>
        <ChevronDown size={12} className="shrink-0 text-muted" />
      </button>
      {open && (
        <div className="absolute left-0 top-8 z-20 w-60 rounded-md border border-border bg-surface p-3 shadow-xl">
          <TypeGroup title="Payer type">
            {PAYER_TYPES.map((t) => (
              <Check2 key={t} label={PAYER_META[t].label} checked={value.payer.includes(t)} onChange={() => onChange({ ...value, payer: toggle(value.payer, t) })} />
            ))}
          </TypeGroup>
          <TypeGroup title="VA">
            <Check2 label="VA orders" checked={value.va} onChange={() => onChange({ ...value, va: !value.va })} />
          </TypeGroup>
          <TypeGroup title="Logistics type" last>
            {LOGISTICS_ORDER.map((t) => (
              <Check2 key={t} label={t} checked={value.logistics.includes(t)} onChange={() => onChange({ ...value, logistics: toggle(value.logistics, t) })} />
            ))}
          </TypeGroup>
        </div>
      )}
    </div>
  );
}

function TypeGroup({ title, children, last }: { title: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={cx(!last && "mb-2.5 border-b border-border pb-2.5")}>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</p>
      {children}
    </div>
  );
}

function Check2({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} onClick={onChange} className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-[13px] hover:bg-surface-2">
      <span aria-hidden className={cx("flex h-4 w-4 shrink-0 items-center justify-center rounded border", checked ? "border-brand bg-brand text-white" : "border-slate-300")}>
        {checked && <Check size={11} strokeWidth={3} />}
      </span>
      {label}
    </button>
  );
}

/* ---------------------------------------------------------------------------
   Exclusions + toggle
   --------------------------------------------------------------------------- */

function ExclusionsModal({ rule, onClose, onSave }: { rule: AssignmentRule; onClose: () => void; onSave: (c: Condition[]) => void }) {
  const { usersById } = useStore();
  const [list, setList] = useState(rule.exclusions);
  return (
    <Modal
      title={`Exclusions for ${userDisplayName(usersById[rule.userId])} · ${LINE_LABELS[rule.line]}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => onSave(list)}>
            Save
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted">
        This HRC won&apos;t receive any incoming {LINE_LABELS[rule.line].toLowerCase()} order that matches one of these conditions. Use it for anything the order-type checkboxes don&apos;t cover.
      </p>
      <div className="space-y-2 rounded-md bg-surface-2/60 p-3">
        {list.map((c, i) => (
          <ConditionRow
            key={c.id}
            condition={c}
            joiner={i === 0 ? "If" : "Or"}
            meLabel="This HRC"
            onChange={(nc) => setList(list.map((x) => (x.id === c.id ? nc : x)))}
            onRemove={() => setList(list.filter((x) => x.id !== c.id))}
          />
        ))}
        <button onClick={() => setList([...list, cond("state", "is", "")])} className="inline-flex items-center gap-1 text-sm font-medium text-brand-ink hover:underline">
          <Plus size={14} /> Add exclusion
        </button>
      </div>
    </Modal>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={cx("relative h-5 w-9 rounded-full transition-colors", checked ? "bg-brand" : "bg-border")}>
      <span className={cx("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", checked ? "left-[18px]" : "left-0.5")} />
    </button>
  );
}
