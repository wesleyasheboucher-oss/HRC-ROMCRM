"use client";

// Client-side demo store. In production each action here maps to an API call;
// the shape of state is a reasonable starting point for the backend schema.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { assignLead, countToday, migrateRules, withEveryHrc, type DailyCounts } from "./assignment";
import { conversionFromResult, conversionsFromResults, voidForResult } from "./conversions";
import { deletePatch, savePatch } from "./copilot/result";
import { startOfToday, toISODate } from "./dates";
import { payerType, userDisplayName } from "./fields";
import { newId } from "./filters";
import { HRC_STATUS, isValidStatus, lineOf, primeStatusOf, statusText, substatusOf } from "./orderStatus";
import {
  defaultPrefs,
  generateLead,
  generatePatients,
  seedCallResults,
  SEED_ASSIGNMENTS,
  SEED_FILTERS,
  SEED_RULES,
  TEAMS,
  USERS,
} from "./mock-data";
import type {
  AssignmentLogEntry,
  AssignmentRule,
  CallResult,
  Conversion,
  LegacyAssignmentRule,
  Line,
  Patient,
  SavedFilter,
  Team,
  User,
  UserPrefs,
  ViewAssignment,
} from "./types";

// Bumped when the seed data changes shape (v2: VA cut to ~1% of orders; v3: EVA rate-card pricing; v4: 30 / 42 / 60-day plans; v5: plain numbers;
// v6: every record is an iOMS order with a prime status and substatus; v7: Lead Stream per line, weights; v8: each HRC works one line;
// v9: conversions table), so saved demo data reseeds once
const STORAGE_KEY = "romcrm-poc-v9";

const HRCS = USERS.filter((u) => u.role === "coordinator");
const USERS_BY_ID = Object.fromEntries(USERS.map((u) => [u.id, u]));
const todayIso = () => toISODate(startOfToday());

/**
 * An order entering Patient Sales · Ready for Conversion (Notion: "Orders are assigned to an HRC when in the appropriate order status").
 * No owner → assigned by its line's Lead Stream rules (weight and daily cap). Already owned (e.g. it came back to Patient Sales)
 * → keeps that owner. Returns the updated order and the log entry; `counts` is updated in place.
 */
function enterHrcStatus(p: Patient, rules: AssignmentRule[], counts: DailyCounts, at: string): { patient: Patient; entry: AssignmentLogEntry } {
  const line = lineOf(p);
  const base = { id: newId("log"), at, patientId: p.id, patientName: `${p.firstName} ${p.lastName}`, leadType: payerType(p), line };
  if (p.ownerId) {
    const reason = `Kept existing HRC (${userDisplayName(USERS_BY_ID[p.ownerId])})`;
    return {
      patient: { ...p, history: [{ id: newId("h"), at, by: "Lead Stream", text: `Entered ${statusText(HRC_STATUS.prime, HRC_STATUS.sub)}. ${reason}` }, ...p.history] },
      entry: { ...base, kind: "kept", assignedToId: p.ownerId, reason },
    };
  }
  const result = assignLead(p, rules, USERS_BY_ID, counts[line]);
  if (result.assignedToId) counts[line][result.assignedToId] = (counts[line][result.assignedToId] ?? 0) + 1;
  const owner = result.assignedToId;
  return {
    patient: {
      ...p,
      ownerId: owner,
      nextTask: p.nextTask && owner ? { ...p.nextTask, assigneeId: owner } : p.nextTask,
      history: [
        { id: newId("h"), at, by: "Lead Stream", text: owner ? `Owner set to ${userDisplayName(USERS_BY_ID[owner])}. ${result.reason}` : result.reason },
        ...p.history,
      ],
    },
    entry: { ...base, kind: owner ? "auto" : "unassigned", assignedToId: owner, reason: result.reason },
  };
}

