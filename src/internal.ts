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

export function requireString(
  value: unknown,
  label: string,
  fieldName: string,
  hint?: string,
): string {
  const suffix = hint ? `: ${hint}` : "";
  if (typeof value !== "string") {
    throw new Error(`${label} ${fieldName} is required${suffix}`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${label} ${fieldName} is required${suffix}`);
  }
  return trimmed;
}

export function optionalString(
  value: unknown,
  label: string,
  fieldName: string,
): string | undefined {
  if (value == null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${label} ${fieldName} must be a string`);
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function optionalStringArray(
  values: unknown,
  label: string,
  fieldName: string,
): string[] | undefined {
  if (values === undefined || values === null) {
    return undefined;
  }
  if (!Array.isArray(values)) {
    throw new Error(`${label} ${fieldName} must be an array of strings`);
  }
  return values
    .map((value) => {
      if (typeof value !== "string") {
        throw new Error(`${label} ${fieldName} must be an array of strings`);
      }
      return value.trim();
    })
    .filter((value) => value.length > 0);
}

export function optionalRecord(
  value: unknown,
  label: string,
  fieldName: string,
): JsonRecord | undefined {
  if (value == null) {
    return undefined;
  }
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
  if (value == null) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} ${fieldName} must be a finite number`);
  }
  return value;
}

export function assignPresentFields(
  payload: JsonRecord,
  fields: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) payload[key] = trimmed;
    } else if (Array.isArray(value)) {
      if (value.length > 0) payload[key] = value;
    } else {
      payload[key] = value;
    }
  }
}
