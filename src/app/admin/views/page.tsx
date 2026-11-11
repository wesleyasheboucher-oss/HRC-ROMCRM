"use client";

import { Lock, Pencil, Plus } from "lucide-react";
import { useCallback, useState } from "react";
import { FilterEditor } from "@/components/filters/FilterEditor";
import { Badge, Button, cx } from "@/components/ui";
import { FIELDS_BY_KEY, userDisplayName } from "@/lib/fields";
import { ALL_OWNERS, matchesFilter, ME_TOKEN, OPERATOR_LABELS, operatorNeedsValue, STANDARD_VIEWS } from "@/lib/filters";
import { useStore } from "@/lib/store";
import type { Condition, SavedFilter } from "@/lib/types";

/** F-03: admins create views and push them to users or teams without logging in as them. */
export default function AdminViewsPage() {
  const { filters, assignments, setViewAssignment, users, teams, usersById, currentUser, patients } = useStore();
  const [editing, setEditing] = useState<SavedFilter | "new" | null>(null);

  const preview = useCallback(
    (draft: Pick<SavedFilter, "all" | "any">) => patients.filter((p) => matchesFilter(p, draft, { usersById, meId: ALL_OWNERS })),
    [patients, usersById],
  );

  if (currentUser.role !== "admin") {
    return <p className="p-8 text-sm text-muted">Standard views are managed by admins.</p>;
  }

  const shared = filters.filter((f) => f.visibility === "shared");
  const coordinators = users.filter((u) => u.role === "coordinator");

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="mb-5 flex items-start">
          <div>
            <h1 className="text-xl font-semibold">Standard views</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Views assigned here appear as tabs for every selected person or team, right after the four built-in views. Conditions on
              &ldquo;Owner is board owner (me)&rdquo; scope each view to the coordinator using it.
            </p>
          </div>
          <Button variant="primary" className="ml-auto" onClick={() => setEditing("new")}>
            <Plus size={14} /> New view
          </Button>
        </div>

        <h2 className="mb-2 text-sm font-semibold text-muted">Built-in · every coordinator, fixed order</h2>
        <div className="mb-8 grid grid-cols-4 gap-3">
          {STANDARD_VIEWS.map((f, i) => (
            <div key={f.id} className="rounded-lg border border-border bg-surface p-3">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-brand-soft text-[11px] text-brand-ink">{i + 1}</span>
                {f.name}
                <Lock size={12} className="ml-auto text-muted" />
              </p>
              <Conditions list={f.all} />
            </div>
          ))}
        </div>

        <h2 className="mb-2 text-sm font-semibold text-muted">Shared views · assign to people or teams</h2>
        <div className="space-y-3">
          {shared.map((f) => {
            const a = assignments.find((x) => x.filterId === f.id) ?? { filterId: f.id, userIds: [], teamIds: [] };
            const toggle = (kind: "userIds" | "teamIds", id: string) =>
              setViewAssignment({ ...a, [kind]: a[kind].includes(id) ? a[kind].filter((x) => x !== id) : [...a[kind], id] });
            return (
              <div key={f.id} className="rounded-lg border border-border bg-surface p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-semibold">
                      {f.name}
                      <span className="text-xs font-normal text-muted">by {f.createdById ? userDisplayName(usersById[f.createdById]) : "System"}</span>
                    </p>
                    <Conditions list={f.all} any={f.any} />
                  </div>
                  <Button size="sm" onClick={() => setEditing(f)}>
                    <Pencil size={12} /> Edit
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
                  <span className="mr-1 text-xs font-medium text-muted">Assigned to</span>
                  {teams.map((t) => (
                    <Chip key={t.id} on={a.teamIds.includes(t.id)} onClick={() => toggle("teamIds", t.id)}>
                      {t.name}
                    </Chip>
                  ))}
                  <span className="mx-1 h-4 w-px bg-border" />
                  {coordinators.map((u) => (
                    <Chip key={u.id} on={a.userIds.includes(u.id)} onClick={() => toggle("userIds", u.id)}>
                      {userDisplayName(u)}
                    </Chip>
                  ))}
                </div>
              </div>
            );
          })}
          {shared.length === 0 && <p className="text-sm text-muted">No shared views yet.</p>}
        </div>
      </div>

      {editing && (
        <FilterEditor
          initial={editing === "new" ? { id: `f_${Date.now()}`, name: "", createdById: currentUser.id, visibility: "shared", all: [{ id: "n1", field: "owner", operator: "is", value: ME_TOKEN }], any: [] } : editing}
          onClose={() => setEditing(null)}
          onSaved={() => setEditing(null)}
          preview={preview}
        />
      )}
    </div>
  );
}

function Conditions({ list, any = [] }: { list: Condition[]; any?: Condition[] }) {
  const fmt = (c: Condition) =>
    `${FIELDS_BY_KEY[c.field]?.label} ${OPERATOR_LABELS[c.operator]}${
      operatorNeedsValue(c.operator) ? ` ${c.value === ME_TOKEN ? "me" : c.value}` : ""
    }`;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {list.map((c) => (
        <Badge key={c.id}>{fmt(c)}</Badge>
      ))}
      {any.length > 0 && <span className="text-xs text-muted">and any of:</span>}
      {any.map((c) => (
        <Badge key={c.id}>{fmt(c)}</Badge>
      ))}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
        on ? "border-brand bg-brand text-white" : "border-border text-charcoal hover:border-brand",
      )}
    >
      {children}
    </button>
  );
}
