/**
 * Data Classification & Analysis Mode Detection
 * 
 * Analyzes a dataset to:
 * 1. Classify available dimensions
 * 2. Determine analysis mode
 * 3. Detect missing critical fields
 * 4. Generate mode-specific insights
 */

import type { DprRecord } from "../normalization/normalizeDprData";

export type AnalysisMode =
  | "oee"
  | "production-downtime-quality"
  | "production-downtime"
  | "production-quality"
  | "production-only"
  | "downtime-only"
  | "quality-only"
  | "generic-manufacturing";

export type DataDimension =
  | "date"
  | "production"
  | "target"
  | "downtime"
  | "rejection"
  | "line"
  | "machine"
  | "shift"
  | "part"
  | "operator"
  | "department"
  | "availability"
  | "performance"
  | "quality"
  | "oee";

export interface DataClassification {
  // Detected dimensions
  dimensions: {
    hasDates: boolean;
    hasProduction: boolean;
    hasTargetProduction: boolean;
    hasDowntime: boolean;
    hasRejection: boolean;
    hasLines: boolean;
    hasMachines: boolean;
    hasShifts: boolean;
    hasParts: boolean;
    hasOperators: boolean;
    hasDepartments: boolean;
    hasAvailability: boolean;
    hasPerformance: boolean;
    hasQuality: boolean;
    hasOee: boolean;
  };

  // Detected metrics
  metrics: {
    availableMetrics: DataDimension[];
    missingMetrics: DataDimension[];
  };

  // Analysis mode
  mode: AnalysisMode;
  modeDescription: string;

  // Mode capabilities
  capabilities: {
    canCalculateOee: boolean;
    canCalculateProduction: boolean;
    canAnalyzeQuality: boolean;
    canAnalyzeDowntime: boolean;
    canCompareDimensions: boolean;
  };

  // Data signals
  signals: {
    totalRecords: number;
    uniqueDates: number;
    uniqueMachines: number;
    uniqueLines: number;
    uniqueShifts: number;
    uniqueParts: number;
    totalProduction: number;
    totalDowntimeMinutes: number;
    totalRejection: number;
  };

  // Recommendations
  recommendations: string[];

  // Data freshness
  dateRange: {
    earliest?: string;
    latest?: string;
    span?: number;
  };
}

/**
 * Classify dataset and determine analysis capabilities
 */
export function classifyDataset(records: DprRecord[]): DataClassification {
  if (records.length === 0) {
    return getEmptyClassification();
  }

  // Detect dimensions
  const dimensions = detectDimensions(records);

  // Determine analysis mode
  const mode = determineAnalysisMode(dimensions);

  // Calculate capabilities
  const capabilities = determineCapabilities(dimensions);

  // Calculate signals
  const signals = calculateSignals(records);

  // Generate recommendations
  const recommendations = generateRecommendations(records, dimensions, mode);

  // Calculate date range
  const dateRange = calculateDateRange(records);

  return {
    dimensions,
    metrics: {
      availableMetrics: getAvailableMetrics(dimensions),
      missingMetrics: getMissingMetrics(dimensions),
    },
    mode,
    modeDescription: getAnalysisModeDescription(mode),
    capabilities,
    signals,
    recommendations,
    dateRange,
  };
}

/**
 * Detect available dimensions in dataset
 */
function detectDimensions(records: DprRecord[]) {
  const nonNullRecords = records.filter(
    (r) =>
      (r.date && String(r.date).trim()) ||
      (r.actualProductionQty && r.actualProductionQty > 0) ||
      (r.totalIdleTimeMinutes && r.totalIdleTimeMinutes > 0) ||
      (r.totalRejectionQty && r.totalRejectionQty > 0)
  );

  const hasData = nonNullRecords.length > 0;

  const hasDates =
    hasData &&
    nonNullRecords.some((r) => r.date && String(r.date).trim() !== "");

  const hasProduction =
    hasData &&
    nonNullRecords.some(
      (r) => typeof r.actualProductionQty === "number" && r.actualProductionQty > 0
    );

  const hasTargetProduction =
    hasData &&
    nonNullRecords.some(
      (r) =>
        (typeof r.targetProduction === "number" && r.targetProduction > 0) ||
        (typeof r.targetQtyPerHour === "number" && r.targetQtyPerHour > 0)
    );

  const hasDowntime =
    hasData &&
    nonNullRecords.some(
      (r) => typeof r.totalIdleTimeMinutes === "number" && r.totalIdleTimeMinutes > 0
    );

  const hasRejection =
    hasData &&
    nonNullRecords.some(
      (r) => typeof r.totalRejectionQty === "number" && r.totalRejectionQty > 0
    );

  const hasLines =
    hasData &&
    nonNullRecords.some((r) => r.lineName && String(r.lineName).trim() !== "");

  const hasMachines =
    hasData &&
    nonNullRecords.some((r) => r.machineName && String(r.machineName).trim() !== "");

  const hasShifts =
    hasData &&
    nonNullRecords.some((r) => r.shift && String(r.shift).trim() !== "");

  const hasParts =
    hasData &&
    nonNullRecords.some((r) => r.partName && String(r.partName).trim() !== "");

  const hasOperators =
    hasData &&
    nonNullRecords.some((r) => r.operatorName && String(r.operatorName).trim() !== "");

  const hasDepartments = false; // Not currently in DprRecord

  const hasAvailability =
    hasData &&
    nonNullRecords.some(
      (r) => typeof r.availabilityRatio === "number" && r.availabilityRatio > 0
    );

  const hasPerformance =
    hasData &&
    nonNullRecords.some(
      (r) => typeof r.performanceRatio === "number" && r.performanceRatio > 0
    );

  const hasQuality =
    hasData &&
    nonNullRecords.some(
      (r) => typeof r.qualityRatio === "number" && r.qualityRatio > 0
    );

  const hasOee =
    hasAvailability && hasPerformance && hasQuality;

  return {
    hasDates,
    hasProduction,
    hasTargetProduction,
    hasDowntime,
    hasRejection,
    hasLines,
    hasMachines,
    hasShifts,
    hasParts,
    hasOperators,
    hasDepartments,
    hasAvailability,
    hasPerformance,
    hasQuality,
    hasOee,
  };
}

