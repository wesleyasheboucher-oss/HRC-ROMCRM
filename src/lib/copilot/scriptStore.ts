"use client";

/**
 * Saved script edits, shared by the Call Scripts page and the Call Co-Pilot tab.
 *
 * Kept apart from the main demo store (store.tsx) on purpose: resetting the demo patients doesn't wipe
 * script edits, and the main store's shape doesn't change. Like the rest of this POC it lives in
 * localStorage; in production this is a scripts table plus a change-log table.
 */
import { useCallback, useSyncExternalStore } from "react";
import { applyLabel, applyRestore, applySave, EMPTY_EDITS, resolveScript, sanitize, type EditsState, type ScriptText } from "./library";

const STORAGE_KEY = "romcrm-call-scripts-v1";

let state: EditsState = EMPTY_EDITS;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state = raw ? sanitize(JSON.parse(raw)) : EMPTY_EDITS;
  } catch {
    state = EMPTY_EDITS;
  }
  // Keep other open tabs in step
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    try {
      state = e.newValue ? sanitize(JSON.parse(e.newValue)) : EMPTY_EDITS;
    } catch {
      state = EMPTY_EDITS;
    }
    listeners.forEach((l) => l());
  });
}

function set(next: EditsState) {
  if (next === state) return;
  state = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable; edits last until the page reloads
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  load();
  listeners.add(l);
  return () => listeners.delete(l);
}

const getSnapshot = () => {
  load();
  return state;
};
const getServerSnapshot = () => EMPTY_EDITS;

export function useScriptEdits() {
  const s = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const script = useCallback((id: string) => resolveScript(s, id), [s]);
  return {
    state: s,
    /** The wording to show for a script id (see library.ts for ids). */
    script,
    save: (id: string, text: ScriptText, by: string, meta?: { label?: string; note?: string }) => set(applySave(state, id, text, by, new Date(), meta)),
    /** Name or rename a saved version (by its change-log id). */
    label: (changeId: string, label: string) => set(applyLabel(state, changeId, label)),
    restore: (id: string, by: string) => set(applyRestore(state, id, by)),
  };
}
