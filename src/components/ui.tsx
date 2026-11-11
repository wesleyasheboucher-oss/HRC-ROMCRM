"use client";

import { Check, X } from "lucide-react";
import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type InputHTMLAttributes } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-ink border border-brand",
  secondary: "bg-surface text-ink border border-border hover:bg-surface-2",
  ghost: "text-ink hover:bg-surface-2 border border-transparent",
  danger: "bg-surface text-payer-medicare border border-border hover:bg-red-50",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-7 px-2 text-xs" : "h-8 px-3 text-sm",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx(
        "h-8 rounded-md border border-border bg-surface px-2 text-sm text-ink focus:border-brand focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        "h-8 rounded-md border border-border bg-surface px-2 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  width = "max-w-3xl",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-6 pt-[8vh]" onMouseDown={onClose}>
      <div
        className={cx("flex max-h-[84vh] w-full flex-col rounded-lg bg-surface shadow-xl", width)}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-surface-2" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium", className ?? "bg-surface-2 text-muted")}>
      {children}
    </span>
  );
}

/**
 * Panel that slides in from the right edge of its positioned parent.
 * Stays mounted while sliding out, then calls `onExited` so the caller can unmount it.
 */
export function SlideOver({
  open,
  onExited,
  className,
  children,
}: {
  open: boolean;
  onExited: () => void;
  className?: string;
  children: ReactNode;
}) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    // Paint once off-screen, then slide in.
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  return (
    <div
      className={cx(
        "transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
        entered ? "translate-x-0" : "translate-x-full",
        className,
      )}
      onTransitionEnd={(e) => e.target === e.currentTarget && !open && onExited()}
    >
      {children}
    </div>
  );
}

/** Marks UI that stands in for a BRD open question. */
export function OpenQuestion({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <span className="font-semibold">BRD open question · </span>
      {children}
    </div>
  );
}

/** On/off switch with its label: the friendlier stand-in for a checkbox. */
export function Switch({
  checked,
  onChange,
  label,
  hint,
  size = "md",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  hint?: string;
  size?: "sm" | "md";
}) {
  const sm = size === "sm";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      title={hint}
      className={cx(
        "group flex items-center gap-2 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        sm ? "text-[11px] text-muted" : "min-h-8 w-full text-[13px] text-ink",
      )}
    >
      <span
        className={cx(
          "relative inline-flex shrink-0 items-center rounded-full transition-colors",
          sm ? "h-3.5 w-6" : "h-5 w-9",
          checked ? "bg-brand" : "bg-slate-300 group-hover:bg-slate-400",
        )}
      >
        <span
          className={cx(
            "absolute rounded-full bg-white shadow-sm transition-transform",
            sm ? "left-0.5 h-2.5 w-2.5" : "left-0.5 h-4 w-4",
            checked && (sm ? "translate-x-2.5" : "translate-x-4"),
          )}
        />
      </span>
      <span className={cx(checked && !sm && "font-medium")}>{label}</span>
    </button>
  );
}

export interface ChoiceOption<T extends string | number> {
  value: T;
  label: ReactNode;
  /** Small second line, e.g. "manager approval". */
  hint?: ReactNode;
}

/**
 * Pick-one tiles: the friendlier stand-in for radio buttons. `layout="row"` lays them out as a
 * segmented bar (short labels like percentages); "stack" gives full-width tiles with room for a hint.
 */
export function ChoiceGroup<T extends string | number>({
  options,
  value,
  onChange,
  label,
  layout = "stack",
}: {
  options: ChoiceOption<T>[];
  value: T | null;
  onChange: (v: T) => void;
  label: string;
  layout?: "stack" | "row";
}) {
  const row = layout === "row";
  return (
    <div role="radiogroup" aria-label={label} className={row ? "flex rounded-md border border-border bg-surface-2 p-0.5" : "grid gap-1.5"}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx(
              "transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand",
              row
                ? cx("h-7 flex-1 rounded px-2 text-xs font-medium tabular-nums", on ? "bg-surface text-brand-ink shadow-sm" : "text-muted hover:text-ink")
                : cx(
                    "flex min-h-9 items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-[13px]",
                    on ? "border-brand bg-brand-soft font-medium text-brand-ink" : "border-border bg-surface text-ink hover:border-slate-400",
                  ),
            )}
          >
            {row ? (
              o.label
            ) : (
              <>
                <span className="min-w-0 flex-1">
                  {o.label}
                  {o.hint && <span className="block text-[11px] font-normal text-muted">{o.hint}</span>}
                </span>
                <span
                  aria-hidden
                  className={cx(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                    on ? "border-brand bg-brand text-white" : "border-slate-300",
                  )}
                >
                  {on && <Check size={11} strokeWidth={3} />}
                </span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** − n + stepper for small whole numbers. */
export function Stepper({ value, min, max, onChange, format, label }: { value: number; min: number; max: number; onChange: (v: number) => void; format: (v: number) => string; label: string }) {
  const btn = "flex h-7 w-7 items-center justify-center rounded text-base text-ink hover:bg-surface-2 disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <div role="group" aria-label={label} className="inline-flex items-center rounded-md border border-border bg-surface">
      <button type="button" className={btn} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Fewer ${label.toLowerCase()}`}>
        −
      </button>
      <span className="min-w-[5.5rem] text-center text-xs font-medium tabular-nums" aria-live="polite">
        {format(value)}
      </span>
      <button type="button" className={btn} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`More ${label.toLowerCase()}`}>
        +
      </button>
    </div>
  );
}
