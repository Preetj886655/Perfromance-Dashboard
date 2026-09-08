/**
 * Business dimension data quality analysis.
 *
 * Understands the manufacturing record model (Line / Shift / Work Center /
 * Material) and reports honest quality findings. Legitimate blanks are not
 * treated as errors — e.g. a downtime-only row may have no Part/Material,
 * and a production-only row may have no Downtime.
 */

import type { DprRecord } from "../normalization/normalizeDprData";
import { BUSINESS_LINES, isRecognizedShift, normalizeLine } from "../normalization/lineShiftMaterial";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type BusinessDataQuality = {
  totalRecords: number;
  missingDate: number;
  invalidDate: number;
  missingLine: number;
  unknownLineValues: string[];
  missingShift: number;
  unexpectedShiftValues: string[];
  unmappedWorkCenter: number;
  unmappedWorkCenterMachines: string[];
  unmappedMaterialPartValues: string[];
  duplicateRows: number;
};

export function analyzeBusinessDataQuality(records: DprRecord[]): BusinessDataQuality {
  let missingDate = 0;
  let invalidDate = 0;
  let missingLine = 0;
  let missingShift = 0;
  let unmappedWorkCenter = 0;
  let duplicateRows = 0;

  const unknownLines = new Set<string>();
  const unexpectedShifts = new Set<string>();
  const unmappedMachines = new Set<string>();
  const unmappedMaterialParts = new Set<string>();
  const seenRowSignatures = new Map<string, number>();

  records.forEach((row) => {
    // Date checks
    if (!row.date || !row.date.trim()) {
      missingDate += 1;
    } else if (!ISO_DATE_PATTERN.test(row.date) || Number.isNaN(new Date(`${row.date}T00:00:00`).getTime())) {
      invalidDate += 1;
    }

    // Line checks — raw values that normalize to a business line are known
    const rawLine = row.lineName?.trim();
    if (!rawLine) {
      missingLine += 1;
    } else {
      const normalizedLine = normalizeLine(rawLine);
      if (!normalizedLine || !BUSINESS_LINES.includes(normalizedLine)) {
        unknownLines.add(rawLine);
      }
    }

    // Shift checks — only A/B (or Day/Night equivalents) are recognized
    const rawShift = row.shift?.trim();
    if (!rawShift) {
      missingShift += 1;
    } else if (!isRecognizedShift(rawShift)) {
      unexpectedShifts.add(rawShift);
    }

    // Work Center checks — "Unmapped" (or absent) means no confirmed mapping
    if (!row.workCenter || row.workCenter === "Unmapped") {
      unmappedWorkCenter += 1;
      const machine = row.machineName?.trim() || row.machineNo?.trim();
      if (machine) {
        unmappedMachines.add(machine);
      }
    }

    // Material checks — a Part value without a confirmed material mapping
    // needs business review. Rows without any Part (e.g. downtime-only) are
    // legitimate and are NOT counted.
    const part = row.partName?.trim() || row.partNo?.trim();
    if (part && !row.material) {
      unmappedMaterialParts.add(part);
    }

    // Duplicate rows — identical raw source content. Records without raw
    // content (e.g. demo data) are skipped.
    if (row.raw && Object.keys(row.raw).length > 0) {
      const signature = JSON.stringify(row.raw);
      const count = seenRowSignatures.get(signature) ?? 0;
      if (count === 1) {
        duplicateRows += 1;
      }
      seenRowSignatures.set(signature, count + 1);
    }
  });

  return {
    totalRecords: records.length,
    missingDate,
    invalidDate,
    missingLine,
    unknownLineValues: [...unknownLines].sort((a, b) => a.localeCompare(b)),
    missingShift,
    unexpectedShiftValues: [...unexpectedShifts].sort((a, b) => a.localeCompare(b)),
    unmappedWorkCenter,
    unmappedWorkCenterMachines: [...unmappedMachines].sort((a, b) => a.localeCompare(b)),
    unmappedMaterialPartValues: [...unmappedMaterialParts].sort((a, b) => a.localeCompare(b)),
    duplicateRows,
  };
}