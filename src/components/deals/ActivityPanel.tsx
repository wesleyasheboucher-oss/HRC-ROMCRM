"use client";

import { CalendarClock, Check, Circle, Mail, MessageSquare, Phone, StickyNote, Trash2, type LucideIcon } from "lucide-react";
import { Fragment, useRef, useState } from "react";
import { formatDateTime, relativeDay, startOfToday, toISODate } from "@/lib/dates";
import { ATTEMPT_STAGES, callCount, userDisplayName } from "@/lib/fields";
import { useStore } from "@/lib/store";
import type { Activity, ActivityType, Patient } from "@/lib/types";
import { Button, cx } from "../ui";
import { RadialSchedule } from "./RadialSchedule";

const TYPES: Record<ActivityType, { label: string; icon: LucideIcon; placeholder: string; tint: string }> = {
  call: { label: "Call", icon: Phone, placeholder: "What happened on the call?", tint: "bg-brand-soft text-brand-ink" },
  email: { label: "Email", icon: Mail, placeholder: "Email subject or summary", tint: "bg-violet-50 text-violet-700" },
  text: { label: "Text", icon: MessageSquare, placeholder: "Text message sent or received", tint: "bg-emerald-50 text-emerald-700" },
  note: { label: "Note", icon: StickyNote, placeholder: "Add a note about this patient", tint: "bg-amber-50 text-amber-700" },
};

const CALL_OUTCOMES = ["No answer", "Left voicemail", "Connected", "Wrong number"];

/** Call, Email and Text can be combined on one activity; Note stands alone. */
const ORDER: ActivityType[] = ["call", "text", "email", "note"];
const channelsOf = (a: Activity): ActivityType[] => a.channels ?? [a.type];
const joinLabels = (ts: ActivityType[]) => ts.map((t) => TYPES[t].label).join(" + ");

let seq = 0;
const newActivityId = () => `a_${Date.now().toString(36)}_${seq++}`;

