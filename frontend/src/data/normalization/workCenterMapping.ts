/**
 * Work Center Mapping Configuration
 *
 * Maps raw source Machine/Stage values to business Work Center categories.
 * Only CONFIRMED mappings are included. Raw machine values are always preserved
 * for traceability. Unmapped machines are explicitly labeled "Unmapped".
 */

export type WorkCenterMapping = {
  /** The canonical work center label shown in the dashboard. */
  workCenter: string;
};

/**
 * CONFIRMED mappings from raw Machine value → Work Center.
 *
 * These mappings are derived from business semantics where the relationship
 * between the raw machine name and the business work center is clear and
 * unambiguous. For example:
 * - "IBH" is itself a work center.
 * - "Quenching" is itself a work center.
 * - "Autocopying-N" machines belong to the "Autocopy" work center.
 * - "MPI" / "MPI 1" / "MPI 2" belong to the "MPI" work center.
 * - "Tampering Furnace" / "Tampering" both belong to "Tempering".
 */
export const WORK_CENTER_MAPPINGS: Record<string, WorkCenterMapping> = {
  // IBH is directly a work center
  "IBH": { workCenter: "IBH" },
  "Loading conveyor IBH": { workCenter: "IBH" },
  "IBH - Loading conveyor": { workCenter: "IBH" },

  // Quenching is directly a work center
  "Quenching": { workCenter: "Quenching" },

  // Autocopy / Autocopying machines map to Autocopy work center
  "Autocopying-1": { workCenter: "Autocopy" },
  "Autocopying-2": { workCenter: "Autocopy" },
  "Autocopying-3": { workCenter: "Autocopy" },
  "Autocopying-4": { workCenter: "Autocopy" },
  "Autocopying-5": { workCenter: "Autocopy" },
  "Autocopying-6": { workCenter: "Autocopy" },
  "Autocopying-7": { workCenter: "Autocopy" },
  "Autocopying-8": { workCenter: "Autocopy" },
  "Autocopying-9": { workCenter: "Autocopy" },

  // MPI machines map to MPI work center
  "MPI": { workCenter: "MPI" },
  "MPI 1": { workCenter: "MPI" },
  "MPI  1": { workCenter: "MPI" },
  "MPI 2": { workCenter: "MPI" },
};

/**
 * Maps a raw machine name to its canonical Work Center.
 * Returns "Unmapped" if no confirmed mapping exists.
 */
export function mapToWorkCenter(rawMachine: string | undefined): string {
  if (!rawMachine || !rawMachine.trim()) {
    return "Unmapped";
  }
  const trimmed = rawMachine.trim();
  // Direct match
  const direct = WORK_CENTER_MAPPINGS[trimmed];
  if (direct) {
    return direct.workCenter;
  }
  return "Unmapped";
}

/**
 * Returns all canonical work center values in the predefined business order.
 */
export const BUSINESS_WORK_CENTERS: string[] = [
  "Stock",
  "Bar Cropping",
  "Deburring (Chamfering)",
  "MPI",
  "Autocopy",
  "IBH",
  "Forging",
  "Quenching",
  "Tempering",
  "Linseed Oil",
  "Application & Deflection",
];

/**
 * Returns work centers ordered by the approved business taxonomy first,
 * then other discovered values alphabetically, with "Unmapped" last.
 */
export function sortWorkCenters(values: string[]): string[] {
  const known = BUSINESS_WORK_CENTERS.filter((wc) => values.includes(wc));
  const unknown = values
    .filter((value) => !BUSINESS_WORK_CENTERS.includes(value) && value !== "Unmapped")
    .sort((a, b) => a.localeCompare(b));
  const unmapped = values.includes("Unmapped") ? ["Unmapped"] : [];
  return [...known, ...unknown, ...unmapped];
}