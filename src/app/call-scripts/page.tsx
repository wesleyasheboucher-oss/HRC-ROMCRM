"use client";

import { ChevronDown, Check, History, Lock, Pencil, RotateCcw, Save, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { RebuttalBody, ScriptBlock } from "@/components/copilot/CopilotPanel";
import { Badge, Button, Input, Select, cx } from "@/components/ui";
import { calculate, DEFAULT_OPTIONS, type CallOptions } from "@/lib/copilot/calculator";
import {
  GROUP_LABELS,
  LIBRARY,
  LIBRARY_BY_ID,
  TOKEN_DOCS,
  diffLines,
  scriptVersions,
  toParagraphs,
  type EditsState,
  type LibraryEntry,
  type ScriptVersion,
  type ScriptGroup,
  type ScriptText,
} from "@/lib/copilot/library";
import { renderScript, scriptContext, tokenValues, fill, type Segment } from "@/lib/copilot/render";
import { useScriptEdits } from "@/lib/copilot/scriptStore";
import { formatDateTime } from "@/lib/dates";
import { userDisplayName } from "@/lib/fields";
import { canViewAllCoordinators, useStore } from "@/lib/store";
import type { Patient } from "@/lib/types";

const GROUPS: ScriptGroup[] = ["opening", "outcome", "delivery", "rebuttal"];

/** Call-time switches tried when looking for a patient that would get a given outcome script. */
const PREVIEW_VARIANTS: { opts: CallOptions; note?: string }[] = [
  { opts: DEFAULT_OPTIONS },
  { opts: { ...DEFAULT_OPTIONS, gapException: true }, note: "with Gap exception on" },
  { opts: { ...DEFAULT_OPTIONS, medicaid: true }, note: "with Medicaid secondary on" },
  { opts: { ...DEFAULT_OPTIONS, hip: true }, note: "with Hip procedure on" },
];

interface PreviewCase {
  patient: Patient;
  opts: CallOptions;
  /** Whether this patient (with `note` switches) would actually get the script being edited. */
  match: boolean;
  note?: string;
}

/**
 * Call Scripts: edit the wording the Call Co-Pilot reads out. Port of Base44's Script Management page.
 * Edits are saved on top of the original wording (library.ts), so every script can be restored.
 * Which script a patient gets is decided in code (scenario.ts) and is shown here read-only.
 */
export default function CallScriptsPage() {
  const { currentUser, patients, users, setCurrentUser } = useStore();
  const { state, script, save, restore, label } = useScriptEdits();
  const canEdit = canViewAllCoordinators(currentUser);

  const [selectedId, setSelectedId] = useState("intro");
  const [query, setQuery] = useState("");
  const entry = LIBRARY_BY_ID[selectedId];
  const saved = script(selectedId);

  // Draft follows the saved version until the user starts typing
  const [draft, setDraft] = useState<ScriptText>({ title: saved.title, content: saved.content });
  const dirty = draft.title !== saved.title || draft.content !== saved.content;
  const savedKey = `${selectedId}|${saved.title}|${saved.content}`;
  const lastSavedKey = useRef(savedKey);
  useEffect(() => {
    if (lastSavedKey.current === savedKey) return;
    lastSavedKey.current = savedKey;
    setDraft({ title: saved.title, content: saved.content });
  }, [savedKey, saved.title, saved.content]);

  const select = (id: string) => {
    if (id === selectedId) return;
    if (dirty && !window.confirm("You have unsaved changes to this script. Discard them?")) return;
    setSelectedId(id);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return LIBRARY;
    return LIBRARY.filter((e) => {
      const s = script(e.id);
      return s.title.toLowerCase().includes(q) || s.content.toLowerCase().includes(q) || e.usedWhen.toLowerCase().includes(q);
    });
  }, [query, script]);

  const editedCount = Object.keys(state.edits).length;
  const versions = useMemo(() => scriptVersions(state, selectedId), [state, selectedId]);
  const manager = users.find((u) => u.role === "manager");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-start gap-4 border-b border-border bg-surface px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold">Call scripts</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            The wording reps see in the Call Co-Pilot tab. Saving updates every patient straight away. Which script a patient gets is
            set by their coverage, so it isn&apos;t edited here.
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Badge>
            {editedCount} of {LIBRARY.length} edited
          </Badge>
        </div>
      </div>

      {!canEdit && (
        <div className="flex shrink-0 items-center gap-3 border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-900">
          <Lock size={14} />
          <span>Read only. Managers and admins can edit scripts; you&apos;re viewing the demo as {userDisplayName(currentUser)}.</span>
          {manager && (
            <button onClick={() => setCurrentUser(manager.id)} className="ml-auto font-medium underline-offset-2 hover:underline">
              View as {userDisplayName(manager)} (manager)
            </button>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Script list */}
        <aside className="scroll-thin flex w-72 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface">
          <div className="sticky top-0 z-10 border-b border-border bg-surface p-3">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search scripts" className="w-full pl-7" aria-label="Search scripts" />
            </div>
          </div>
          {GROUPS.map((g) => {
            const items = filtered.filter((e) => e.group === g);
            if (!items.length) return null;
            return (
              <div key={g} className="py-2">
                <p className="px-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{GROUP_LABELS[g]}</p>
                {items.map((e) => {
                  const s = script(e.id);
                  const active = e.id === selectedId;
                  return (
                    <button
                      key={e.id}
                      onClick={() => select(e.id)}
                      className={cx(
                        "flex w-full items-start gap-2 px-4 py-1.5 text-left text-[13px] leading-snug",
                        active ? "bg-brand-soft font-medium text-brand-ink" : "text-ink hover:bg-surface-2",
                      )}
                    >
                      <span className="flex-1">{s.title}</span>
                      <VersionTag state={state} id={e.id} edited={s.edited} />
                    </button>
                  );
                })}
              </div>
            );
          })}
          {!filtered.length && <p className="px-4 py-6 text-sm text-muted">No scripts match.</p>}
        </aside>

        {/* Editor + preview */}
        <div className="scroll-thin min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl space-y-4 px-6 py-5">
            <Editor
              key={selectedId}
              entry={entry}
              draft={draft}
              setDraft={setDraft}
              canEdit={canEdit}
              dirty={dirty}
              edited={saved.edited}
              editedBy={saved.edit ? `${saved.edit.by} · ${formatDateTime(saved.edit.at)}` : null}
              liveVersion={versions[versions.length - 1].n}
              onSave={(meta) => save(selectedId, draft, userDisplayName(currentUser), meta)}
              onDiscard={() => setDraft({ title: saved.title, content: saved.content })}
              onRestore={() => {
                if (window.confirm("Restore the original wording for this script? Your edit stays in the change history.")) {
                  restore(selectedId, userDisplayName(currentUser));
                }
              }}
            />
            <Preview entry={entry} draft={draft} patients={patients} repName={currentUser.firstName} />
            <Versions
              key={`v-${selectedId}`}
              versions={versions}
              canEdit={canEdit}
              onLoad={(t) => setDraft(t)}
              onMakeLive={(v) => {
                if (dirty && !window.confirm("You have unsaved changes to this script. Discard them and make this version live?")) return;
                save(selectedId, v.text, userDisplayName(currentUser), { note: v.n === 1 ? "Back to the original wording" : `Brought back v${v.n}${v.label ? ` (${v.label})` : ""}` });
              }}
              onLabel={label}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Editor({
  entry,
  draft,
  setDraft,
  canEdit,
  dirty,
  edited,
  editedBy,
  liveVersion,
  onSave,
  onDiscard,
  onRestore,
}: {
  entry: LibraryEntry;
  draft: ScriptText;
  setDraft: (t: ScriptText) => void;
  canEdit: boolean;
  dirty: boolean;
  edited: boolean;
  editedBy: string | null;
  liveVersion: number;
  onSave: (meta: { label?: string; note?: string }) => void;
  onDiscard: () => void;
  onRestore: () => void;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [showFormat, setShowFormat] = useState(false);
  const [versionName, setVersionName] = useState("");
  const [versionNote, setVersionNote] = useState("");
  const doSave = () => {
    onSave({ label: versionName, note: versionNote });
    setVersionName("");
    setVersionNote("");
  };

  const insert = (token: string) => {
    const ta = textarea.current;
    if (!ta || !canEdit) return;
    const text = `[${token}]`;
    const { selectionStart: a, selectionEnd: b, value } = ta;
    setDraft({ ...draft, content: value.slice(0, a) + text + value.slice(b) });
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(a + text.length, a + text.length);
    });
  };

  return (
    <section className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{GROUP_LABELS[entry.group]}</span>
        <Badge className={edited ? "bg-amber-100 text-amber-900" : undefined}>v{liveVersion} live{edited ? "" : " · original"}</Badge>
        {dirty && <Badge className="bg-brand-soft text-brand-ink">Unsaved changes</Badge>}
        {editedBy && <span className="text-xs text-muted">Last saved by {editedBy}</span>}
        <div className="ml-auto flex items-center gap-2">
          {edited && canEdit && (
            <Button size="sm" variant="ghost" onClick={onRestore} title="Go back to the wording this script shipped with">
              <RotateCcw size={13} /> Restore original
            </Button>
          )}
          {canEdit && (
            <>
              <Button size="sm" onClick={onDiscard} disabled={!dirty}>
                Discard
              </Button>
              <Button size="sm" variant="primary" onClick={doSave} disabled={!dirty || !draft.content.trim()}>
                <Save size={13} /> Save as v{liveVersion + 1}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="space-y-3 p-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">{entry.group === "rebuttal" ? "Objection (shown in the Rebuttals list)" : "Title"}</span>
          <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} readOnly={!canEdit} className="w-full font-medium" />
        </label>

        <p className="rounded-md bg-surface-2 px-3 py-2 text-xs text-muted">
          <span className="font-medium text-ink">Shown when: </span>
          {entry.usedWhen}
        </p>

        {canEdit && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted">Click a placeholder to insert it at the cursor. It fills in from the patient&apos;s record on the call.</p>
            <div className="flex flex-wrap gap-1">
              {TOKEN_DOCS.filter((t) => !t.desc.startsWith("Same as")).map((t) => (
                <button
                  key={t.token}
                  onClick={() => insert(t.token)}
                  title={t.desc}
                  className="rounded border border-brand/30 bg-brand-soft px-1.5 py-0.5 font-mono text-[11px] text-brand-ink hover:border-brand"
                >
                  {t.token}
                </button>
              ))}
            </div>
          </div>
        )}

        <textarea
          ref={textarea}
          value={draft.content}
          onChange={(e) => setDraft({ ...draft, content: e.target.value })}
          readOnly={!canEdit}
          spellCheck
          aria-label="Script text"
          className="scroll-thin h-[24rem] w-full resize-y rounded-md border border-border bg-surface p-3 font-mono text-[13px] leading-relaxed text-ink focus:border-brand focus:outline-none"
        />

        <div className="flex flex-wrap gap-4 text-xs">
          <button onClick={() => setShowFormat((v) => !v)} className="flex items-center gap-1 font-medium text-brand-ink hover:underline">
            <ChevronDown size={12} className={cx("transition-transform", !showFormat && "-rotate-90")} /> How to format
          </button>
          {edited && (
            <button onClick={() => setShowOriginal((v) => !v)} className="flex items-center gap-1 font-medium text-brand-ink hover:underline">
              <ChevronDown size={12} className={cx("transition-transform", !showOriginal && "-rotate-90")} /> Original wording
            </button>
          )}
        </div>
        {canEdit && dirty && (
          <div className="grid gap-2 rounded-md border border-brand/30 bg-brand-soft/40 p-3 sm:grid-cols-[minmax(0,14rem)_1fr]">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Version name (optional)</span>
              <Input value={versionName} onChange={(e) => setVersionName(e.target.value)} placeholder={`v${liveVersion + 1}`} className="w-full" maxLength={60} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">What changed? (optional)</span>
              <Input value={versionNote} onChange={(e) => setVersionNote(e.target.value)} placeholder="e.g. Softer wording on the deposit" className="w-full" maxLength={200} />
            </label>
          </div>
        )}
        {showFormat && <FormatHelp group={entry.group} />}
        {showOriginal && (
          <div className="rounded-md border border-dashed border-border bg-surface-2/50 p-3">
            <p className="mb-1 text-xs font-semibold text-muted">Original: {entry.title}</p>
            <pre className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-ink">{entry.content}</pre>
          </div>
        )}
      </div>
    </section>
  );
}

function FormatHelp({ group }: { group: ScriptGroup }) {
  if (group === "rebuttal") {
    return (
      <ul className="list-disc space-y-1 rounded-md bg-surface-2 py-2 pl-7 pr-3 text-xs text-muted">
        <li>Leave a blank line between paragraphs.</li>
        <li>A paragraph wrapped in (round brackets) is a direction for the rep, shown in grey italics.</li>
        <li>Placeholders in [SQUARE_BRACKETS] fill in from the patient&apos;s record.</li>
      </ul>
    );
  }
  const rows: [string, string][] = [
    ['"In double quotes"', "Spoken by the rep (shown with a blue bar)."],
    ["(In round brackets)", "A direction for the rep, shown in grey italics."],
    ["[Heading] on its own line", "A small heading, unless it's a placeholder."],
    ["---", "Starts a sub-section. The next line is its title. Titles starting with “Fallback” start folded."],
    ["3B …", "A sub-section titled 3B only shows for Medicare Advantage."],
    ["MEDICARE ONLY: …", "That line only shows for Medicare and Medicare Advantage."],
    ["CONDITIONAL IF TP GOES INTO [NEXT_YEAR]: …", "That line only shows when the treatment plan runs into next year."],
    ["[ANY_OTHER_TEXT]", "Not a known placeholder: shown as an amber blank for the rep to fill in on the call."],
  ];
  return (
    <table className="w-full overflow-hidden rounded-md bg-surface-2 text-xs">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} className="border-t border-border first:border-t-0">
            <td className="whitespace-nowrap px-3 py-1.5 font-mono text-ink">{k}</td>
            <td className="px-3 py-1.5 text-muted">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Live preview of the draft, filled in for a real patient. Outcome scripts offer patients who'd actually get them. */
function Preview({ entry, draft, patients, repName }: { entry: LibraryEntry; draft: ScriptText; patients: Patient[]; repName: string }) {
  const cases = useMemo<PreviewCase[]>(() => {
    const ready = patients.filter((p) => calculate(p, DEFAULT_OPTIONS).ready);
    if (entry.scenarioKey) {
      const matches: PreviewCase[] = [];
      for (const v of PREVIEW_VARIANTS) {
        for (const p of ready) {
          if (matches.some((m) => m.patient.id === p.id)) continue;
          if (calculate(p, v.opts).scenario?.key === entry.scenarioKey) matches.push({ patient: p, opts: v.opts, match: true, note: v.note });
        }
      }
      const rest = ready.filter((p) => !matches.some((m) => m.patient.id === p.id)).map((p) => ({ patient: p, opts: DEFAULT_OPTIONS, match: false }));
      return [...matches, ...rest];
    }
    if (entry.logistics) {
      const isMatch = (p: Patient) => calculate(p, DEFAULT_OPTIONS).logistics === entry.logistics;
      return [...ready.filter(isMatch).map((p) => ({ patient: p, opts: DEFAULT_OPTIONS, match: true })), ...ready.filter((p) => !isMatch(p)).map((p) => ({ patient: p, opts: DEFAULT_OPTIONS, match: false }))];
    }
    return ready.map((p) => ({ patient: p, opts: DEFAULT_OPTIONS, match: true }));
  }, [entry, patients]);

  const [patientId, setPatientId] = useState<string | null>(null);
  const current = cases.find((c) => c.patient.id === patientId) ?? cases[0];

  const rendered = useMemo(() => {
    if (!current) return null;
    const calc = calculate(current.patient, current.opts);
    const values = tokenValues(current.patient, calc, repName);
    const blocks = entry.group === "rebuttal" ? [] : renderScript(draft.content, scriptContext(values, calc));
    const paragraphs = entry.group === "rebuttal" ? toParagraphs(draft.content) : [];
    // What the rep would see as amber blanks
    const segs: Segment[] =
      entry.group === "rebuttal"
        ? paragraphs.flatMap((t) => fill(t, values))
        : blocks.flatMap((b) => b.lines.flatMap((l) => (l.kind === "heading" ? [] : l.segments)));
    const blanks = [...new Set(segs.filter((s) => s.kind === "blank").map((s) => s.text))];
    return { blocks, paragraphs, values, blanks };
  }, [current, draft.content, entry.group, repName]);

  const matchCount = cases.filter((c) => c.match).length;

  return (
    <section className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Preview</h2>
        <span className="text-xs text-muted">as the rep sees it, including unsaved changes</span>
        <label className="ml-auto flex items-center gap-2 text-xs text-muted">
          Patient
          <Select value={current?.patient.id ?? ""} onChange={(e) => setPatientId(e.target.value)} className="max-w-[22rem]">
            {(entry.scenarioKey || entry.logistics) && matchCount > 0 && (
              <optgroup label="Would get this script">
                {cases
                  .filter((c) => c.match)
                  .map((c) => (
                    <option key={c.patient.id} value={c.patient.id}>
                      {c.patient.firstName} {c.patient.lastName}
                      {c.note ? ` (${c.note})` : ""}
                    </option>
                  ))}
              </optgroup>
            )}
            <optgroup label={entry.scenarioKey || entry.logistics ? "Other patients" : "Patients"}>
              {cases
                .filter((c) => !(entry.scenarioKey || entry.logistics) || !c.match)
                .map((c) => (
                  <option key={c.patient.id} value={c.patient.id}>
                    {c.patient.firstName} {c.patient.lastName}
                  </option>
                ))}
            </optgroup>
          </Select>
        </label>
      </div>
      <div className="space-y-3 p-4">
        {entry.scenarioKey && matchCount === 0 && (
          <p className="rounded-md bg-surface-2 px-3 py-2 text-xs text-muted">No demo patient gets this script right now, so the preview uses another patient&apos;s figures.</p>
        )}
        {current && !current.match && (entry.scenarioKey || entry.logistics) && matchCount > 0 && (
          <p className="rounded-md bg-surface-2 px-3 py-2 text-xs text-muted">This patient wouldn&apos;t get this script; their figures are used for the preview only.</p>
        )}
        {rendered && rendered.blanks.length > 0 && (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {rendered.blanks.length === 1 ? "This placeholder isn't" : "These placeholders aren't"} filled from the record, so the rep fills{" "}
            {rendered.blanks.length === 1 ? "it" : "them"} in on the call: <span className="font-mono">{rendered.blanks.join(", ")}</span>. If that&apos;s a typo, check
            the spelling against the placeholder list.
          </p>
        )}
        {!rendered ? (
          <p className="text-sm text-muted">No patients with a verified estimate to preview with.</p>
        ) : entry.group === "rebuttal" ? (
          <div className="rounded-md border border-border p-3">
            <p className="mb-2 text-[13px] font-medium">{draft.title}</p>
            <RebuttalBody paragraphs={rendered.paragraphs} values={rendered.values} />
          </div>
        ) : (
          <div className="space-y-3 rounded-md border border-border p-4">
            <p className="text-sm font-semibold">{entry.group === "outcome" ? `Insurance Outcome — ${draft.title}` : draft.title}</p>
            {rendered.blocks.map((b, i) => (
              <ScriptBlock key={`${current?.patient.id}-${i}-${b.title}`} block={b} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/** Small "v3" tag in the script list; amber when the live wording isn't the original. */
function VersionTag({ state, id, edited }: { state: EditsState; id: string; edited: boolean }) {
  const count = 1 + state.log.filter((c) => c.scriptId === id).length;
  if (count === 1) return null;
  return (
    <span
      className={cx("mt-0.5 shrink-0 rounded px-1 text-[10px] font-semibold tabular-nums", edited ? "bg-amber-100 text-amber-900" : "bg-surface-2 text-muted")}
      title={`${count} versions${edited ? " · live wording is edited" : " · live wording is the original"}`}
    >
      v{count}
    </span>
  );
}

const versionTitle = (v: ScriptVersion) => v.label || (v.kind === "original" ? "Original" : v.kind === "restored" ? "Back to original" : "Edited");

/**
 * Every version of the script, newest first, with a line-by-line comparison. v1 is the shipped wording.
 * Making an older version live saves it as a new version, so nothing is ever lost.
 */
function Versions({
  versions,
  canEdit,
  onLoad,
  onMakeLive,
  onLabel,
}: {
  versions: ScriptVersion[];
  canEdit: boolean;
  onLoad: (t: ScriptText) => void;
  onMakeLive: (v: ScriptVersion) => void;
  onLabel: (changeId: string, label: string) => void;
}) {
  const live = versions[versions.length - 1];
  const newestFirst = [...versions].reverse();
  const [selectedN, setSelectedN] = useState(live.n);
  const selected = versions.find((v) => v.n === selectedN) ?? live;
  // Compare against: the live version, or (when the live one is selected) the version before it
  const [againstN, setAgainstN] = useState<number | null>(null);
  const defaultAgainst = selected.live ? versions[versions.length - 2]?.n ?? null : live.n;
  const against = versions.find((v) => v.n === (againstN ?? defaultAgainst)) ?? null;
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const pick = (n: number) => {
    setSelectedN(n);
    setAgainstN(null);
    setRenaming(false);
  };

  const diff = useMemo(() => {
    if (!against || against.n === selected.n) return null;
    const [older, newer] = against.n < selected.n ? [against, selected] : [selected, against];
    return { older, newer, lines: diffLines(older.text.content, newer.text.content), titleChanged: older.text.title !== newer.text.title };
  }, [against, selected]);
  const added = diff?.lines.filter((l) => l.kind === "add").length ?? 0;
  const removed = diff?.lines.filter((l) => l.kind === "del").length ?? 0;

  return (
    <section className="rounded-lg border border-border bg-surface">
      <h2 className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
        <History size={14} className="text-muted" /> Versions
        <span className="text-xs font-normal text-muted">
          {versions.length} {versions.length === 1 ? "version" : "versions"} · v{live.n} is live
        </span>
      </h2>
      {versions.length === 1 ? (
        <p className="px-4 py-4 text-sm text-muted">Only the original wording so far. Each save adds a version here.</p>
      ) : (
        <div className="grid min-h-0 md:grid-cols-[17rem_minmax(0,1fr)]">
          {/* Version list */}
          <ol className="scroll-thin max-h-[32rem] overflow-y-auto border-b border-border md:border-b-0 md:border-r">
            {newestFirst.map((v) => {
              const on = v.n === selected.n;
              return (
                <li key={v.id}>
                  <button
                    onClick={() => pick(v.n)}
                    aria-current={on}
                    className={cx("flex w-full gap-2.5 border-l-2 px-3 py-2.5 text-left", on ? "border-brand bg-brand-soft" : "border-transparent hover:bg-surface-2")}
                  >
                    <span
                      className={cx(
                        "mt-0.5 flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1 text-[11px] font-semibold tabular-nums",
                        v.live ? "bg-brand text-white" : "bg-surface-2 text-muted",
                      )}
                    >
                      v{v.n}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className={cx("truncate text-[13px]", on ? "font-semibold text-brand-ink" : "font-medium text-ink")}>{versionTitle(v)}</span>
                        {v.live && <span className="shrink-0 rounded bg-payer-commercial/15 px-1.5 text-[10px] font-semibold uppercase text-payer-commercial">Live</span>}
                      </span>
                      <span className="block truncate text-[11px] text-muted">{v.by ? `${v.by} · ${formatDateTime(v.at!)}` : "Shipped wording"}</span>
                      {v.note && <span className="mt-0.5 block truncate text-[11px] italic text-muted">{v.note}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          {/* Selected version */}
          <div className="min-w-0 space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              {renaming ? (
                <form
                  className="flex items-center gap-1.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    onLabel(selected.id, nameDraft);
                    setRenaming(false);
                  }}
                >
                  <Input autoFocus value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder={`v${selected.n}`} maxLength={60} className="h-7 w-56 text-sm" aria-label="Version name" />
                  <Button size="sm" variant="primary" type="submit">
                    <Check size={13} /> Save
                  </Button>
                  <Button size="sm" variant="ghost" type="button" onClick={() => setRenaming(false)}>
                    Cancel
                  </Button>
                </form>
              ) : (
                <>
                  <h3 className="text-sm font-semibold">
                    v{selected.n} · {versionTitle(selected)}
                  </h3>
                  {canEdit && selected.kind !== "original" && (
                    <button
                      onClick={() => {
                        setNameDraft(selected.label ?? "");
                        setRenaming(true);
                      }}
                      className="flex items-center gap-1 text-xs font-medium text-brand-ink hover:underline"
                    >
                      <Pencil size={11} /> {selected.label ? "Rename" : "Name this version"}
                    </button>
                  )}
                </>
              )}
              {canEdit && !renaming && (
                <div className="ml-auto flex items-center gap-2">
                  <Button size="sm" onClick={() => onLoad(selected.text)} title="Put this wording in the editor to adjust it before saving">
                    Load into editor
                  </Button>
                  {!selected.live && (
                    <Button size="sm" variant="primary" onClick={() => onMakeLive(selected)} title="Saves this wording as a new version, so the current one stays in the list">
                      <RotateCcw size={13} /> Make live
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>Compare with</span>
              <Select value={against?.n ?? ""} onChange={(e) => setAgainstN(Number(e.target.value))} className="h-7 text-xs" aria-label="Compare with version">
                {versions
                  .filter((v) => v.n !== selected.n)
                  .map((v) => (
                    <option key={v.id} value={v.n}>
                      v{v.n} · {versionTitle(v)}
                      {v.live ? " (live)" : ""}
                    </option>
                  ))}
              </Select>
              {diff && (
                <span>
                  v{diff.older.n} → v{diff.newer.n}: <span className="font-medium text-payer-commercial">+{added}</span>{" "}
                  <span className="font-medium text-payer-medicare">−{removed}</span> lines
                </span>
              )}
            </div>

            {diff ? (
              <div className="overflow-hidden rounded-md border border-border">
                {diff.titleChanged && (
                  <div className="border-b border-border bg-surface-2 px-3 py-1.5 text-xs">
                    <span className="text-muted">Title: </span>
                    <span className="text-payer-medicare line-through">{diff.older.text.title}</span> → <span className="font-medium text-payer-commercial">{diff.newer.text.title}</span>
                  </div>
                )}
                <pre className="scroll-thin max-h-[28rem] overflow-auto py-1 font-mono text-[11.5px] leading-relaxed">
                  {diff.lines.map((l, i) => (
                    <div
                      key={i}
                      className={cx(
                        "whitespace-pre-wrap px-3",
                        l.kind === "add" && "bg-emerald-50 text-[#167a3c] dark:bg-emerald-950/30 dark:text-[#6fd49a]",
                        l.kind === "del" && "bg-red-50 text-payer-medicare line-through decoration-payer-medicare/40 dark:bg-red-950/30",
                        l.kind === "same" && "text-ink",
                      )}
                    >
                      <span aria-hidden className="mr-2 inline-block w-3 select-none text-muted">
                        {l.kind === "add" ? "+" : l.kind === "del" ? "−" : ""}
                      </span>
                      {l.text || " "}
                    </div>
                  ))}
                </pre>
              </div>
            ) : (
              <pre className="scroll-thin max-h-[28rem] overflow-auto rounded-md border border-border bg-surface-2/50 p-3 font-mono text-[11.5px] leading-relaxed text-ink whitespace-pre-wrap">{selected.text.content}</pre>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
