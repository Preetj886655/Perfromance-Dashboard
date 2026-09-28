/**
 * Dashboard Filter Engine — pure, testable filter logic for the live
 * manufacturing dashboard.
 *
 * Owns:
 * - FilterState (Date Range, Period, Line, Shift, STAGE, Material)
 * - Stage option collection — ALWAYS derived from the live backend dataset
 *   (record.rawStage). Never hard-coded.
 * - Line-aware Stage options computed from actual records.
 * - applyFilters — the single analytics filter pipeline:
 *   Date → Line → Shift → Stage → Material.
 *
 * The legacy `workCenter` field is preserved ONLY for the Work Center
 * Analytics carousel slide; it is NOT part of the main Operations Control.
 */

import type { PeriodPreset } from "../calculations/periodEngine";
import type { DprRecord } from "../normalization/normalizeDprData";
import {
  BUSINESS_LINES,
  BUSINESS_MATERIALS,
  BUSINESS_SHIFTS,
  normalizeLine,
  normalizeShift,
} from "../normalization/lineShiftMaterial";
import { BUSINESS_WORK_CENTERS } from "../normalization/workCenterMapping";

export const ALL_LINES = "All Lines";
export const ALL_SHIFTS = "All Shifts";
export const ALL_STAGES = "All Stages";
export const ALL_MACHINES = "All Machines";
export const ALL_WORK_CENTERS = "All Work Centers";
export const ALL_MATERIALS = "All Materials";

export type FilterState = {
  period: PeriodPreset;
  /** Inclusive start date (ISO yyyy-mm-dd). Empty string = no lower bound. */
  dateFrom: string;
  /** Inclusive end date (ISO yyyy-mm-dd). Empty string = no upper bound. */
  dateTo: string;
  line: string;
  shift: string;
  /** Active Stage filter (source Stage column). ALL_STAGES = no stage filter. */
  stage: string;
  /** Active Machine filter (source Machine column). ALL_MACHINES = no machine filter. */
  machine: string;
  /**
   * LEGACY: only set by the Work Center Analytics carousel slide drill-down.
   * Not present in the main Operations Control filter bar.
   */
  workCenter: string;
  material: string;
};

export const defaultFilters: FilterState = {
  period: "monthly",
  dateFrom: "",
  dateTo: "",
  line: ALL_LINES,
  shift: ALL_SHIFTS,
  stage: ALL_STAGES,
  machine: ALL_MACHINES,
  workCenter: ALL_WORK_CENTERS,
  material: ALL_MATERIALS,
};

