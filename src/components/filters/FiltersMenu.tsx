"use client";

import { Bookmark, Lock, Pencil, Pin, PinOff, Plus, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { userDisplayName } from "@/lib/fields";
import { STANDARD_VIEWS } from "@/lib/filters";
import { useStore } from "@/lib/store";
import type { SavedFilter } from "@/lib/types";
import { Button, cx } from "../ui";

/** Browse every saved view the user can see: apply, pin/unpin, edit (opens the Filters drawer), or create (F-04, F-07). */
export function FiltersMenu({
  activeId,
  pinnedIds,
  assignedIds,
  onApply,
  onTogglePin,
  onEdit,
  onNew,
}: {
  activeId: string;
  pinnedIds: string[];
  assignedIds: Set<string>;
  onApply: (id: string) => void;
  onTogglePin: (id: string) => void;
  onEdit: (f: SavedFilter) => void;
  onNew: () => void;
}) {
  const { filters, currentUser, usersById } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const mine = filters.filter((f) => f.createdById === currentUser.id && !assignedIds.has(f.id));
  const shared = filters.filter((f) => f.createdById !== currentUser.id && f.visibility === "shared" && !assignedIds.has(f.id));
  const assigned = filters.filter((f) => assignedIds.has(f.id));
  const canEdit = (f: SavedFilter) => f.createdById === currentUser.id || currentUser.role === "admin";

  const row = (f: SavedFilter, opts: { pinnable: boolean; note?: string }) => {
    const pinned = pinnedIds.includes(f.id);
    return (
      <li key={f.id} className={cx("group flex items-center gap-2 rounded px-2 py-1.5 hover:bg-surface-2", f.id === activeId && "bg-brand-soft")}>
        <button
          className="min-w-0 flex-1 truncate text-left text-sm"
          onClick={() => {
            onApply(f.id);
            setOpen(false);
          }}
        >
          {f.name}
          {opts.note && <span className="ml-2 text-xs text-muted">{opts.note}</span>}
        </button>
        {f.visibility === "private" ? <Lock size={12} className="text-muted" /> : null}
        {canEdit(f) && !f.standard && (
          <button
            className="rounded p-1 text-muted opacity-0 hover:bg-surface group-hover:opacity-100"
            title="Edit"
            onClick={() => {
              onEdit(f);
              setOpen(false);
            }}
          >
            <Pencil size={13} />
          </button>
        )}
        {opts.pinnable && (
          <button
            className={cx("rounded p-1 hover:bg-surface", pinned ? "text-brand" : "text-muted opacity-0 group-hover:opacity-100")}
            title={pinned ? "Unpin from tabs" : "Pin as tab"}
            onClick={() => onTogglePin(f.id)}
          >
            {pinned ? <PinOff size={13} /> : <Pin size={13} />}
          </button>
        )}
      </li>
    );
  };

  return (
    <div className="relative" ref={ref}>
      <Button onClick={() => setOpen((o) => !o)} className={cx(open && "border-brand")}>
        <Bookmark size={14} /> Views
      </Button>
      {open && (
        <div className="absolute right-0 top-10 z-40 w-[340px] rounded-lg border border-border bg-surface p-2 shadow-xl">
          <Group title="Standard views" hint="Everyone has these. Always pinned.">
            {STANDARD_VIEWS.map((f) => row(f, { pinnable: false }))}
          </Group>
          {assigned.length > 0 && (
            <Group title="Assigned to you" hint="Pushed by an admin. Always pinned.">
              {assigned.map((f) => row(f, { pinnable: false }))}
            </Group>
          )}
          <Group title="My views">
            {mine.length ? mine.map((f) => row(f, { pinnable: true })) : <Empty>No saved views yet</Empty>}
          </Group>
          <Group title="Shared views" icon={<Users size={11} />}>
            {shared.length ? (
              shared.map((f) => row(f, { pinnable: true, note: f.createdById ? userDisplayName(usersById[f.createdById]) : "" }))
            ) : (
              <Empty>None</Empty>
            )}
          </Group>
          <div className="border-t border-border pt-2">
            <Button
              variant="ghost"
              className="w-full justify-start text-brand-ink"
              onClick={() => {
                onNew();
                setOpen(false);
              }}
            >
              <Plus size={14} /> New view
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Group({ title, hint, icon, children }: { title: string; hint?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <p className="flex items-center gap-1 px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted" title={hint}>
        {icon}
        {title}
      </p>
      <ul>{children}</ul>
    </div>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <li className="px-2 py-1 text-xs text-muted">{children}</li>;
