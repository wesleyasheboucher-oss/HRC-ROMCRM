"use client";

import { ArrowLeft, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { addDays, startOfToday, toISODate } from "@/lib/dates";
import { cx } from "../ui";

/**
 * Radial "when" picker for scheduling.
 *   Today / Tomorrow            → Morning / Afternoon → 15-minute slots
 *   Later                       → calendar → Morning / Afternoon → 15-minute slots
 * When only one half of the day has times left (today after noon), the Morning / Afternoon step is skipped.
 * The slice under the pointer's direction is highlighted (no need to land exactly on it); the centre goes back a level.
 * Keyboard: ← → to move, Enter to pick, Esc / Backspace to go back. In the calendar: arrows move by day / week,
 * Page Up / Page Down by month.
 */

const R = 160; // outer radius
const R_IN = 64; // inner (centre button) radius
const BAND_IN = R + 5; // AM / PM band around the time ring
const BAND_OUT = R + 21;
const GROUP_GAP = 4; // extra degrees between the AM and PM halves
const HIT = R + 28; // pointer beyond this distance highlights nothing; a click there closes
const PAD = 16; // keep the menu this far from the viewport edges

// Business hours for slots: 8:00 AM up to the 5:45 PM slot, split at noon into Morning and Afternoon
const DAY_START_MIN = 8 * 60;
const NOON_MIN = 12 * 60;
const DAY_END_MIN = 18 * 60;
const STEP_MIN = 15;
const HALVES = {
  AM: { label: "Morning", sub: "8 AM – 12 PM", from: DAY_START_MIN, to: NOON_MIN },
  PM: { label: "Afternoon", sub: "12 – 6 PM", from: NOON_MIN, to: DAY_END_MIN },
} as const;
type Half = keyof typeof HALVES;
const CAL_MONTHS_AHEAD = 12; // how far the "Later" calendar goes
const CAL_W = 312;

type Level =
  | { kind: "root" }
  | { kind: "half"; date: Date; title: string }
  | { kind: "hours"; date: Date; half: Half; title: string }
  | { kind: "calendar"; title: string };

interface Slice {
  key: string;
  label: string;
  /** Second line under the label (e.g. the date) */
  sub?: string;
  /** Spoken / centre description when highlighted */
  long: string;
  /** Time slices only: which half of the day, drawn as separate AM / PM arcs */
  group?: "AM" | "PM";
  disabled?: boolean;
  /** Time slices only: background tint (colour and how strongly it's mixed in, %) for the hour and half hour */
  tint?: { color: string; pct: number };
  pick: () => void;
}

/** Tint strength by minute within the hour: :00 darker, :30 lighter, :15 / :45 untinted. */
const HOUR_SHADES = [30, 0, 13, 0];
const HALF_COLOR: Record<"AM" | "PM", string> = { AM: "var(--color-amber-500, #f59e0b)", PM: "var(--brand)" };

const fmtTime = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}`;
};
const fmtTimeLong = (min: number) =>
  `${fmtTime(min)} ${min < 12 * 60 ? "AM" : "PM"}`;
const fmtDay = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const fmtWeekday = (d: Date) =>
  d.toLocaleDateString("en-US", { weekday: "short" });
const minutesNow = () => {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
};
/** Any slot left before `to` on this day? (A slot at or before now has passed.) */
const slotsLeft = (date: Date, today: Date, to: number) =>
  date.getTime() !== today.getTime() || minutesNow() < to - STEP_MIN;
const slotsLeftToday = () => minutesNow() < DAY_END_MIN - STEP_MIN;
const firstOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMonths = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth() + n, 1);
const sameDay = (a: Date, b: Date) => a.getTime() === b.getTime();
const dayLabel = (d: Date, today: Date) => {
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  return diff === 0
    ? "Today"
    : diff === 1
      ? "Tomorrow"
      : `${fmtWeekday(d)} ${fmtDay(d)}`;
};
/** Calendar days that can't be picked: past, weekends (no slots), today once the day's slots are gone, or too far out. */
const unavailable = (d: Date, today: Date) =>
  d < today ||
  d.getDay() === 0 ||
  d.getDay() === 6 ||
  (sameDay(d, today) && !slotsLeftToday()) ||
  d >= addMonths(today, CAL_MONTHS_AHEAD + 1);
/** First pickable day on or after d. */
const nextAvailable = (d: Date, today: Date) => {
  let x = d;
  for (let i = 0; i < 400 && unavailable(x, today); i++) x = addDays(x, 1);
  return x;
};

export function RadialSchedule({
  anchor,
  title,
  onPick,
  onClose,
}: {
  /** Element the menu opens over (the Schedule button) */
  anchor: HTMLElement;
  /** e.g. "Schedule call" */
  title: string;
  onPick: (isoDate: string, time: string) => void;
  onClose: () => void;
}) {
  const today = useMemo(() => startOfToday(), []);
  const [stack, setStack] = useState<Level[]>([{ kind: "root" }]);
  const [dir, setDir] = useState<"in" | "back">("in");
  const [active, setActive] = useState<number | "center" | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const level = stack[stack.length - 1];
  // "Later" calendar: focused day (keyboard), month shown, slide direction, and the day just clicked (for the pulse)
  const [calFocus, setCalFocus] = useState(() =>
    nextAvailable(addDays(startOfToday(), 2), startOfToday()) // day after tomorrow,
  );
  const [calMonth, setCalMonth] = useState(() => firstOfMonth(calFocus));
  const [calDir, setCalDir] = useState<"next" | "prev">("next");
  const [calPicked, setCalPicked] = useState<string | null>(null);

  // Centre of the menu: over the anchor, clamped so the whole ring stays on screen
  const center = useMemo(() => {
    const r = anchor.getBoundingClientRect();
    const clamp = (v: number, max: number) =>
      Math.min(Math.max(v, BAND_OUT + PAD), max - BAND_OUT - PAD);
    return {
      x: clamp(r.left + r.width / 2, window.innerWidth),
      y: clamp(r.top + r.height / 2, window.innerHeight),
    };
  }, [anchor]);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 160);
  }, [onClose]);

  const push = (l: Level) => {
    setDir("in");
    setActive(null);
    setStack((s) => [...s, l]);
  };
  const back = useCallback(() => {
    if (stack.length === 1) return close();
    setDir("back");
    setActive(null);
    setStack((s) => s.slice(0, -1));
  }, [stack.length, close]);

  const finish = (key: string, date: Date, min: number) => {
    setPicked(key);
    // Let the chosen slice pulse, then schedule and close
    setTimeout(() => {
      onPick(
        toISODate(date),
        `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`,
      );
      close();
    }, 220);
  };

  const showMonth = (m: Date) => {
    const target = firstOfMonth(m);
    const min = firstOfMonth(today);
    const max = addMonths(today, CAL_MONTHS_AHEAD);
    if (target < min || target > max || sameDay(target, calMonth)) return;
    setCalDir(target > calMonth ? "next" : "prev");
    setCalMonth(target);
  };
  const moveFocus = (d: Date) => {
    if (d < today || d >= addMonths(today, CAL_MONTHS_AHEAD + 1)) return;
    setCalFocus(d);
    showMonth(d);
  };
  /** After picking a day: Morning / Afternoon, or straight to the only half with times left. */
  const openDay = (date: Date, title: string) => {
    const open = (Object.keys(HALVES) as Half[]).filter((h) => slotsLeft(date, today, HALVES[h].to));
    if (open.length === 1) push({ kind: "hours", date, half: open[0], title: `${title} · ${HALVES[open[0]].label}` });
    else push({ kind: "half", date, title });
  };

  const pickDay = (d: Date) => {
    if (unavailable(d, today) || calPicked) return;
    setCalFocus(d);
    setCalPicked(toISODate(d));
    // Let the day pulse, then zoom into the time ring for it
    setTimeout(() => {
      setCalPicked(null);
      openDay(d, dayLabel(d, today));
    }, 200);
  };

  const slices: Slice[] = useMemo(() => {
    switch (level.kind) {
      case "root": {
        const tomorrow = addDays(today, 1);
        return [
          {
            key: "today",
            label: "Today",
            sub: fmtDay(today),
            long: slotsLeftToday() ? "Today" : "No times left today",
            disabled: !slotsLeftToday(),
            pick: () => openDay(today, "Today"),
          },
          {
            key: "tomorrow",
            label: "Tomorrow",
            sub: fmtDay(tomorrow),
            long: "Tomorrow",
            pick: () => openDay(tomorrow, "Tomorrow"),
          },
          {
            key: "later",
            label: "Later",
            sub: "Pick a date",
            long: "Later",
            pick: () => push({ kind: "calendar", title: "Later" }),
          },
        ];
      }
      case "calendar":
        return [];
      case "half":
        return (Object.keys(HALVES) as Half[]).map((h) => {
          const { label, sub, to } = HALVES[h];
          const left = slotsLeft(level.date, today, to);
          return {
            key: `${toISODate(level.date)}-${h}`,
            label,
            sub,
            long: left ? label : `No ${label.toLowerCase()} times left`,
            disabled: !left,
            pick: () => push({ kind: "hours", date: level.date, half: h, title: label }),
          };
        });
      case "hours": {
        const isToday = level.date.getTime() === today.getTime();
        const now = minutesNow();
        const out: Slice[] = [];
        const { from, to } = HALVES[level.half];
        for (let min = from; min < to; min += STEP_MIN) {
          const past = isToday && min <= now;
          const key = `${toISODate(level.date)}-${min}`;
          out.push({
            key,
            label: fmtTime(min),
            long: past ? `${fmtTimeLong(min)} has passed` : fmtTimeLong(min),
            disabled: past,
            tint: HOUR_SHADES[(min % 60) / STEP_MIN] ? { color: HALF_COLOR[level.half], pct: HOUR_SHADES[(min % 60) / STEP_MIN] } : undefined,
            pick: () => finish(key, level.date, min),
          });
        }
        return out;
      }
    }
    // push / finish are stable enough for a menu that lives a few seconds; level drives the slices
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, today]);

  const n = slices.length;
  const step = 360 / Math.max(n, 1);
  const isCal = level.kind === "calendar";

  const pickTarget = (t: number | "center" | null) => {
    if (picked) return;
    if (t === null) return close();
    if (t === "center") return back();
    if (!slices[t].disabled) slices[t].pick();
  };
  const pickActive = () => active !== null && pickTarget(active);

  // Keyboard: handled in the capture phase so the drawer's own shortcuts (↑/↓ patient, Esc close) don't fire underneath
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const move = (delta: number) => {
        let i = typeof active === "number" ? active : delta > 0 ? -1 : 0;
        for (let k = 0; k < n; k++) {
          i = (i + delta + n) % n;
          if (!slices[i].disabled) break;
        }
        setActive(i);
      };
      const calKey = () => {
        switch (e.key) {
          case "ArrowRight":
            moveFocus(addDays(calFocus, 1));
            return true;
          case "ArrowLeft":
            moveFocus(addDays(calFocus, -1));
            return true;
          case "ArrowDown":
            moveFocus(addDays(calFocus, 7));
            return true;
          case "ArrowUp":
            moveFocus(addDays(calFocus, -7));
            return true;
          case "PageDown":
            moveFocus(
              new Date(
                calFocus.getFullYear(),
                calFocus.getMonth() + 1,
                Math.min(calFocus.getDate(), 28),
              ),
            );
            return true;
          case "PageUp":
            moveFocus(
              new Date(
                calFocus.getFullYear(),
                calFocus.getMonth() - 1,
                Math.min(calFocus.getDate(), 28),
              ),
            );
            return true;
          case "Enter":
          case " ":
            pickDay(calFocus);
            return true;
          case "Escape":
          case "Backspace":
            back();
            return true;
          case "Tab":
            return true;
        }
        return false;
      };
      const handled = isCal
        ? calKey()
        : (() => {
            switch (e.key) {
              case "ArrowRight":
              case "ArrowDown":
                move(1);
                return true;
              case "ArrowLeft":
              case "ArrowUp":
                move(-1);
                return true;
              case "Enter":
              case " ":
                pickActive();
                return true;
              case "Escape":
              case "Backspace":
                back();
                return true;
              case "Tab":
                return true;
            }
            return false;
          })();
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  /** What's under the pointer: a slice by direction from the centre, the centre itself, or nothing (too far out). */
  const hitTest = (x: number, y: number): number | "center" | null => {
    const dx = x - center.x;
    const dy = y - center.y;
    const dist = Math.hypot(dx, dy);
    if (dist < R_IN) return "center";
    if (dist > HIT) return null;
    const deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90 + step / 2; // 0° = top, slice 0 centred on top
    return Math.floor((((deg % 360) + 360) % 360) / step);
  };
  const onPointerMove = (e: React.PointerEvent) =>
    !picked && setActive(hitTest(e.clientX, e.clientY));

  const highlighted = typeof active === "number" ? slices[active] : null;
  const crumbs = stack.slice(1).map((l) => (l.kind === "root" ? "" : l.title));

  return createPortal(
    <div
      data-drawer // portal: keep clicks here from closing the patient drawer underneath
      role="dialog"
      aria-modal
      aria-label={title}
      className={cx(
        "fixed inset-0 z-[60] cursor-default select-none",
        closing ? "radial-backdrop-out" : "radial-backdrop-in",
      )}
      onPointerMove={isCal ? undefined : onPointerMove}
      onPointerLeave={() => setActive(null)}
      // Hit-test the click itself rather than trusting the hover state, which may lag a fast move-and-click.
      // In the calendar, clicks inside the panel stop here; a click outside it closes.
      onClick={(e) =>
        isCal ? close() : pickTarget(hitTest(e.clientX, e.clientY))
      }
    >
      <div
        className={cx(
          "absolute",
          closing ? "radial-menu-out" : "radial-menu-in",
        )}
        style={{
          left: center.x - R,
          top: center.y - R,
          width: R * 2,
          height: R * 2,
        }}
      >
        {isCal && (
          <Calendar
            today={today}
            month={calMonth}
            slideDir={calDir}
            focus={calFocus}
            picked={calPicked}
            zoom={dir}
            onMonth={showMonth}
            onPick={pickDay}
            onBack={back}
          />
        )}
        {/* key = level depth, so each level animates in; direction decides zoom in vs out */}
        {!isCal && (
          <svg
            key={
              stack.length + level.kind + ("title" in level ? level.title : "")
            }
            viewBox={`${-R} ${-R} ${R * 2} ${R * 2}`}
            width={R * 2}
            height={R * 2}
            className={cx(
              "overflow-visible",
              dir === "in" ? "radial-level-in" : "radial-level-back",
            )}
            aria-hidden
          >
            {/* Solid backing so the gaps between slices read as dividers, not see-through to the page */}
            <circle
              r={R}
              className="radial-slice"
              style={{ fill: "var(--surface-2)" }}
            />
            {slices.map((s, i) => {
              const a0 = -90 + i * step - step / 2;
              const a1 = a0 + step;
              const mid = ((a0 + a1) / 2) * (Math.PI / 180);
              const on = active === i && !s.disabled;
              const isPicked = picked === s.key;
              const lr = (R + R_IN) / 2 + (n > 12 ? 6 : 0);
              const nudge = on || isPicked ? 6 : 0;
              // Wider gap where AM meets PM (and where the day wraps round)
              const gStart =
                s.group && slices[(i - 1 + n) % n].group !== s.group
                  ? GROUP_GAP
                  : 0;
              const gEnd =
                s.group && slices[(i + 1) % n].group !== s.group
                  ? GROUP_GAP
                  : 0;
              return (
                <g
                  key={s.key}
                  className="radial-slice"
                  style={{
                    animationDelay: `${Math.min(i * (n > 12 ? 10 : 28), 220)}ms`,
                  }}
                >
                  <g
                    style={{
                      transform: `translate(${Math.cos(mid) * nudge}px, ${Math.sin(mid) * nudge}px)`,
                      transition: "transform 180ms cubic-bezier(0.32,0.72,0,1)",
                    }}
                    className={isPicked ? "radial-picked" : undefined}
                  >
                    <path
                      d={sector(
                        R_IN + 4,
                        R,
                        a0 + gStart / 2,
                        a1 - gEnd / 2,
                        n > 12 ? 0.6 : 1.2,
                      )}
                      style={{
                        fill: s.disabled
                          ? "var(--surface-2)"
                          : on || isPicked
                            ? "var(--payer-commercial)"
                            : s.tint
                              ? `color-mix(in srgb, ${s.tint.color} ${s.tint.pct}%, var(--surface))`
                              : "var(--surface)",
                        stroke: "var(--border)",
                        strokeWidth: 1,
                        transition: "fill 160ms ease",
                      }}
                    />
                    <text
                      x={Math.cos(mid) * lr}
                      y={Math.sin(mid) * lr}
                      textAnchor="middle"
                      dominantBaseline="central"
                      style={{
                        fill: s.disabled
                          ? "var(--muted)"
                          : on || isPicked
                            ? "#fff"
                            : "var(--ink)",
                        opacity: s.disabled ? 0.5 : 1,
                        transition: "fill 160ms ease",
                        fontSize:
                          n > 12 ? (s.label.endsWith(":00") ? 11.5 : 10) : 13,
                        fontWeight:
                          n > 12 ? (s.label.endsWith(":00") ? 600 : 400) : 600,
                      }}
                    >
                      <tspan x={Math.cos(mid) * lr} dy={s.sub ? "-0.45em" : 0}>
                        {s.label}
                      </tspan>
                      {s.sub && (
                        <tspan
                          x={Math.cos(mid) * lr}
                          dy="1.25em"
                          style={{
                            fontSize: 10.5,
                            fontWeight: 400,
                            opacity: on ? 0.9 : 0.65,
                          }}
                        >
                          {s.sub}
                        </tspan>
                      )}
                    </text>
                  </g>
                </g>
              );
            })}

            {/* AM / PM bands around the outside of the time ring */}
            {(["AM", "PM"] as const).map((g) => {
              const idx = slices.flatMap((s, i) => (s.group === g ? [i] : []));
              if (!idx.length) return null;
              const a0 = -90 + idx[0] * step - step / 2 + GROUP_GAP / 2 + 0.3;
              const a1 =
                -90 +
                idx[idx.length - 1] * step +
                step / 2 -
                GROUP_GAP / 2 -
                0.3;
              const mid = (((a0 + a1) / 2) * Math.PI) / 180;
              const lr = (BAND_IN + BAND_OUT) / 2;
              const inGroup =
                typeof active === "number" && slices[active]?.group === g;
              return (
                <g
                  key={g}
                  className="radial-slice"
                  style={{ animationDelay: "120ms" }}
                >
                  <path
                    d={sector(BAND_IN, BAND_OUT, a0, a1, 0)}
                    style={{
                      fill:
                        g === "AM"
                          ? "var(--color-amber-500, #f59e0b)"
                          : "var(--brand)",
                      opacity: inGroup ? 1 : 0.8,
                      transition: "opacity 160ms ease",
                    }}
                  />
                  <text
                    x={Math.cos(mid) * lr}
                    y={Math.sin(mid) * lr}
                    textAnchor="middle"
                    dominantBaseline="central"
                    style={{
                      fill: "#fff",
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                    }}
                  >
                    {g}
                  </text>
                </g>
              );
            })}
          </svg>
        )}

        {/* Centre: where you are, what's highlighted, and back / close */}
        {!isCal && (
          <div
            className={cx(
              "absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border text-center shadow-lg transition-colors duration-150",
              active === "center"
                ? "border-brand bg-brand-soft"
                : "border-border bg-surface",
            )}
            style={{ width: R_IN * 2 - 4, height: R_IN * 2 - 4 }}
          >
            <span
              className={cx(
                "mb-0.5 transition-colors",
                active === "center" ? "text-brand-ink" : "text-muted",
              )}
            >
              {stack.length > 1 ? <ArrowLeft size={16} /> : <X size={16} />}
            </span>
            <span className="px-3 text-[11px] font-medium leading-tight text-muted">
              {crumbs.length ? crumbs.join(" · ") : title}
            </span>
            <span
              key={highlighted?.key ?? "none"}
              className="radial-center-text mt-0.5 px-2 text-[12.5px] font-semibold leading-tight text-ink"
            >
              {active === "center"
                ? stack.length > 1
                  ? "Back"
                  : "Cancel"
                : (highlighted?.long ?? "When?")}
            </span>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Annular sector path between angles a0..a1 (degrees, 0 = east), with a small angular gap on both sides. */
export function sector(
  r0: number,
  r1: number,
  a0: number,
  a1: number,
  gapDeg: number,
) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const s = rad(a0 + gapDeg / 2);
  const e = rad(a1 - gapDeg / 2);
  const large = e - s > Math.PI ? 1 : 0;
  const p = (r: number, a: number) =>
    `${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
  return `M ${p(r1, s)} A ${r1} ${r1} 0 ${large} 1 ${p(r1, e)} L ${p(r0, e)} A ${r0} ${r0} 0 ${large} 0 ${p(r0, s)} Z`;
}

