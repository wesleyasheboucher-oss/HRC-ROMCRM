import { addDays, daysBetween, parseISODate, startOfToday } from "./dates";
import type { Patient, StageId } from "./types";

export interface StageDef {
  id: StageId;
  label: string;
  /** Inclusive range of "days until surgery". */
  min: number;
  max: number;
}

// BRD "Pipeline stages" table. Placement is automatic from surgery date.
export const STAGES: StageDef[] = [
  { id: "passed", label: "Passed", min: -Infinity, max: -1 },
  { id: "d0_3", label: "0-3 Days Out", min: 0, max: 3 },
  { id: "d4_7", label: "4-7 Days Out", min: 4, max: 7 },
  { id: "d8_14", label: "8-14 Days Out", min: 8, max: 14 },
  { id: "d15_21", label: "15-21 Days Out", min: 15, max: 21 },
  { id: "d22", label: "22+ Days Out", min: 22, max: Infinity },
];

export function daysOut(surgeryDate: string, today = startOfToday()): number {
  return daysBetween(today, parseISODate(surgeryDate));
}

export function stageForDaysOut(n: number): StageDef {
  return STAGES.find((s) => n >= s.min && n <= s.max)!;
}

export function stageOf(p: Patient, today = startOfToday()): StageDef {
  return stageForDaysOut(daysOut(p.surgeryDate, today));
}

/**
 * Days the patient has spent in each stage since the record was created (D-10).
 * Derived purely from created date and surgery date, since stage is a function of time.
 */
export function timeInStages(p: Patient, today = startOfToday()): Record<StageId, number> {
  const result = Object.fromEntries(STAGES.map((s) => [s.id, 0])) as Record<StageId, number>;
  const created = new Date(p.createdAt);
  const start = new Date(created.getFullYear(), created.getMonth(), created.getDate());
  const total = Math.max(0, daysBetween(start, today));
  for (let i = 0; i <= total; i++) {
    const day = addDays(start, i);
    result[stageOf(p, day).id] += 1;
  }
  return result;
}