/** Pushes `n` new orders on a line through intake. */
function intake(s: State, n: number, line: Line): State {
  const counts = countToday(s.assignmentLog, todayIso(), toISODate);
  const at = new Date().toISOString();
  const arrived: Patient[] = [];
  const log: AssignmentLogEntry[] = [];
  for (let i = 0; i < n; i++) {
    const { patient, entry } = enterHrcStatus(generateLead(s.leadSeq + i, line), s.rules, counts, at);
    arrived.push(patient);
    log.push(entry);
  }
  return { ...s, leadSeq: s.leadSeq + n, patients: [...arrived.reverse(), ...s.patients], assignmentLog: [...log.reverse(), ...s.assignmentLog] };
}

interface State {
  patients: Patient[];
  filters: SavedFilter[];
  assignments: ViewAssignment[];
  prefs: Record<string, UserPrefs>;
  rules: AssignmentRule[];
  assignmentLog: AssignmentLogEntry[];
  /** Conversions table: every WON / LOST decision, never edited (see conversions.ts). Top level, not inside a patient. */
  conversions: Conversion[];
  /** Next conversion number (CNV-000123) */
  conversionSeq: number;
  currentUserId: string;
  leadSeq: number;
}

function seedState(): State {
  const patients = seedCallResults(generatePatients());
  const conversions = conversionsFromResults(patients);
  const s: State = {
    patients,
    conversions,
    conversionSeq: conversions.length + 1,
    filters: SEED_FILTERS,
    assignments: SEED_ASSIGNMENTS,
    prefs: {},
    rules: withEveryHrc(SEED_RULES, HRCS),
    assignmentLog: [],
    currentUserId: "u_riley",
    leadSeq: 1,
  };
  // A morning's intake so each Lead Stream page opens with today's incoming orders
  return intake(intake(s, 9, "ortho"), 4, "cardiac");
}

interface Store extends State {
  users: User[];
  teams: Team[];
  usersById: Record<string, User>;
  currentUser: User;
  prefsFor: (userId: string) => UserPrefs;
  setCurrentUser: (id: string) => void;
  updatePatient: (id: string, patch: Partial<Patient>, historyText?: string) => void;
  /** Moves an order to a prime status and substatus. Returns false (and changes nothing) if the substatus doesn't belong to the prime status. */
  setOrderStatus: (id: string, prime: string, sub: string) => boolean;
  saveFilter: (f: SavedFilter) => void;
  deleteFilter: (id: string) => void;
  updatePrefs: (userId: string, patch: Partial<UserPrefs>) => void;
  setViewAssignment: (a: ViewAssignment) => void;
  updateRule: (userId: string, line: Line, patch: Partial<AssignmentRule>) => void;
  /** Pushes `n` new orders on a line through intake (they arrive at Patient Sales · Ready for Conversion). */
  simulateLeads: (n: number, line: Line) => void;
  /** Manager reassigns an order from the Lead Stream; writes history and a log entry. */
  reassignOrder: (patientId: string, userId: string | null) => void;
  /** Saves a call result on the record (with an Activity entry); a WON or LOST result also adds a conversion row. */
  saveCallResult: (patientId: string, r: CallResult) => void;
  /** Deletes a saved call result (managers / admins); its conversion row is voided, not removed. */
  deleteCallResult: (patientId: string, resultId: string) => void;
  /** Orders assigned by weight and cap today, per line and HRC. */
  assignedToday: DailyCounts;
  resetDemo: () => void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State | null>(null);