/**
 * Determine analysis mode based on available data
 */
function determineAnalysisMode(dimensions: ReturnType<typeof detectDimensions>): AnalysisMode {
  // OEE mode requires all three components
  if (dimensions.hasOee) {
    return "oee";
  }

  // Production + Downtime + Quality
  if (dimensions.hasProduction && dimensions.hasDowntime && dimensions.hasRejection) {
    return "production-downtime-quality";
  }

  // Production + Downtime
  if (dimensions.hasProduction && dimensions.hasDowntime) {
    return "production-downtime";
  }

  // Production + Quality
  if (dimensions.hasProduction && dimensions.hasRejection) {
    return "production-quality";
  }

  // Production only
  if (dimensions.hasProduction) {
    return "production-only";
  }

  // Downtime only
  if (dimensions.hasDowntime) {
    return "downtime-only";
  }

  // Quality only
  if (dimensions.hasRejection) {
    return "quality-only";
  }

  // Generic manufacturing
  return "generic-manufacturing";
}

/**
 * Determine capabilities based on data dimensions
 */
function determineCapabilities(dimensions: ReturnType<typeof detectDimensions>) {
  return {
    canCalculateOee: dimensions.hasOee,
    canCalculateProduction: dimensions.hasProduction,
    canAnalyzeQuality: dimensions.hasRejection,
    canAnalyzeDowntime: dimensions.hasDowntime,
    canCompareDimensions: (dimensions.hasMachines || dimensions.hasLines) && dimensions.hasProduction,
  };
}

/**
 * Calculate data signals
 */
function calculateSignals(records: DprRecord[]) {
  const nonNullRecords = records.filter((r) => r.date || r.actualProductionQty || r.totalIdleTimeMinutes);

  const uniqueDates = new Set(nonNullRecords.map((r) => r.date).filter((d) => d)).size;
  const uniqueMachines = new Set(
    nonNullRecords.map((r) => r.machineName).filter((m) => m)
  ).size;
  const uniqueLines = new Set(nonNullRecords.map((r) => r.lineName).filter((l) => l)).size;
  const uniqueShifts = new Set(nonNullRecords.map((r) => r.shift).filter((s) => s)).size;
  const uniqueParts = new Set(nonNullRecords.map((r) => r.partName).filter((p) => p)).size;

  const totalProduction = nonNullRecords.reduce(
    (sum, r) => sum + (r.actualProductionQty || 0),
    0
  );
  const totalDowntimeMinutes = nonNullRecords.reduce(
    (sum, r) => sum + (r.totalIdleTimeMinutes || 0),
    0
  );
  const totalRejection = nonNullRecords.reduce(
    (sum, r) => sum + (r.totalRejectionQty || 0),
    0
  );

  return {
    totalRecords: nonNullRecords.length,
    uniqueDates,
    uniqueMachines,
    uniqueLines,
    uniqueShifts,
    uniqueParts,
    totalProduction,
    totalDowntimeMinutes,
    totalRejection,
  };
}

/**
 * Calculate date range
 */
function calculateDateRange(records: DprRecord[]) {
  const dates = records
    .map((r) => r.date)
    .filter((d) => d && String(d).trim() !== "")
    .sort();

  if (dates.length === 0) {
    return { earliest: undefined, latest: undefined, span: undefined };
  }

  const earliest = dates[0];
  const latest = dates[dates.length - 1];

  // Calculate span in days
  const span = earliest && latest 
    ? Math.floor((new Date(latest).getTime() - new Date(earliest).getTime()) / (1000 * 60 * 60 * 24)) + 1
    : 1;

  return { earliest, latest, span };
}

/**
 * Generate recommendations
 */