/** "Later": a month calendar in place of the ring. Picking a day zooms into that day's time ring. */
function Calendar({
  today,
  month,
  slideDir,
  focus,
  picked,
  zoom,
  onMonth,
  onPick,
  onBack,
}: {
  today: Date;
  month: Date;
  slideDir: "next" | "prev";
  focus: Date;
  picked: string | null;
  zoom: "in" | "back";
  onMonth: (m: Date) => void;
  onPick: (d: Date) => void;
  onBack: () => void;
}) {
  // Monday-first grid covering the month
  const start = addDays(month, -((month.getDay() + 6) % 7));
  const weeks = Math.ceil(
    (((month.getDay() + 6) % 7) +
      new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) /
      7,
  );
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
  const canPrev = month > firstOfMonth(today);
  const canNext = month < addMonths(today, CAL_MONTHS_AHEAD);
  const quick = [
    // Monday of next week
    { label: "Next week", d: addDays(today, 7 - ((today.getDay() + 6) % 7)) },
    { label: "In 2 weeks", d: addDays(today, 14) },
    {
      label: "In 1 month",
      d: new Date(today.getFullYear(), today.getMonth() + 1, today.getDate()),
    },
  ];

  return (
    <div
      className={cx(
        // Centred with inset + auto margins (not a transform), so the zoom animation can own transform
        "absolute inset-0 m-auto h-fit rounded-2xl border border-border bg-surface p-3 shadow-xl",
        zoom === "in" ? "radial-level-in" : "radial-level-back",
      )}
      style={{ width: CAL_W }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header: back, month, prev / next */}
      <div className="mb-2 flex items-center gap-1">
        <button
          onClick={onBack}
          title="Back (Esc)"
          className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="relative h-6 flex-1 overflow-hidden text-center">
          <span
            key={month.getTime()}
            className={cx(
              "absolute inset-0 text-sm font-semibold text-ink",
              slideDir === "next" ? "cal-slide-next" : "cal-slide-prev",
            )}
          >
            {month.toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            })}
          </span>
        </div>
        <button
          onClick={() => onMonth(addMonths(month, -1))}
          disabled={!canPrev}
          title="Previous month (Page Up)"
          className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-30"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          onClick={() => onMonth(addMonths(month, 1))}
          disabled={!canNext}
          title="Next month (Page Down)"
          className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-30"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-muted">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
          <span key={d} className="py-1">
            {d}
          </span>
        ))}
      </div>

      {/* Day grid slides left / right when the month changes */}
      <div className="overflow-hidden">
        <div
          key={month.getTime()}
          className={cx(
            "grid grid-cols-7 gap-y-0.5",
            slideDir === "next" ? "cal-slide-next" : "cal-slide-prev",
          )}
        >
          {days.map((d, i) => {
            const inMonth = d.getMonth() === month.getMonth();
            const off = unavailable(d, today);
            const isToday = sameDay(d, today);
            const isFocus = sameDay(d, focus);
            const isPicked = picked === toISODate(d);
            return (
              <div key={i} className="flex justify-center">
                <button
                  disabled={off}
                  onClick={() => onPick(d)}
                  title={
                    off
                      ? undefined
                      : d.toLocaleDateString("en-US", {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                        })
                  }
                  className={cx(
                    "flex h-9 w-9 items-center justify-center rounded-full text-[13px] tabular-nums transition-[transform,background-color,color,box-shadow] duration-150",
                    !inMonth && "opacity-40",
                    off
                      ? "cursor-default text-muted/60"
                      : "text-ink hover:scale-110 hover:bg-emerald-50 hover:text-payer-commercial",
                    isToday && "font-semibold ring-1 ring-border",
                    isFocus &&
                      !off &&
                      !isPicked &&
                      "bg-brand-soft text-brand-ink ring-2 ring-brand/40",
                    isPicked &&
                      "cal-picked bg-payer-commercial font-semibold text-white",
                  )}
                >
                  {d.getDate()}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Shortcuts further out */}
      <div className="mt-2.5 flex justify-center gap-1.5 border-t border-border pt-2.5">
        {quick.map((q) => (
          <button
            key={q.label}
            onClick={() => onPick(nextAvailable(q.d, today))}
            className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-ink transition-colors hover:border-payer-commercial hover:text-payer-commercial"
          >
            {q.label}
          </button>
        ))}
      </div>
    </div>
  );
}
