"use client";

import { ArrowDown, ArrowUp, Search, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { FIELDS_AZ, FIELDS_BY_KEY } from "@/lib/fields";
import { Button, Input, Modal } from "../ui";

/**
 * Pick and order fields from the whole registry: one A–Z list, no grouping.
 * Used for board card fields (D-15) and list view columns.
 */
export function FieldsPickerModal({
  title,
  description,
  chosenLabel,
  initial,
  defaults,
  preview,
  onClose,
  onSave,
}: {
  title: string;
  description: string;
  /** Heading over the chosen list, e.g. "On my cards" */
  chosenLabel: string;
  initial: string[];
  defaults: string[];
  /** Optional live preview of the current choice */
  preview?: (fields: string[]) => ReactNode;
  onClose: () => void;
  onSave: (fields: string[]) => void;
}) {
  const [fields, setFields] = useState(initial.filter((k) => FIELDS_BY_KEY[k]));
  const [q, setQ] = useState("");
  const move = (i: number, d: -1 | 1) => {
    const next = [...fields];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setFields(next);
  };
  const toggle = (key: string) => setFields((f) => (f.includes(key) ? f.filter((k) => k !== key) : [...f, key]));
  const needle = q.trim().toLowerCase();

  return (
    <Modal
      title={title}
      onClose={onClose}
      width="max-w-4xl"
      footer={
        <>
          <Button variant="ghost" className="mr-auto" onClick={() => setFields(defaults)}>
            Restore defaults
          </Button>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => onSave(fields)}>
            Save
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-muted">{description}</p>
      <div className={preview ? "grid grid-cols-[1fr_1fr_240px] gap-6" : "grid grid-cols-2 gap-6"}>
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Available fields</h3>
          <div className="relative mb-2">
            <Search size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search fields" className="w-full pl-7" autoFocus />
          </div>
          <div className="scroll-thin max-h-[48vh] overflow-y-auto pr-2">
            {FIELDS_AZ.filter((f) => !needle || f.label.toLowerCase().includes(needle)).map((f) => (
              <label key={f.key} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-surface-2">
                <input type="checkbox" checked={fields.includes(f.key)} onChange={() => toggle(f.key)} className="accent-[var(--brand)]" />
                {f.label}
              </label>
            ))}
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            {chosenLabel} ({fields.length})
          </h3>
          <ol className="scroll-thin max-h-[52vh] space-y-1 overflow-y-auto pr-1">
            {fields.map((key, i) => (
              <li key={key} className="flex items-center gap-1 rounded border border-border px-2 py-1 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {FIELDS_BY_KEY[key]?.label ?? key}
                </span>
                <button disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-0.5 text-muted hover:bg-surface-2 disabled:opacity-30">
                  <ArrowUp size={13} />
                </button>
                <button
                  disabled={i === fields.length - 1}
                  onClick={() => move(i, 1)}
                  className="rounded p-0.5 text-muted hover:bg-surface-2 disabled:opacity-30"
                >
                  <ArrowDown size={13} />
                </button>
                <button onClick={() => toggle(key)} className="rounded p-0.5 text-muted hover:bg-surface-2">
                  <X size={13} />
                </button>
              </li>
            ))}
          </ol>
        </div>
        {preview && (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Preview</h3>
            {preview(fields)}
          </div>
        )}
      </div>
    </Modal>
  );
}