function generateRecommendations(
  records: DprRecord[],
  dimensions: ReturnType<typeof detectDimensions>,
  mode: AnalysisMode
): string[] {
  const recommendations: string[] = [];

  // OEE recommendations
  if (mode === "oee") {
    recommendations.push("OEE data available - Availability, Performance, and Quality analysis enabled");
    if (!dimensions.hasTargetProduction) {
      recommendations.push("Add target production data for enhanced production achievement tracking");
    }
  }

  // Data dimension recommendations
  if (!dimensions.hasDates) {
    recommendations.push("Add production dates to enable time-series analysis");
  }

  if (!dimensions.hasMachines && !dimensions.hasLines) {
    recommendations.push("Add machine or line information for dimension-based comparison");
  }

  if (!dimensions.hasShifts) {
    recommendations.push("Add shift information to analyze performance across shifts");
  }

  if (!dimensions.hasParts) {
    recommendations.push("Add part/product information to track quality by product type");
  }

  // Data quality recommendations
  if (records.length < 10) {
    recommendations.push("Limited data - At least 10 records recommended for meaningful analysis");
  }

  const nullPercentage = (records.filter((r) => !r.date && !r.actualProductionQty && !r.totalIdleTimeMinutes).length / records.length) * 100;
  if (nullPercentage > 20) {
    recommendations.push(`${nullPercentage.toFixed(0)}% of records have missing key fields`);
  }

  return recommendations;
}

/**
 * Get available metrics list
 */
function getAvailableMetrics(dimensions: ReturnType<typeof detectDimensions>): DataDimension[] {
  const metrics: DataDimension[] = [];

  if (dimensions.hasDates) metrics.push("date");
  if (dimensions.hasProduction) metrics.push("production");
  if (dimensions.hasTargetProduction) metrics.push("target");
  if (dimensions.hasDowntime) metrics.push("downtime");
  if (dimensions.hasRejection) metrics.push("rejection");
  if (dimensions.hasLines) metrics.push("line");
  if (dimensions.hasMachines) metrics.push("machine");
  if (dimensions.hasShifts) metrics.push("shift");
  if (dimensions.hasParts) metrics.push("part");
  if (dimensions.hasOperators) metrics.push("operator");
  if (dimensions.hasDepartments) metrics.push("department");
  if (dimensions.hasAvailability) metrics.push("availability");
  if (dimensions.hasPerformance) metrics.push("performance");
  if (dimensions.hasQuality) metrics.push("quality");
  if (dimensions.hasOee) metrics.push("oee");

  return metrics;
}

/**
 * Get missing metrics list
 */
function getMissingMetrics(dimensions: ReturnType<typeof detectDimensions>): DataDimension[] {
  const missing: DataDimension[] = [];

  // Core metrics that are often needed
  if (!dimensions.hasDates) missing.push("date");
  if (!dimensions.hasProduction) missing.push("production");
  if (!dimensions.hasDowntime) missing.push("downtime");
  if (!dimensions.hasRejection) missing.push("rejection");
  if (!dimensions.hasAvailability) missing.push("availability");
  if (!dimensions.hasPerformance) missing.push("performance");
  if (!dimensions.hasQuality) missing.push("quality");

  return missing;
}

/**
 * Get human-readable analysis mode description
 */
export function getAnalysisModeDescription(mode: AnalysisMode): string {
  const descriptions: Record<AnalysisMode, string> = {
    oee: "OEE Analysis (Availability, Performance, Quality)",
    "production-downtime-quality": "Manufacturing Performance (Production, Downtime, Quality)",
    "production-downtime": "Production & Downtime Analysis",
    "production-quality": "Production & Quality Analysis",
    "production-only": "Production Analysis Only",
    "downtime-only": "Downtime Analysis Only",
    "quality-only": "Quality Analysis Only",
    "generic-manufacturing": "Generic Manufacturing Overview",
  };

  return descriptions[mode];
}

/**
 * Get empty classification for no data
 */
function getEmptyClassification(): DataClassification {
  return {
    dimensions: {
      hasDates: false,
      hasProduction: false,
      hasTargetProduction: false,
      hasDowntime: false,
      hasRejection: false,
      hasLines: false,
      hasMachines: false,
      hasShifts: false,
      hasParts: false,
      hasOperators: false,
      hasDepartments: false,
      hasAvailability: false,
      hasPerformance: false,
      hasQuality: false,
      hasOee: false,
    },
    metrics: {
      availableMetrics: [],
      missingMetrics: ["date", "production", "downtime", "rejection", "availability", "performance", "quality"],
    },
    mode: "generic-manufacturing",
    modeDescription: "Generic Manufacturing Overview",
    capabilities: {
      canCalculateOee: false,
      canCalculateProduction: false,
      canAnalyzeQuality: false,
      canAnalyzeDowntime: false,
      canCompareDimensions: false,
    },
    signals: {
      totalRecords: 0,
      uniqueDates: 0,
      uniqueMachines: 0,
      uniqueLines: 0,
      uniqueShifts: 0,
      uniqueParts: 0,
      totalProduction: 0,
      totalDowntimeMinutes: 0,
      totalRejection: 0,
    },
    recommendations: ["Upload manufacturing data to generate analytics"],
    dateRange: {
      earliest: undefined,
      latest: undefined,
      span: undefined,
    },
  };
}
