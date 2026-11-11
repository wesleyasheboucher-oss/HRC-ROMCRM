/**
 * Patient Pipeline columns, one board per line:
 *   Ortho   — days until surgery (stages.ts), derived from the surgery date
 *   Cardiac — enrollment calls: Preliminary Call, then 1st … 6th Enrollment Call. An order sits in the column
 *             for the number of calls logged on it, so logging a call moves it one column right; 6 or more
 *             calls stay in the last column.
 */
import { callCount } from "./fields";
import { lineOf } from "./orderStatus";
import { STAGES, stageOf } from "./stages";
import type { Line, Patient } from "./types";

export interface BoardColumn {
  id: string;
  label: string;
}

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th"];
export const CARDIAC_COLUMNS: BoardColumn[] = [
  { id: "call_0", label: "Preliminary Call" },
  ...ORDINALS.map((o, i) => ({ id: `call_${i + 1}`, label: `${o} Enrollment Call` })),
];

export const boardColumns = (line: Line): BoardColumn[] => (line === "cardiac" ? CARDIAC_COLUMNS : STAGES);

export function columnOf(line: Line, p: Patient, today: Date): string {
  if (line === "ortho") return stageOf(p, today).id;
  return CARDIAC_COLUMNS[Math.min(callCount(p), CARDIAC_COLUMNS.length - 1)].id;
}

/** The column an order sits in on its own line's board, e.g. "4-7 Days Out" or "2nd Enrollment Call". */
export function columnLabel(p: Patient, today: Date): string {
  const line = lineOf(p);
  const id = columnOf(line, p, today);
  return boardColumns(line).find((c) => c.id === id)?.label ?? "";
}

/** Where each line's board lives. */
export const PIPELINE_PATH: Record<Line, string> = { ortho: "/deals", cardiac: "/deals/cardiac" };