/** Normalize a raw Stage value: collapse whitespace, drop null/empty. */
export function normalizeStage(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Collect the unique Stage values present in the dataset, sorted
 * alphabetically. The backend data is authoritative — new Stage values in the
 * Google Sheet automatically appear after the next data load/refresh.
 */
export function collectStages(records: DprRecord[]): string[] {
  const stageSet = new Set<string>();
  records.forEach((row) => {
    const stage = normalizeStage(row.rawStage);
    if (stage) stageSet.add(stage);
  });
  return [...stageSet].sort((a, b) => a.localeCompare(b));
}

/** Normalize a raw Machine value: collapse whitespace, drop null/empty. */
export function normalizeMachine(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Collect the unique Machine values present in the dataset, sorted
 * alphabetically. Dynamic — never hard-coded.
 */
export function collectMachines(records: DprRecord[]): string[] {
  const machineSet = new Set<string>();
  records.forEach((row) => {
    const machine = normalizeMachine(row.machineName);
    if (machine) machineSet.add(machine);
  });
  return [...machineSet].sort((a, b) => a.localeCompare(b));
}

/** ISO yyyy-mm-dd validation used for dataset date bounds. */
function isValidIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Minimum and maximum valid date in the dataset — the authoritative
 * latestSourceDate comes from the live data, never from the system clock.
 */
export function datasetDateBounds(records: DprRecord[]): { minDate: string; maxDate: string } {
  const dated = records
    .map((row) => row.date)
    .filter(isValidIsoDate)
    .sort((a, b) => a.localeCompare(b));
  return {
    minDate: dated[0] ?? "",
    maxDate: dated[dated.length - 1] ?? "",
  };
}

export type FilterOptions = {
  /** Earliest date in the dataset (ISO), empty when the dataset has no dates. */
  minDate: string;
  /** Latest date in the dataset (ISO) — the dynamic latestSourceDate. */
  maxDate: string;
  /** Business line labels present in the dataset (business lines first). */
  lines: string[];
  /** Fixed two-shift business model: Day (A), Night (B). */
  shifts: string[];
  /** Business materials present in the dataset. */
  materials: string[];
  /** Stage values found in the dataset (dynamic — never hard-coded). */
  stages: string[];
  /** Stage values actually present per normalized line label (line-aware). */
  stagesByLine: Record<string, string[]>;
  /** Machine values found dynamically in the dataset. */
  machines: string[];
  /** LEGACY: business work centers for the Work Center Analytics slide. */
  allWorkCenters: string[];
  /** LEGACY: work centers per line for the Work Center Analytics slide. */
  workCentersByLine: Record<string, string[]>;
};

export function buildFilterOptions(records: DprRecord[]): FilterOptions {
  const { minDate, maxDate } = datasetDateBounds(records);

  // Lines: business lines (in approved order) are always shown so the dropdown
  // always presents the full business taxonomy even when the current dataset
  // has no rows for some of them. Additional non-business line values found in
  // the dataset are appended so unknown lines are never silently lost.
  const lineSet = new Set<string>();
  records.forEach((row) => {
    const line = normalizeLine(row.lineName);
    if (line) lineSet.add(line);
  });
  const lines: string[] = [...BUSINESS_LINES];
  const extraLines = [...lineSet]
    .filter((line) => !BUSINESS_LINES.includes(line))
    .sort((a, b) => a.localeCompare(b));
  lines.push(...extraLines);

  // Materials: confirmed business materials present in the dataset first
  // (business order), then any other material values found so nothing is
  // silently discarded.
  const materialSet = new Set<string>();
  records.forEach((row) => {
    if (row.material) materialSet.add(row.material);
  });
  const businessMaterialsPresent = BUSINESS_MATERIALS.filter((m) => materialSet.has(m));
  const extraMaterials = [...materialSet]
    .filter((material) => !BUSINESS_MATERIALS.includes(material))
    .sort((a, b) => a.localeCompare(b));

  // Stages: computed from the ACTUAL dataset records (rawStage) — the backend
  // data is authoritative. No hard-coded Stage taxonomy. New values in the
  // Google Sheet appear automatically after the next load/refresh.
  const stages = collectStages(records);

  // Line-aware Stage options, calculated from actual records: selecting a
  // Line narrows the Stage dropdown to stages genuinely available for that
  // line. Lines without records legitimately yield an empty list.
  const stagesByLine: Record<string, string[]> = {};
  const allKnownLines = new Set<string>([...BUSINESS_LINES, ...lineSet]);
  allKnownLines.forEach((line) => {
    const stagesForLine = new Set<string>();
    records.forEach((row) => {
      if (normalizeLine(row.lineName) !== line) return;
      const stage = normalizeStage(row.rawStage);
      if (stage) stagesForLine.add(stage);
    });
    stagesByLine[line] = [...stagesForLine].sort((a, b) => a.localeCompare(b));
  });

  // Machines: dynamic unique Machine values from records (row.machineName).
  // Never hard-coded. Blank/null values omitted, sorted alphabetically.
  const machines = collectMachines(records);

  // LEGACY Work Center options (Work Center Analytics slide only).
  const allWorkCenters = [...BUSINESS_WORK_CENTERS];
  const workCentersByLine: Record<string, string[]> = {};
  allKnownLines.forEach((line) => {
    workCentersByLine[line] = [...BUSINESS_WORK_CENTERS];
  });

  return {
    minDate,
    maxDate,
    lines,
    shifts: [...BUSINESS_SHIFTS],
    materials: [...businessMaterialsPresent, ...extraMaterials],
    stages,
    stagesByLine,
    machines,
    allWorkCenters,
    workCentersByLine,
  };
}

/**
 * The single analytics filter pipeline. Order: Date → Line → Shift → Stage →
 * Machine → Material. Stage filters on raw source Stage, Machine on raw Machine.
 */
export function applyFilters(records: DprRecord[], filters: FilterState): DprRecord[] {
  return records.filter((row) => {
    // Date range (inclusive). Records without a parseable date cannot be
    // verified against an active range and are excluded while bounded.
    if (filters.dateFrom && (!row.date || row.date < filters.dateFrom)) return false;
    if (filters.dateTo && (!row.date || row.date > filters.dateTo)) return false;

    // Line: match on the normalized business label ("ERC" → "ERC Line").
    const linePass = filters.line === ALL_LINES || normalizeLine(row.lineName) === filters.line;

    // Shift: match on the normalized business label ("A" → "Day (A)").
    const shiftPass = filters.shift === ALL_SHIFTS || normalizeShift(row.shift) === filters.shift;

    // Stage: match the raw source Stage value directly. No Work Center mapping.
    const stagePass =
      filters.stage === ALL_STAGES || normalizeStage(row.rawStage) === normalizeStage(filters.stage);

    // Machine: match the source Machine value directly.
    const machinePass =
      filters.machine === ALL_MACHINES ||
      normalizeMachine(row.machineName) === normalizeMachine(filters.machine);

    const materialPass = filters.material === ALL_MATERIALS || row.material === filters.material;

    // LEGACY: workCenter is only ever non-default when the Work Center
    // Analytics slide drill-down set it.
    const workCenterPass =
      filters.workCenter === ALL_WORK_CENTERS || row.workCenter === filters.workCenter;

    return linePass && shiftPass && stagePass && machinePass && materialPass && workCenterPass;
  });
}