  // Hydrate after mount so dates are computed in the viewer's timezone and SSR stays stable.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const loaded = raw ? (JSON.parse(raw) as State) : seedState();
      // Saved data from before the conversions table: build it from the records' saved results
      if (!loaded.conversions) {
        loaded.conversions = conversionsFromResults(loaded.patients);
        loaded.conversionSeq = loaded.conversions.length + 1;
      }
      // Percentage rules → weights; one rule per HRC on their own line's page (Active off if new)
      loaded.rules = withEveryHrc(migrateRules(loaded.rules as (AssignmentRule | LegacyAssignmentRule)[], USERS), HRCS);
      // Cleanup for previously saved demo data:
      //   "1st Call" tasks were removed, so clear any still there.
      //   WIP 11 (Ins Verification) was removed from the demo, so those patients move to 13 (Ins Cleared).
      const s: State = {
        ...loaded,
        patients: loaded.patients.map((p) => {
          let q = p.nextTask?.title === "1st Call" ? { ...p, nextTask: null } : p;
          if (q.wipState.startsWith("11")) q = { ...q, wipState: "13 Ins Cleared: PendConfirmation", estimate: undefined };
          return q;
        }),
      };
      // ?as=<userId> opens the demo signed in as that user (handy for sharing role-specific links)
      const as = new URLSearchParams(window.location.search).get("as");
      setState(as && USERS.some((u) => u.id === as) ? { ...s, currentUserId: as } : s);
    } catch {
      setState(seedState());
    }
  }, []);

  useEffect(() => {
    if (!state) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // storage unavailable; demo still works in-memory
    }
  }, [state]);

  const update = useCallback((fn: (s: State) => State) => setState((s) => (s ? fn(s) : s)), []);

  const usersById = useMemo(() => Object.fromEntries(USERS.map((u) => [u.id, u])), []);

  const actor = state ? userDisplayName(usersById[state.currentUserId]) : "";

  const prefsFor = useCallback(
    (userId: string) => state?.prefs[userId] ?? defaultPrefs(userId),
    [state?.prefs],
  );

  const assignedToday = useMemo(() => countToday(state?.assignmentLog ?? [], todayIso(), toISODate), [state?.assignmentLog]);

  const store = useMemo<Store | null>(() => {
    if (!state) return null;
    return {
      ...state,
      users: USERS,
      teams: TEAMS,
      usersById,
      currentUser: usersById[state.currentUserId],
      prefsFor,
      assignedToday,
      setCurrentUser: (id) => update((s) => ({ ...s, currentUserId: id })),
      updatePatient: (id, patch, historyText) =>
        update((s) => ({
          ...s,
          patients: s.patients.map((p) =>
            p.id !== id
              ? p
              : {
                  ...p,
                  ...patch,
                  history: historyText
                    ? [{ id: newId("h"), at: new Date().toISOString(), by: actor, text: historyText }, ...p.history]
                    : p.history,
                },
          ),
        })),
      setOrderStatus: (id, prime, sub) => {
        if (!isValidStatus(prime, sub)) return false;
        const at = new Date().toISOString();
        update((s) => {
          const p = s.patients.find((x) => x.id === id);
          if (!p) return s;
          const from = statusText(primeStatusOf(p), substatusOf(p));
          const to = statusText(prime, sub);
          if (from === to) return s;
          let next: Patient = {
            ...p,
            primeStatus: prime,
            substatus: sub,
            statusChangedAt: at,
            history: [{ id: newId("h"), at, by: actor, text: `Status: ${from} → ${to}` }, ...p.history],
          };
          // Entering the HRC hand-in point is when an order gets an HRC (or keeps the one it has)
          let log = s.assignmentLog;
          if (prime === HRC_STATUS.prime && sub === HRC_STATUS.sub) {
            const { patient, entry } = enterHrcStatus(next, s.rules, countToday(s.assignmentLog, todayIso(), toISODate), at);
            next = patient;
            log = [entry, ...log];
          }
          return { ...s, patients: s.patients.map((x) => (x.id === id ? next : x)), assignmentLog: log };
        });
        return true;
      },
      saveCallResult: (patientId, r) =>
        update((s) => {
          const p = s.patients.find((x) => x.id === patientId);
          if (!p) return s;
          const { patch, history } = savePatch(p, r);
          const next: Patient = { ...p, ...patch, history: [{ id: newId("h"), at: r.at, by: actor, text: history }, ...p.history] };
          const row = conversionFromResult(r, p, s.conversionSeq);
          return {
            ...s,
            patients: s.patients.map((x) => (x.id === patientId ? next : x)),
            ...(row ? { conversions: [...s.conversions, row], conversionSeq: s.conversionSeq + 1 } : {}),
          };
        }),
      deleteCallResult: (patientId, resultId) =>
        update((s) => {
          const p = s.patients.find((x) => x.id === patientId);
          const d = p && deletePatch(p, resultId);
          if (!p || !d) return s;
          const at = new Date().toISOString();
          const voided = s.conversions.some((c) => c.callResultId === resultId && !c.voided);
          const next: Patient = {
            ...p,
            ...d.patch,
            history: [{ id: newId("h"), at, by: actor, text: d.history + (voided ? " (its conversion row is voided)" : "") }, ...p.history],
          };
          return {
            ...s,
            patients: s.patients.map((x) => (x.id === patientId ? next : x)),
            conversions: voidForResult(s.conversions, resultId, { id: s.currentUserId, name: actor }, at),
          };
        }),
      reassignOrder: (patientId, userId) =>
        update((s) => {
          const p = s.patients.find((x) => x.id === patientId);
          if (!p || p.ownerId === userId) return s;
          const at = new Date().toISOString();
          const from = userDisplayName(USERS_BY_ID[p.ownerId ?? ""]);
          const to = userDisplayName(USERS_BY_ID[userId ?? ""]);
          const reason = `Reassigned by ${actor}: ${from} → ${to}`;
          const next: Patient = {
            ...p,
            ownerId: userId,
            nextTask: p.nextTask && userId ? { ...p.nextTask, assigneeId: userId } : p.nextTask,
            history: [{ id: newId("h"), at, by: actor, text: `Owner changed from ${from} to ${to} (Lead Stream)` }, ...p.history],
          };
          const entry: AssignmentLogEntry = {
            id: newId("log"),
            at,
            patientId: p.id,
            patientName: `${p.firstName} ${p.lastName}`,
            leadType: payerType(p),
            line: lineOf(p),
            kind: "reassign",
            assignedToId: userId,
            reason,
          };
          return { ...s, patients: s.patients.map((x) => (x.id === patientId ? next : x)), assignmentLog: [entry, ...s.assignmentLog] };
        }),
      saveFilter: (f) =>
        update((s) => ({
          ...s,
          filters: s.filters.some((x) => x.id === f.id) ? s.filters.map((x) => (x.id === f.id ? f : x)) : [...s.filters, f],
        })),
      deleteFilter: (id) =>
        update((s) => ({
          ...s,
          filters: s.filters.filter((f) => f.id !== id),
          assignments: s.assignments.filter((a) => a.filterId !== id),
          prefs: Object.fromEntries(
            Object.entries(s.prefs).map(([k, v]) => [k, { ...v, pinnedFilterIds: v.pinnedFilterIds.filter((x) => x !== id) }]),
          ),
        })),
      updatePrefs: (userId, patch) =>
        update((s) => ({ ...s, prefs: { ...s.prefs, [userId]: { ...(s.prefs[userId] ?? defaultPrefs(userId)), ...patch } } })),
      setViewAssignment: (a) =>
        update((s) => ({
          ...s,
          assignments: [...s.assignments.filter((x) => x.filterId !== a.filterId), ...(a.userIds.length || a.teamIds.length ? [a] : [])],
        })),
      updateRule: (userId, line, patch) =>
        update((s) => ({ ...s, rules: s.rules.map((r) => (r.userId === userId && r.line === line ? { ...r, ...patch } : r)) })),
      simulateLeads: (n, line) => update((s) => intake(s, n, line)),
      resetDemo: () => {
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {}
        setState(seedState());
      },
    };
  }, [state, usersById, prefsFor, assignedToday, update, actor]);

  if (!store) {
    return <div className="flex h-screen items-center justify-center text-sm text-muted">Loading ROMCRM…</div>;
  }
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error("useStore must be used inside StoreProvider");
  return s;
}

export const canViewAllCoordinators = (u: User) => u.role === "admin" || u.role === "manager";
