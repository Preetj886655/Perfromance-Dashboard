/**
 * Business dimension normalization for manufacturing filters.
 *
 * Converts raw source values to display/business values:
 * - Line: "ERC" → "ERC Line", "SKL" → "SKL Line", etc.
 * - Shift: "A" → "Day (A)", "B" → "Night (B)"
 * - Material: "MK3" → "MK-III", "MK5" → "MK-V"
 */

export const BUSINESS_LINES: string[] = [
  "ERC Line",
  "SKL Line",
  "BFS Line",
  "Injection Moulding",
];

/**
 * Maps raw Line values to display labels.
 * Unknown lines are displayed as-is (preserved).
 */
export const LINE_DISPLAY_MAP: Record<string, string> = {
  ERC: "ERC Line",
  SKL: "SKL Line",
  BFS: "BFS Line",
  "Injection Moulding": "Injection Moulding",
};

/**
 * Converts a raw line value to its display label.
 * Preserves unknown lines as-is.
 */
export function normalizeLine(rawLine: string | undefined): string | undefined {
  if (!rawLine || !rawLine.trim()) {
    return undefined;
  }
  const trimmed = rawLine.trim();
  return LINE_DISPLAY_MAP[trimmed] ?? trimmed;
}

/**
 * The two-shift business model: A = Day, B = Night.
 */
export const BUSINESS_SHIFTS: string[] = ["Day (A)", "Night (B)"];

export const SHIFT_DISPLAY_MAP: Record<string, string> = {
  A: "Day (A)",
  B: "Night (B)",
  Day: "Day (A)",
  Night: "Night (B)",
  "Day Shift": "Day (A)",
  "Night Shift": "Night (B)",
};

/**
 * Converts a raw shift value to its display label.
 * Unexpected shift values are preserved as-is for traceability.
 */
export function normalizeShift(rawShift: string | undefined): string | undefined {
  if (!rawShift || !rawShift.trim()) {
    return undefined;
  }
  const trimmed = rawShift.trim();
  return SHIFT_DISPLAY_MAP[trimmed] ?? trimmed;
}

/**
 * Maps raw Material/Part values to business Material labels.
 * Only CONFIRMED mappings are applied (MK3 → MK-III, MK5 → MK-V).
 * Unconfirmed part values (e.g. SKL12, SKL15, Liner Less) return undefined —
 * they are reported for business review rather than guessed.
 */
export const BUSINESS_MATERIALS: string[] = ["MK-III", "MK-V"];

export const MATERIAL_DISPLAY_MAP: Record<string, string> = {
  MK3: "MK-III",
  MK5: "MK-V",
};

/**
 * Converts a raw Part value to its Material display label.
 * Returns undefined when no confirmed mapping exists (Material = Unmapped).
 */
export function normalizeMaterial(rawPart: string | undefined): string | undefined {
  if (!rawPart || !rawPart.trim()) {
    return undefined;
  }
  const trimmed = rawPart.trim();
  return MATERIAL_DISPLAY_MAP[trimmed];
}

/**
 * Checks if a shift value maps to a recognized business shift.
 * Recognizes raw codes (A/B), words (Day/Night), and display labels ("Day (A)").
 */
export function isRecognizedShift(rawShift: string | undefined): boolean {
  if (!rawShift) return false;
  const trimmed = rawShift.trim();
  if (SHIFT_DISPLAY_MAP[trimmed]) return true;
  return Object.values(SHIFT_DISPLAY_MAP).includes(trimmed);
}