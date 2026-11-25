export type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Converts a params object to URLSearchParams with sorted keys, so equal
 * params always produce the same cache key. Trims strings and skips
 * undefined, null, and empty-string values.
 */
export function buildSearchParams(params?: object): URLSearchParams {
  const sp = new URLSearchParams();
  if (!params) return sp;
  const entries = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  for (const [key, value] of entries) {
    if (value === undefined || value === null) continue;
    const str = typeof value === "string" ? value.trim() : String(value);
    if (str.length > 0) sp.set(key, str);
  }
  return sp;
}

export function requireString(
  value: unknown,
  label: string,
  fieldName: string,
  hint?: string,
): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed.length === 0) {
    throw new Error(
      `${label} ${fieldName} is required${hint ? `: ${hint}` : ""}`,
    );
  }
  return trimmed;
}

export function requireId(id: unknown, label: string): string {
  return requireString(id, label, "ID");
}

/** Returns a trimmed string, or undefined for null/undefined/blank. */
export function optionalString(
  value: unknown,
  label: string,
  fieldName: string,
): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string") {
    throw new Error(`${label} ${fieldName} must be a string`);
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Returns trimmed, non-blank strings, or undefined for null/undefined. */
export function optionalStringArray(
  values: unknown,
  label: string,
  fieldName: string,
): string[] | undefined {
  if (values == null) return undefined;
  if (
    !Array.isArray(values) ||
    values.some((value) => typeof value !== "string")
  ) {
    throw new Error(`${label} ${fieldName} must be an array of strings`);
  }
  return (values as string[])
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export function optionalRecord(
  value: unknown,
  label: string,
  fieldName: string,
): JsonRecord | undefined {
  if (value == null) return undefined;
  if (!isRecord(value)) {
    throw new Error(`${label} ${fieldName} must be an object`);
  }
  return value;
}

export function optionalNumber(
  value: unknown,
  label: string,
  fieldName: string,
): number | undefined {
  if (value == null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} ${fieldName} must be a finite number`);
  }
  return value;
}

export function optionalBoolean(
  value: unknown,
  label: string,
  fieldName: string,
): boolean | undefined {
  if (value == null) return undefined;
  if (typeof value !== "boolean") {
    throw new Error(`${label} ${fieldName} must be a boolean`);
  }
  return value;
}

/** Copies fields into `payload`, skipping undefined values. */
export function assignDefined(
  payload: JsonRecord,
  fields: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) payload[key] = value;
  }
}
