export type WorksheetRoute = {
  worksheetKey: string;
  params: URLSearchParams;
};

export function parseLineTrackerWorksheetRoute(hash: string): WorksheetRoute | null {
  const match = hash.match(/^#\/line-tracker\/worksheet\/([a-z0-9-]+)(?:\?(.*))?$/);
  if (!match) return null;
  return {
    worksheetKey: match[1],
    params: new URLSearchParams(match[2] ?? ""),
  };
}

export function buildLineTrackerWorksheetHash(
  worksheetKey: string,
  params: Record<string, string | null | undefined> = {},
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const suffix = query.toString();
  return `#/line-tracker/worksheet/${worksheetKey}${suffix ? `?${suffix}` : ""}`;
}
