"use client";

import { Info, Lock, Plus, Users } from "lucide-react";
import { useState } from "react";
import { FIELDS_BY_KEY } from "@/lib/fields";
import { cond, ME_TOKEN, newId, operatorsFor } from "@/lib/filters";
import { useStore } from "@/lib/store";
import type { Condition, Patient, SavedFilter } from "@/lib/types";
import { Button, Input, Modal, Select } from "../ui";
import { ConditionRow } from "./ConditionRow";

/** F-04..F-06: build a filter with ALL / ANY groups, name it, set visibility, preview, save. */
export function FilterEditor({
  initial,
  seedField,
  onClose,
  onSaved,
  preview,
}: {
  initial: SavedFilter | null;
  /** New filter started from a list column: its first condition is on this field */
  seedField?: string | null;
  onClose: () => void;
  onSaved: (f: SavedFilter) => void;
  /** Returns matching patients for the draft in the current board context. */
  preview: (draft: Pick<SavedFilter, "all" | "any">) => Patient[];
}) {
  const { currentUser, saveFilter, deleteFilter } = useStore();
  const [draft, setDraft] = useState<SavedFilter>(
    initial ?? {
      id: newId("f"),
      name: "",
      createdById: currentUser.id,
      visibility: "private",
      all: [seedCondition(seedField)],
      any: [],
    },
  );
  const [previewResult, setPreviewResult] = useState<Patient[] | null>(null);

  const setGroup = (group: "all" | "any", list: Condition[]) => {
    setDraft((d) => ({ ...d, [group]: list }));
    setPreviewResult(null);
  };

  const group = (key: "all" | "any", title: string, help: string) => (
    <div className="mb-5">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        {title}
        <span title={help} className="text-muted">
          <Info size={13} />
        </span>
      </h3>
      <div className="space-y-2 rounded-md bg-surface-2/60 p-3">
        {draft[key].map((c, i) => (
          <ConditionRow
            key={c.id}
            condition={c}
            joiner={i === 0 ? "Where" : key === "all" ? "And" : "Or"}
            onChange={(nc) => setGroup(key, draft[key].map((x) => (x.id === c.id ? nc : x)))}
            onRemove={() => setGroup(key, draft[key].filter((x) => x.id !== c.id))}
            siblings={key === "all" ? draft.all : undefined}
          />
        ))}
        <button
          onClick={() => setGroup(key, [...draft[key], cond("wipState", "starts_with", "")])}
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-ink hover:underline"
        >
          <Plus size={14} /> Add condition
        </button>
      </div>
    </div>
  );

  const save = () => {
    const f = { ...draft, name: draft.name.trim() || "Untitled filter" };
    saveFilter(f);
    onSaved(f);
  };

  return (
    <Modal
      title={initial ? "Edit filter" : "Create new filter"}
      onClose={onClose}
      footer={
        <>
          {initial && (
            <Button
              variant="danger"
              className="mr-auto"
              onClick={() => {
                if (confirm(`Delete "${initial.name}"?`)) {
                  deleteFilter(initial.id);
                  onClose();
                }
              }}
            >
              Delete
            </Button>
          )}
          <Button onClick={() => setPreviewResult(preview(draft))}>Preview</Button>
          <Button variant="primary" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      {group("all", "Match ALL of these conditions", "A patient must meet every condition in this group.")}
      {group("any", "And match ANY of these conditions", "If this group has conditions, a patient must also meet at least one of them.")}

      <div className="grid grid-cols-2 gap-4">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-muted">Filter name</span>
          <Input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="e.g. Not called, surgery this week"
            className="w-full"
            autoFocus
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-muted">Visibility</span>
          <Select
            value={draft.visibility}
            onChange={(e) => setDraft({ ...draft, visibility: e.target.value as SavedFilter["visibility"] })}
            className="w-full"
          >
            <option value="private">Private — only me</option>
            <option value="shared">Shared — anyone can pin it</option>
          </Select>
        </label>
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
        {draft.visibility === "private" ? <Lock size={12} /> : <Users size={12} />}
        &ldquo;Board owner (me)&rdquo; always means whoever&apos;s board the filter is applied to, so one shared filter works for every coordinator.
      </p>

      {previewResult && (
        <div className="mt-4 rounded-md border border-brand/30 bg-brand-soft/60 p-3 text-sm">
          <p className="font-medium text-brand-ink">
            {previewResult.length} matching {previewResult.length === 1 ? "patient" : "patients"} on the current board
          </p>
          {previewResult.length > 0 && (
            <p className="mt-1 text-xs text-muted">
              {previewResult
                .slice(0, 8)
                .map((p) => `${p.firstName} ${p.lastName.charAt(0)}`)
                .join(", ")}
              {previewResult.length > 8 && ` and ${previewResult.length - 8} more`}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

/** First condition of a new filter: on the seeded field when there is one, else "Owner is me". */
function seedCondition(fieldKey?: string | null) {
  const f = fieldKey ? FIELDS_BY_KEY[fieldKey] : null;
  if (!f) return cond("owner", "is", ME_TOKEN);
  return cond(f.key, operatorsFor(f.type)[0], f.type === "user" ? ME_TOKEN : (f.options?.[0] ?? ""));
}
