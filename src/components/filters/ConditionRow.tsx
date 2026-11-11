"use client";

import { Trash2 } from "lucide-react";
import { COVERAGE_META, FIELDS_AZ, FIELDS_BY_KEY, PAYER_META, userDisplayName, type Coverage } from "@/lib/fields";
import { ME_TOKEN, OPERATOR_LABELS, operatorNeedsValue, operatorsFor } from "@/lib/filters";
import { substatusesOf } from "@/lib/orderStatus";
import { useStore } from "@/lib/store";
import type { Condition, PayerType } from "@/lib/types";
import { Input, Select, cx } from "../ui";

export function ConditionRow({
  condition,
  joiner,
  onChange,
  onRemove,
  meLabel = "Board owner (me)",
  compact,
  siblings,
}: {
  condition: Condition;
  joiner: string;
  onChange: (c: Condition) => void;
  onRemove: () => void;
  meLabel?: string;
  /** Narrow layout for the Filters drawer */
  compact?: boolean;
  /** The other conditions in the same ALL group: an "Order Status is …" there narrows the Substatus pick-list */
  siblings?: Condition[];
}) {
  const { users } = useStore();
  const field = FIELDS_BY_KEY[condition.field];
  const ops = operatorsFor(field.type);
  const prime = siblings?.find((c) => c.id !== condition.id && c.field === "primeStatus" && c.operator === "is")?.value;
  const optionsFor = (key: string) => (key === "substatus" && prime ? [...substatusesOf(prime)] : FIELDS_BY_KEY[key].options);
  const options = optionsFor(condition.field);
  // A substatus left over from another prime status stays visible (flagged) until it's changed
  const stray = condition.field === "substatus" && prime && condition.value && !options?.includes(condition.value) ? condition.value : null;

  const setField = (key: string) => {
    const f = FIELDS_BY_KEY[key];
    const op = operatorsFor(f.type).includes(condition.operator) ? condition.operator : operatorsFor(f.type)[0];
    onChange({ ...condition, field: key, operator: op, value: f.type === "user" ? ME_TOKEN : optionsFor(key)?.[0] ?? "" });
  };

  return (
    <div className="flex items-center gap-2">
      <span className={cx("shrink-0 rounded bg-surface-2 py-1 text-center text-[10px] font-semibold uppercase text-muted", compact ? "w-11" : "w-14")}>{joiner}</span>
      <Select value={condition.field} onChange={(e) => setField(e.target.value)} className={compact ? "w-32 min-w-0" : "w-48"}>
        {FIELDS_AZ.map((f) => (
          <option key={f.key} value={f.key}>
            {f.label}
          </option>
        ))}
      </Select>
      <Select
        value={condition.operator}
        onChange={(e) => onChange({ ...condition, operator: e.target.value as Condition["operator"] })}
        className={compact ? "w-28 min-w-0" : "w-36"}
      >
        {ops.map((o) => (
          <option key={o} value={o}>
            {OPERATOR_LABELS[o]}
          </option>
        ))}
      </Select>
      {operatorNeedsValue(condition.operator) &&
        (field.type === "user" ? (
          <Select value={condition.value} onChange={(e) => onChange({ ...condition, value: e.target.value })} className="flex-1">
            <option value={ME_TOKEN}>{meLabel}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {userDisplayName(u)}
              </option>
            ))}
          </Select>
        ) : options && condition.operator !== "starts_with" ? (
          <Select value={condition.value} onChange={(e) => onChange({ ...condition, value: e.target.value })} className="flex-1">
            {stray && <option value={stray}>{stray} (not in {prime})</option>}
            {options.map((o) => (
              <option key={o} value={o}>
                {field.key === "payerType"
                  ? PAYER_META[o as PayerType].label
                  : field.key === "coverage"
                    ? COVERAGE_META[o as Coverage].label
                    : o}
              </option>
            ))}
          </Select>
        ) : (
          <Input
            type={field.type === "date" ? "date" : field.type === "number" || field.type === "currency" ? "number" : "text"}
            value={condition.value}
            onChange={(e) => onChange({ ...condition, value: e.target.value })}
            placeholder="Value"
            className="min-w-0 flex-1"
          />
        ))}
      {!operatorNeedsValue(condition.operator) && <span className="flex-1" />}
      <button onClick={onRemove} className="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-payer-medicare" title="Remove condition">
        <Trash2 size={15} />
      </button>
    </div>
  );
}
