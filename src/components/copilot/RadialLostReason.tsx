"use client";

import { ArrowLeft, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { LOST_REASONS, type LostReason } from "@/lib/lostReasons";
import { sector } from "../deals/RadialSchedule";
import { cx } from "../ui";

/**
 * Radial lost-reason picker, opened by LOST on the Call Co-Pilot.
 *   Reason ring (Cancelled, Ineligible, Patient Declined …) → subcategory ring → picked.
 * A reason with a single subcategory (DME, Patient Deceased) is picked straight away.
 * Same feel as the schedule wheel: the slice in the pointer's direction is highlighted, the centre goes back.
 * Keyboard: ← → to move, Enter to pick, Esc / Backspace to go back.
 */

const R = 196; // outer radius (bigger than the schedule wheel: the labels are long)
const R_IN = 74;
const HIT = R + 28;
const PAD = 16;
const LOST = "var(--payer-medicare)";

interface Slice {
  key: string;
  label: string;
  /** Second line, e.g. how many subcategories */
  sub?: string;
  pick: () => void;
}

/** Break a label into lines of about `max` characters (SVG text doesn't wrap). */
function wrap(label: string, max: number): string[] {
  const words = label.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur && (cur + " " + w).length > max) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  return lines;
}

export function RadialLostReason({
  anchor,
  onPick,
  onClose,
}: {
  /** Element the wheel opens over (the LOST button) */
  anchor: HTMLElement;
  onPick: (r: LostReason) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const [dir, setDir] = useState<"in" | "back">("in");
  const [active, setActive] = useState<number | "center" | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  const center = useMemo(() => {
    const r = anchor.getBoundingClientRect();
    const clamp = (v: number, max: number) => Math.min(Math.max(v, R + PAD), max - R - PAD);
    return { x: clamp(r.left + r.width / 2, window.innerWidth), y: clamp(r.top + r.height / 2, window.innerHeight) };
  }, [anchor]);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 160);
  }, [onClose]);

  const back = useCallback(() => {
    if (!reason) return close();
    setDir("back");
    setActive(null);
    setReason(null);
  }, [reason, close]);

  const finish = (r: LostReason) => {
    setPicked(`${r.reason}|${r.sub}`);
    // Let the slice pulse, then hand back the reason and close
    setTimeout(() => {
      onPick(r);
      close();
    }, 220);
  };

  const slices: Slice[] = reason
    ? LOST_REASONS.find((r) => r.reason === reason)!.subs.map((sub) => ({
        key: `${reason}|${sub}`,
        label: sub,
        pick: () => finish({ reason, sub }),
      }))
    : LOST_REASONS.map((r) => ({
        key: `${r.reason}|${r.subs.length === 1 ? r.subs[0] : ""}`,
        label: r.reason,
        sub: r.subs.length === 1 ? r.subs[0] : `${r.subs.length} options`,
        pick: () => {
          if (r.subs.length === 1) return finish({ reason: r.reason, sub: r.subs[0] });
          setDir("in");
          setActive(null);
          setReason(r.reason);
        },
      }));

  const n = slices.length;
  const step = 360 / n;

  const pickTarget = (t: number | "center" | null) => {
    if (picked) return;
    if (t === null) return close();
    if (t === "center") return back();
    slices[t].pick();
  };

  // Capture phase, so the drawer's own shortcuts (↑/↓ patient, Esc close) don't fire underneath
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      let handled = true;
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
          setActive((a) => (typeof a === "number" ? (a + 1) % n : 0));
          break;
        case "ArrowLeft":
        case "ArrowUp":
          setActive((a) => (typeof a === "number" ? (a - 1 + n) % n : n - 1));
          break;
        case "Enter":
        case " ":
          if (active !== null) pickTarget(active);
          break;
        case "Escape":
        case "Backspace":
          back();
          break;
        case "Tab":
          break;
        default:
          handled = false;
      }
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const hitTest = (x: number, y: number): number | "center" | null => {
    const dx = x - center.x;
    const dy = y - center.y;
    const dist = Math.hypot(dx, dy);
    if (dist < R_IN) return "center";
    if (dist > HIT) return null;
    const deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90 + step / 2;
    return Math.floor((((deg % 360) + 360) % 360) / step);
  };

  const highlighted = typeof active === "number" ? slices[active] : null;
  // Room for a label: the arc at the label radius, in characters
  const lr = (R + R_IN) / 2 + 4;
  const fontSize = reason ? 11.5 : 12.5;
  const maxChars = Math.max(9, Math.floor(((2 * Math.PI * lr) / n) / (fontSize * 0.56)) - 1);

  return createPortal(
    <div
      data-drawer // portal: keep clicks here from closing the patient drawer underneath
      role="dialog"
      aria-modal
      aria-label="Lost reason"
      className={cx("fixed inset-0 z-[60] cursor-default select-none", closing ? "radial-backdrop-out" : "radial-backdrop-in")}
      onPointerMove={(e) => !picked && setActive(hitTest(e.clientX, e.clientY))}
      onPointerLeave={() => setActive(null)}
      onClick={(e) => pickTarget(hitTest(e.clientX, e.clientY))}
    >
      <div
        className={cx("absolute", closing ? "radial-menu-out" : "radial-menu-in")}
        style={{ left: center.x - R, top: center.y - R, width: R * 2, height: R * 2 }}
      >
        {/* key = level, so each level animates in; direction decides zoom in vs out */}
        <svg
          key={reason ?? "root"}
          viewBox={`${-R} ${-R} ${R * 2} ${R * 2}`}
          width={R * 2}
          height={R * 2}
          className={cx("overflow-visible", dir === "in" ? "radial-level-in" : "radial-level-back")}
          aria-hidden
        >
          <circle r={R} className="radial-slice" style={{ fill: "var(--surface-2)" }} />
          {slices.map((s, i) => {
            const a0 = -90 + i * step - step / 2;
            const a1 = a0 + step;
            const mid = ((a0 + a1) / 2) * (Math.PI / 180);
            const on = active === i;
            const isPicked = picked === s.key;
            const nudge = on || isPicked ? 6 : 0;
            const lines = wrap(s.label, maxChars);
            const x = Math.cos(mid) * lr;
            const total = lines.length + (s.sub ? 1 : 0);
            return (
              <g key={s.key} className="radial-slice" style={{ animationDelay: `${Math.min(i * 28, 220)}ms` }}>
                <g
                  style={{
                    transform: `translate(${Math.cos(mid) * nudge}px, ${Math.sin(mid) * nudge}px)`,
                    transition: "transform 180ms cubic-bezier(0.32,0.72,0,1)",
                  }}
                  className={isPicked ? "radial-picked" : undefined}
                >
                  <path
                    d={sector(R_IN + 4, R, a0, a1, 1.2)}
                    style={{
                      fill: on || isPicked ? LOST : "var(--surface)",
                      stroke: "var(--border)",
                      strokeWidth: 1,
                      transition: "fill 160ms ease",
                    }}
                  />
                  <text
                    x={x}
                    y={Math.sin(mid) * lr}
                    textAnchor="middle"
                    dominantBaseline="central"
                    style={{ fill: on || isPicked ? "#fff" : "var(--ink)", transition: "fill 160ms ease", fontSize, fontWeight: 600 }}
                  >
                    {lines.map((l, k) => (
                      <tspan key={k} x={x} dy={k === 0 ? `${-((total - 1) * 1.15) / 2}em` : "1.15em"}>
                        {l}
                      </tspan>
                    ))}
                    {s.sub && (
                      <tspan x={x} dy="1.3em" style={{ fontSize: 10.5, fontWeight: 400, opacity: on ? 0.9 : 0.65 }}>
                        {s.sub.length > maxChars + 4 ? `${s.sub.slice(0, maxChars + 2)}…` : s.sub}
                      </tspan>
                    )}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>

        {/* Centre: where you are, what's highlighted, and back / cancel */}
        <div
          className={cx(
            "absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border text-center shadow-lg transition-colors duration-150",
            active === "center" ? "border-payer-medicare bg-red-50" : "border-border bg-surface",
          )}
          style={{ width: R_IN * 2 - 4, height: R_IN * 2 - 4 }}
        >
          <span className={cx("mb-0.5", active === "center" ? "text-payer-medicare" : "text-muted")}>
            {reason ? <ArrowLeft size={16} /> : <X size={16} />}
          </span>
          <span className="px-3 text-[11px] font-medium leading-tight text-muted">{reason ?? "Lost reason"}</span>
          <span key={highlighted?.key ?? "none"} className="radial-center-text mt-0.5 px-3 text-[12px] font-semibold leading-tight text-ink">
            {active === "center" ? (reason ? "Back" : "Cancel") : (highlighted?.label ?? "Why was it lost?")}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
