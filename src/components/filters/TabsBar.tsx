"use client";

import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { SavedFilter } from "@/lib/types";
import { cx } from "../ui";

/**
 * F-02 / F-07: view tabs above the board.
 * Standard views are fixed first; admin-assigned views follow; the user's pinned
 * filters come last and can be dragged into any order (no number prefixes needed).
 */
export function TabsBar({
  standard,
  assigned,
  pinned,
  activeId,
  onSelect,
  onReorder,
  onUnpin,
}: {
  standard: SavedFilter[];
  assigned: SavedFilter[];
  pinned: SavedFilter[];
  activeId: string;
  onSelect: (id: string) => void;
  onReorder: (ids: string[]) => void;
  onUnpin: (id: string) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  // Keep the active tab on screen when the strip scrolls (e.g. a view just saved lands at the far end)
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    strip.current?.querySelector<HTMLElement>("[data-active=true]")?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [activeId, pinned.length]);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = pinned.map((f) => f.id);
    onReorder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };

  return (
    <div ref={strip} className="flex items-center gap-1 overflow-x-auto">
      {standard.map((f) => (
        <Tab key={f.id} filter={f} active={f.id === activeId} onSelect={onSelect} />
      ))}
      {assigned.length > 0 && <span className="mx-1 h-4 w-px bg-border" />}
      {assigned.map((f) => (
        <Tab key={f.id} filter={f} active={f.id === activeId} onSelect={onSelect} tag="Team" />
      ))}
      {pinned.length > 0 && <span className="mx-1 h-4 w-px bg-border" />}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={pinned.map((f) => f.id)} strategy={horizontalListSortingStrategy}>
          {pinned.map((f) => (
            <SortableTab key={f.id} filter={f} active={f.id === activeId} onSelect={onSelect} onUnpin={onUnpin} />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}

function Tab({
  filter,
  active,
  onSelect,
  tag,
}: {
  filter: SavedFilter;
  active: boolean;
  onSelect: (id: string) => void;
  tag?: string;
}) {
  return (
    <button
      data-active={active}
      onClick={() => onSelect(filter.id)}
      className={cx(
        "flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors",
        active ? "bg-brand text-white" : "text-charcoal hover:bg-surface-2",
      )}
    >
      {filter.name}
      {tag && (
        <span className={cx("rounded px-1 text-[10px] font-semibold uppercase", active ? "bg-white/20" : "bg-brand-soft text-brand-ink")}>
          {tag}
        </span>
      )}
    </button>
  );
}

function SortableTab({
  filter,
  active,
  onSelect,
  onUnpin,
}: {
  filter: SavedFilter;
  active: boolean;
  onSelect: (id: string) => void;
  onUnpin: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: filter.id });
  return (
    <div
      ref={setNodeRef}
      data-active={active}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cx(
        "group flex h-8 shrink-0 items-center rounded-md text-sm font-medium",
        active ? "bg-brand text-white" : "text-charcoal hover:bg-surface-2",
        isDragging && "z-10 shadow-md",
      )}
    >
      <span {...attributes} {...listeners} className="cursor-grab pl-1.5 opacity-40 group-hover:opacity-80" title="Drag to reorder">
        <GripVertical size={13} />
      </span>
      <button onClick={() => onSelect(filter.id)} className="h-full pl-1 pr-1.5">
        {filter.name}
      </button>
      <button
        onClick={() => onUnpin(filter.id)}
        className="mr-1 rounded p-0.5 opacity-0 hover:bg-black/10 group-hover:opacity-70"
        title="Unpin"
      >
        <X size={12} />
      </button>
    </div>
  );
}