export function ActivityPanel({ patient }: { patient: Patient }) {
  const { currentUser, updatePatient, usersById } = useStore();
  const [types, setTypes] = useState<ActivityType[]>(["call"]);
  const [scheduling, setScheduling] = useState(false); // radial "when" menu open
  const scheduleBtn = useRef<HTMLButtonElement>(null);
  const [summary, setSummary] = useState("");
  const [outcome, setOutcome] = useState(CALL_OUTCOMES[0]);

  const activities = patient.activities ?? [];
  const upcoming = activities.filter((a) => a.scheduled).sort((a, b) => a.at.localeCompare(b.at));
  const me = userDisplayName(currentUser);
  const todayISO = toISODate(startOfToday());

  /** Logging a call bumps the calls-made tracker and advances Call Stage while it's still an attempt counter. */
  const callPatch = (): Partial<Patient> => {
    const calls = callCount(patient) + 1;
    const advance = ATTEMPT_STAGES.includes(patient.callStage) && calls < ATTEMPT_STAGES.length;
    return { callAttempts: calls, ...(advance ? { callStage: ATTEMPT_STAGES[calls] } : {}) };
  };

  const hasCall = types.includes("call");
  const label = joinLabels(types);

  const toggle = (t: ActivityType) =>
    setTypes((cur) => {
      if (t === "note") return ["note"];
      const base: ActivityType[] = cur.filter((x) => x !== "note");
      const next: ActivityType[] = base.includes(t) ? base.filter((x) => x !== t) : [...base, t];
      return next.length ? ORDER.filter((x) => next.includes(x)) : cur; // keep at least one ticked
    });

  /** Complete: log it as done now. */
  const logNow = () => {
    const text = summary.trim();
    const a: Activity = {
      id: newActivityId(),
      type: types[0],
      channels: types,
      by: me,
      summary: text || (hasCall ? outcome : `${label} logged`),
      outcome: hasCall ? outcome : undefined,
      at: new Date().toISOString(),
      scheduled: false,
    };
    updatePatient(patient.id, { activities: [a, ...activities], ...(hasCall ? callPatch() : {}) });
    setSummary("");
  };

  /** Schedule: set it for the date and time picked in the radial menu. */
  const scheduleFor = (isoDate: string, time: string) => {
    const text = summary.trim();
    const a: Activity = {
      id: newActivityId(),
      type: types[0],
      channels: types,
      by: me,
      summary: text || `${label} ${patient.firstName}`,
      at: new Date(`${isoDate}T${time}`).toISOString(),
      assigneeId: patient.ownerId ?? currentUser.id,
      scheduled: true,
    };
    const when = `${relativeDay(isoDate)} ${new Date(a.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
    updatePatient(patient.id, { activities: [a, ...activities] }, `${label} scheduled: ${a.summary} (${when})`);
    setSummary("");
  };

  const complete = (a: Activity) =>
    updatePatient(patient.id, {
      activities: activities.map((x) => (x.id === a.id ? { ...x, scheduled: false, at: new Date().toISOString(), by: me } : x)),
      ...(channelsOf(a).includes("call") ? callPatch() : {}),
    });

  const completeLegacyTask = () =>
    updatePatient(patient.id, { nextTask: { ...patient.nextTask!, done: true } }, `Task completed: ${patient.nextTask!.title}`);

  /** Delete a scheduled (not yet done) activity. Kept in history so there's a record it was planned. */
  const remove = (a: Activity) =>
    updatePatient(
      patient.id,
      { activities: activities.filter((x) => x.id !== a.id) },
      `${joinLabels(channelsOf(a))} deleted: ${a.summary} (was ${relativeDay(toISODate(new Date(a.at)))})`,
    );

  const removeLegacyTask = () =>
    updatePatient(patient.id, { nextTask: null }, `Task deleted: ${patient.nextTask!.title}`);

  // One feed: logged activities + record history (field changes, owner changes, intake), newest first.
  const feed = [
    ...activities.filter((a) => !a.scheduled).map((a) => ({ kind: "activity" as const, at: a.at, a })),
    ...patient.history.map((h) => ({ kind: "history" as const, at: h.at, h })),
  ].sort((x, y) => y.at.localeCompare(x.at));

  const legacyTask = patient.nextTask && !patient.nextTask.done ? patient.nextTask : null;
  const placeholder = types.length > 1 ? "What happened, or what's it for? (one entry covers every channel ticked)" : TYPES[types[0]].placeholder;

  return (
    <div className="space-y-6">
      {/* Composer */}
      <section className="rounded-lg border border-border bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2">
          {ORDER.map((t) => {
            const { label: tLabel, icon: Icon } = TYPES[t];
            const on = types.includes(t);
            return (
              <Fragment key={t}>
                {t === "note" && <span className="mx-1 h-5 w-px bg-border" />}
                <button
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(t)}
                  title={t === "note" ? "Note (on its own)" : "Tick one or more of Call, Text, Email"}
                  className={cx(
                    "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-medium transition-colors",
                    on ? "border-brand bg-brand-soft text-brand-ink" : "border-border text-muted hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  <span
                    className={cx(
                      "flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border",
                      on ? "border-brand bg-brand text-white" : "border-slate-300 bg-surface",
                    )}
                  >
                    {on && <Check size={10} strokeWidth={3.5} />}
                  </span>
                  <Icon size={14} /> {tLabel}
                </button>
              </Fragment>
            );
          })}
        </div>

        <div className="space-y-3 p-3">
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                logNow();
              }
            }}
            rows={2}
            placeholder={placeholder}
            className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/20"
          />

          {hasCall && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs text-muted">Call outcome</span>
              {CALL_OUTCOMES.map((o) => (
                <button
                  key={o}
                  onClick={() => setOutcome(o)}
                  className={cx(
                    "rounded-full border px-2.5 py-0.5 text-xs",
                    outcome === o ? "border-brand bg-brand-soft text-brand-ink" : "border-border text-muted hover:bg-surface-2",
                  )}
                >
                  {o}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <span className="mr-1 text-[11px] text-muted">⌘ + Enter to complete</span>
            <button
              ref={scheduleBtn}
              onClick={() => setScheduling(true)}
              aria-expanded={scheduling}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-payer-commercial bg-payer-commercial px-3 text-sm font-medium text-white transition-colors hover:brightness-95"
            >
              <CalendarClock size={14} /> Schedule
            </button>
            <Button variant="primary" onClick={logNow}>
              <Check size={14} /> Complete
            </Button>
          </div>

          {scheduling && scheduleBtn.current && (
            <RadialSchedule
              anchor={scheduleBtn.current}
              title={`Schedule ${label.toLowerCase()}`}
              onPick={scheduleFor}
              onClose={() => setScheduling(false)}
            />
          )}
        </div>
      </section>

      {/* Upcoming (scheduled) — D-12 next task lives here */}
      <section>
        <h3 className="mb-2 text-sm font-semibold">Upcoming</h3>
        {upcoming.length === 0 && !legacyTask ? (
          <p className="text-sm text-muted">Nothing scheduled.</p>
        ) : (
          <ul className="space-y-2">
            {legacyTask && (
              <UpcomingRow
                types={["call"]}
                title={legacyTask.title}
                when={relativeDay(legacyTask.due)}
                overdue={legacyTask.due < todayISO}
                who={userDisplayName(usersById[legacyTask.assigneeId])}
                onComplete={completeLegacyTask}
                onDelete={removeLegacyTask}
              />
            )}
            {upcoming.map((a) => (
              <UpcomingRow
                key={a.id}
                types={channelsOf(a)}
                title={a.summary}
                when={`${relativeDay(toISODate(new Date(a.at)))} · ${new Date(a.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`}
                overdue={new Date(a.at) < new Date()}
                who={userDisplayName(usersById[a.assigneeId ?? ""])}
                onComplete={() => complete(a)}
                onDelete={() => remove(a)}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Activity feed (D-13 history merged in) */}
      <section>
        <h3 className="mb-3 text-sm font-semibold">Activity</h3>
        <ol className="space-y-4">
          {feed.map((item) => {
            if (item.kind === "activity") {
              const { a } = item;
              const chans = channelsOf(a);
              return (
                <li key={a.id} className="flex gap-3">
                  <ChannelIcons types={chans} size={28} />
                  <div className="min-w-0 pt-0.5">
                    <p className="text-sm">
                      <span className="font-medium">{joinLabels(chans)}</span>
                      {a.outcome && <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">{a.outcome}</span>}
                    </p>
                    {a.summary && a.summary !== a.outcome && <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink/90">{a.summary}</p>}
                    <p className="mt-0.5 text-xs text-muted">
                      {formatDateTime(a.at)} · {a.by}
                    </p>
                  </div>
                </li>
              );
            }
            const { h } = item;
            return (
              <li key={h.id} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center">
                  <span className="h-2 w-2 rounded-full bg-border" />
                </span>
                <div className="min-w-0 pt-0.5">
                  <p className="text-sm text-muted">{h.text}</p>
                  <p className="text-xs text-muted">
                    {formatDateTime(h.at)} · {h.by}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

/** One tinted circle per channel, overlapped like an avatar stack. */
function ChannelIcons({ types, size }: { types: ActivityType[]; size: 24 | 28 }) {
  return (
    <span className="flex shrink-0" title={joinLabels(types)}>
      {types.map((t, i) => {
        const { icon: Icon, tint } = TYPES[t];
        return (
          <span
            key={t}
            className={cx("flex items-center justify-center rounded-full ring-2 ring-surface", tint, i > 0 && "-ml-2")}
            style={{ width: size, height: size }}
          >
            <Icon size={size === 28 ? 14 : 12} />
          </span>
        );
      })}
    </span>
  );
}

function UpcomingRow({
  types,
  title,
  when,
  overdue,
  who,
  onComplete,
  onDelete,
}: {
  types: ActivityType[];
  title: string;
  when: string;
  overdue: boolean;
  who: string;
  onComplete: () => void;
  onDelete: () => void;
}) {
  // Two-step delete: the bin turns into a red "Delete" button; moving away cancels
  const [confirming, setConfirming] = useState(false);
  return (
    <li className="group flex items-center gap-3 rounded-md border border-border px-3 py-2" onMouseLeave={() => setConfirming(false)}>
      <button title="Mark done" className="text-muted hover:text-payer-commercial" onClick={onComplete}>
        <Circle size={18} />
      </button>
      <ChannelIcons types={types} size={24} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="text-xs text-muted">
          <span className={cx(overdue && "font-medium text-payer-medicare")}>{when}</span> · {who}
        </p>
      </div>
      {confirming ? (
        <button
          onClick={onDelete}
          onBlur={() => setConfirming(false)}
          autoFocus
          className="radial-center-text inline-flex h-7 items-center gap-1 rounded-md bg-payer-medicare px-2.5 text-xs font-medium text-white hover:brightness-95"
        >
          <Trash2 size={13} /> Delete
        </button>
      ) : (
        <button
          title="Delete"
          aria-label={`Delete ${title}`}
          onClick={() => setConfirming(true)}
          className="rounded p-1.5 text-muted opacity-0 transition-opacity hover:bg-surface-2 hover:text-payer-medicare focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Trash2 size={15} />
        </button>
      )}
    </li>
  );
}
