/**
 * Canonical work-center resolver for the operational dashboard.
 *
 * Raw Stage and Machine values remain available on each normalized record, while
 * dashboard groupings use these stable business labels.
 */

export type WorkCenterMapping = { workCenter: string };

const NORMALIZE = (value: string): string =>
  value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");

const directMappings: Record<string, string> = {
  ibh: "IBH",
  "loading conveyor ibh": "IBH",
  quenching: "Heat Treatment",
  "tampering furnace": "Heat Treatment",
  tempering: "Heat Treatment",
  "tampering": "Heat Treatment",
  packing: "Packing",
};

/**
 * Resolve a raw Stage and Machine pair. Stage is the primary signal; machine
 * aliases fill gaps where the source stage is abbreviated or inconsistent.
 */
export function mapToWorkCenter(rawMachine?: string, rawStage?: string): string {
  const machine = NORMALIZE(rawMachine ?? "");
  const stage = NORMALIZE(rawStage ?? "");
  if (!machine && !stage) return "Unmapped";

  if (directMappings[stage]) return directMappings[stage];
  if (directMappings[machine]) return directMappings[machine];

  if (stage === "cut bar" || /bar crop+p(?:er|ing)/.test(machine) || machine.includes("bar corpper") || /(?:^|\s)bar cropper\s*[123]/.test(machine)) {
    return "Bar Cropping (BC)";
  }
  if (stage === "deburring" || /^db\s*[1-4]$/.test(machine) || machine === "deburring") {
    return "Deburring (DB)";
  }
  if (stage === "mpi" || /^mpi(?:\s*[1-4])?$/.test(machine)) {
    return "MPI Inspection";
  }
  if (stage === "turned bar") {
    if (machine.startsWith("autocopying") || machine.startsWith("acm ")) return "Autocopy Turning";
    if (machine.startsWith("w cnc") || machine.startsWith("cnc ") || machine === "sikka1") return "CNC Turning";
  }
  if (stage === "clip" || stage === "forming") {
    if (/line\s*[12]|press line\s*(e1|p2)/.test(machine)) return "Clip Forming";
  }
  if (stage === "tampering furnace" || stage === "tempering furnace" || stage === "quenching") {
    return "Heat Treatment";
  }
  if (stage === "packing") return "Packing";

  if (machine.startsWith("autocopying") || machine.startsWith("acm ")) return "Autocopy Turning";
  if (machine.startsWith("w cnc") || machine.startsWith("cnc ") || machine === "sikka1") return "CNC Turning";
  if (/^mpi(?:\s*[1-4])?$/.test(machine)) return "MPI Inspection";
  if (/^db\s*[1-4]$/.test(machine)) return "Deburring (DB)";
  if (machine.includes("bar cropper") || machine.includes("bar cropping")) return "Bar Cropping (BC)";
  if (machine === "line 1" || machine === "line 2" || machine === "press line e1" || machine === "press line p2") return "Clip Forming";

  return "Unmapped";
}

export const BUSINESS_WORK_CENTERS: string[] = [
  "Bar Cropping (BC)",
  "Deburring (DB)",
  "MPI Inspection",
  "CNC Turning",
  "Autocopy Turning",
  "Clip Forming",
  "Heat Treatment",
  "Packing",
  "IBH",
];

export function sortWorkCenters(values: string[]): string[] {
  const known = BUSINESS_WORK_CENTERS.filter((workCenter) => values.includes(workCenter));
  const unknown = values
    .filter((value) => !BUSINESS_WORK_CENTERS.includes(value) && value !== "Unmapped")
    .sort((a, b) => a.localeCompare(b));
  return [...known, ...unknown, ...(values.includes("Unmapped") ? ["Unmapped"] : [])];
}
