export type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Converts a params object to sorted URLSearchParams.
 * Trims string values and omits undefined/empty-string entries.
 */
export function buildSearchParams(params?: object): URLSearchParams {
  const sp = new URLSearchParams();
  if (!params) return sp;
  for (const [key, value] of Object.entries(params).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) sp.set(key, trimmed);
    } else {
      sp.set(key, String(value));
    }
  }
  return sp;
}

/**
 * Validates an ID string and returns the trimmed value.
 * Throws if empty, non-string, or whitespace-only.
 */
export function requireId(id: unknown, label: string): string {
  if (!id || typeof id !== "string") {
    throw new Error(`${label} ID is required and must be a string`);
  }
  const trimmed = id.trim();
  if (trimmed.length === 0) {
    throw new Error(`${label} ID is required and must be a non-empty string`);
  }
  return trimmed;
}
